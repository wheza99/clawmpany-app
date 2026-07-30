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

export interface ChatStreamOptions {
  signal?: AbortSignal;
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

  try {
    bumpIdle();

    let res: Response;
    try {
      res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
        signal: ctl.signal,
      });
    } catch {
      if (idleFired) throw new Error("paw.wheza.id tidak merespons (timeout).");
      throw new Error("Tidak bisa menghubungi paw.wheza.id.");
    }

    if (!res.ok) throw new Error(await describeHttpError(res));
    if (!res.body) throw new Error("paw.wheza.id tidak mengirim aliran balasan.");

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
        return;
      }

      if (type === "text" && typeof e.text === "string") {
        const id = str(e.msg_id) ?? lastBlock;
        if (!id) return;
        if (!kindOf.has(id)) kindOf.set(id, "message");
        touch(id);
        textOf.set(id, e.delta === false ? e.text : (textOf.get(id) ?? "") + e.text);
        const kind = kindOf.get(id);
        if (kind === "message") opts.onText?.(join("message"));
        else opts.onReasoning?.(join("reasoning"));
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
    if (!out) throw new Error("paw.wheza.id membalas tanpa teks.");
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
    return "Belum terautentikasi — periksa PAW_AUTH_TOKEN di server.";
  if (res.status === 404) return "Endpoint tidak tersedia di paw.wheza.id.";
  if (res.status >= 500) return "paw.wheza.id sedang tidak bisa dihubungi.";
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
