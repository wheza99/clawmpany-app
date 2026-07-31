// Client streaming client for /api/chat.
//
// This is a faithful port of ClawCity's src/agents/hub.ts chatStream(): the
// QwenPaw SSE stream mixes append/replace text events and interleaves
// reasoning blocks with message blocks, so the parser keeps a per-block map
// (id → kind + accumulated text) and reconstructs the visible answer in the
// order blocks first appeared. `onText`/`onReasoning` receive the FULL text so
// far — callers overwrite, never append.

const CHAT_ENDPOINT = "/api/chat";
const STREAM_IDLE_MS = 90_000;

/**
 * Tahap sebuah giliran, seperti yang benar-benar bisa dibaca dari alirannya —
 * bukan tebakan berbasis waktu:
 *
 *   connecting → permintaan dikirim, header balasan belum datang
 *   waiting    → tersambung, belum ada satu token pun
 *   thinking   → blok `reasoning` mengalir (agent masih menalar)
 *   writing    → blok `message` mengalir (jawaban sudah ditulis)
 *
 * Ini yang membuat penantian bisa dijelaskan. Kursor berkedip cuma bilang
 * "belum selesai"; keempat tahap ini bilang APA yang sedang terjadi, sehingga
 * jeda 20 detik karena agent sedang menalar tidak terbaca seperti aplikasi
 * yang menggantung.
 */
export type PawPhase = "connecting" | "waiting" | "thinking" | "writing";

export interface ChatStreamOptions {
  signal?: AbortSignal;
  /**
   * Karyawan yang dituju. Server MEMERIKSA ULANG id ini terhadap roster kantor
   * si pemanggil — nilai di sini adalah permintaan, bukan izin.
   */
  agentId?: string;
  /**
   * Giliran pembuka: `message` diabaikan dan SERVER yang menyusun instruksinya
   * (lihat lib/prompt.ts). Isi instruksi itu tidak pernah menyentuh browser,
   * jadi ia tidak bisa dibaca dari devtools maupun ditukar dari sisi klien.
   */
  prime?: boolean;
  /**
   * Layar ini bisa berpindah karyawan. Server menambahkan daftar kolega +
   * aturan penanda `@alih:` ke instruksi pembuka — hanya berpengaruh bersama
   * `prime`. Hanya klien yang tahu layar mana yang menyediakan perpindahan.
   */
  switching?: boolean;
  /** Tahap giliran ini berubah. Dipakai untuk indikator "sedang apa". */
  onPhase?: (phase: PawPhase) => void;
  /** Full visible answer so far (overwritten each delta, never appended). */
  onText?: (fullText: string) => void;
  /** Full reasoning text so far (collapsed "thinking" block). */
  onReasoning?: (fullReasoning: string) => void;
}

type BlockKind = "reasoning" | "message";

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function collectFinal(output: unknown[]): string {
  let out = "";
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    if (it.type === "reasoning") continue;
    if (!Array.isArray(it.content)) continue;
    for (const c of it.content) {
      if (!c || typeof c !== "object") continue;
      const cc = c as Record<string, unknown>;
      if (cc.type === "text" && typeof cc.text === "string") out += cc.text;
    }
  }
  return out;
}

function failureMessage(e: Record<string, unknown>): string {
  const err = e.error;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const m = str((err as Record<string, unknown>).message);
    if (m) return m;
  }
  return "paw.wheza.id gagal memproses pesan.";
}

/**
 * Send `message` to the chat proxy and stream the reply back.
 *
 * Returns the final visible answer text. Throws on network failure, timeout,
 * or a `status:"failed"` event from QwenPaw — the caller renders the thrown
 * message as an error row.
 *
 * Dengan `opts.prime`, `message` boleh kosong: yang dikirim ke agent disusun
 * server dari keadaan kantor, dan hanya JAWABANNYA yang tampil di transkrip.
 */
export async function chatStream(
  message: string,
  sessionId: string,
  opts: ChatStreamOptions = {},
): Promise<string> {
  const ctl = new AbortController();
  const abortOuter = (): void => ctl.abort();
  opts.signal?.addEventListener("abort", abortOuter);

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let idleFired = false;
  const bumpIdle = (): void => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleFired = true;
      ctl.abort();
    }, STREAM_IDLE_MS);
  };

  // Tahap hanya dilaporkan saat BERUBAH, jadi pemanggil boleh memasangnya
  // langsung ke state React tanpa memicu render per token.
  let phase: PawPhase | null = null;
  const setPhase = (next: PawPhase): void => {
    if (phase === next) return;
    phase = next;
    opts.onPhase?.(next);
  };

  try {
    bumpIdle();
    setPhase("connecting");

    let res: Response;
    try {
      res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          sessionId,
          agentId: opts.agentId,
          prime: opts.prime,
          switching: opts.switching,
        }),
        signal: ctl.signal,
      });
    } catch {
      if (idleFired) throw new Error("paw.wheza.id is not responding (timeout).");
      throw new Error("Could not reach paw.wheza.id.");
    }

    if (!res.ok) throw new Error(await describeHttpError(res));
    if (!res.body) throw new Error("paw.wheza.id sent no response stream.");
    setPhase("waiting");

    const kindOf = new Map<string, BlockKind>();
    const textOf = new Map<string, string>();
    const order: string[] = [];
    let lastBlock: string | null = null;
    let finalText: string | null = null;
    let failure: string | null = null;

    const touch = (id: string): void => {
      if (!order.includes(id)) order.push(id);
    };
    const join = (kind: BlockKind): string =>
      order
        .filter((id) => kindOf.get(id) === kind)
        .map((id) => textOf.get(id) ?? "")
        .join("");

    const handleLine = (line: string): void => {
      const t = line.trim();
      if (!t.startsWith("data:")) return;
      const payload = t.slice(5).trim();
      if (!payload || payload === "[DONE]") return;

      let e: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(payload);
        if (!parsed || typeof parsed !== "object") return;
        e = parsed as Record<string, unknown>;
      } catch {
        return;
      }

      const type = str(e.type);
      const status = str(e.status);

      if (status === "failed") {
        failure = failureMessage(e);
        return;
      }
      if (type === "turn_usage") return;

      if (e.object === "message" && (type === "reasoning" || type === "message")) {
        const id = str(e.id);
        if (!id) return;
        kindOf.set(id, type as BlockKind);
        touch(id);
        lastBlock = id;
        // Blok yang DIBUKA sudah cukup untuk mengumumkan tahapnya — menunggu
        // token pertama membuat indikator ketinggalan satu langkah, dan blok
        // reasoning yang panjang justru bagian yang paling perlu dijelaskan.
        setPhase(type === "reasoning" ? "thinking" : "writing");
        return;
      }

      if (type === "text" && typeof e.text === "string") {
        const id = str(e.msg_id) ?? lastBlock;
        if (!id) return;
        if (!kindOf.has(id)) kindOf.set(id, "message");
        touch(id);
        textOf.set(id, e.delta === false ? e.text : (textOf.get(id) ?? "") + e.text);
        const kind = kindOf.get(id);
        if (kind === "message") {
          setPhase("writing");
          opts.onText?.(join("message"));
        } else {
          setPhase("thinking");
          opts.onReasoning?.(join("reasoning"));
        }
        return;
      }

      if (e.object === "response" && status === "completed" && Array.isArray(e.output)) {
        finalText = collectFinal(e.output);
      }
    };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bumpIdle();
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      }
      buf += decoder.decode();
      if (buf.trim()) handleLine(buf);
    } catch {
      if (idleFired) throw new Error("paw.wheza.id berhenti merespons di tengah balasan.");
      if (opts.signal?.aborted) throw new Error("Permintaan dibatalkan.");
      throw new Error("Aliran balasan paw.wheza.id terputus.");
    }

    if (failure) throw new Error(failure);

    const out = (finalText ?? join("message")).trim();
    if (!out) throw new Error("paw.wheza.id replied with no text.");
    opts.onText?.(out);
    if (join("reasoning").trim()) opts.onReasoning?.(join("reasoning").trim());
    return out;
  } finally {
    clearTimeout(idleTimer);
    opts.signal?.removeEventListener("abort", abortOuter);
  }
}

async function describeHttpError(res: Response): Promise<string> {
  try {
    const parsed: unknown = JSON.parse(await res.text());
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const detail = str(obj.error) || str(obj.detail) || str(obj.message);
      if (detail) return detail;
    }
  } catch {
    /* not JSON — fall through to a status-based message */
  }
  if (res.status === 401 || res.status === 403)
    return "Not authenticated — check PAW_AUTH_TOKEN on the server.";
  if (res.status === 404) return "That endpoint does not exist on paw.wheza.id.";
  if (res.status >= 500) return "paw.wheza.id cannot be reached right now.";
  return `paw.wheza.id membalas ${res.status}.`;
}

/** A reasonably unique id for messages rendered in the transcript. */
export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A fresh session id; sent on every chat turn so QwenPaw keeps the thread. */
export function newSessionId(): string {
  return `clawmpany-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
