// ────────────────────────────────────────────────────────────────
// lib/qwenpaw.ts — SERVER ONLY. Satu-satunya jalur ke instance QwenPaw.
//
// Token tidak pernah menyentuh browser: modul ini hanya diimpor dari Route
// Handler / Server Component, dan browser bicara ke /api/* milik app ini.
//
// Endpoint di bawah DIVERIFIKASI langsung dengan curl ke paw.wheza.id
// (2026-07-31), bukan disalin dari dokumentasi — dokumentasi QwenPaw meleset
// di beberapa tempat. Peta aslinya ada di clawcity/server/src/services/qwenpaw.ts.
//
//   GET    /api/agents                       → {agents:[…]}
//   POST   /api/agents           {id,name,language}
//   PUT    /api/agents/{id}      {id,name}
//   DELETE /api/agents/{id}
//   GET    /api/workspace/files              (header X-Agent-Id) → ARRAY
//   GET    /api/workspace/files/{name}       → {content}   404 = belum ada
//   PUT    /api/workspace/files/{name}       {content}
//   GET    /api/agents/{id}/chats            → ARRAY sesi
//   GET    /api/agents/{id}/chats/{chatId}   → {messages:[…]}
//   GET    /api/agents/{id}/cron/jobs        → ARRAY job  (BUKAN {jobs:[…]})
//   GET    /api/mcp                          → ARRAY server MCP
// ────────────────────────────────────────────────────────────────
import "server-only";

const BASE = (
  process.env.QWENPAW_URL ??
  process.env.PAW_URL ??
  "https://paw.wheza.id"
).replace(/\/$/, "");

const TOKEN = process.env.QWENPAW_AUTH_TOKEN ?? process.env.PAW_AUTH_TOKEN ?? "";

/** Agent yang mengelola gedung. Selalu ada, tidak pernah masuk roster kantor. */
export const CONCIERGE_AGENT_ID = process.env.QWENPAW_CONCIERGE_ID ?? "clawmpany";

const TIMEOUT_MS = 20_000;

export class QwenPawError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "QwenPawError";
    this.status = status;
  }
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (TOKEN) h["Authorization"] = `Bearer ${TOKEN}`;
  return h;
}

/**
 * GET satu endpoint QwenPaw. `soft404` mengembalikan null alih-alih melempar —
 * dipakai untuk resource yang "belum ada" adalah keadaan normal (file workspace
 * yang belum ditulis, agent tanpa sesi chat).
 */
async function get<T>(
  path: string,
  opts: { agentId?: string; soft404?: boolean; timeoutMs?: number } = {},
): Promise<T | null> {
  const extra: Record<string, string> = opts.agentId
    ? { "X-Agent-Id": opts.agentId }
    : {};
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: headers(extra),
      signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new QwenPawError(`Tidak bisa menghubungi ${hostname()}.`);
  }
  if (res.status === 404 && opts.soft404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new QwenPawError(
      `${hostname()} membalas ${res.status} untuk ${path}: ${body.slice(0, 160)}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

async function send<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  agentId?: string,
): Promise<T> {
  const extra: Record<string, string> = agentId ? { "X-Agent-Id": agentId } : {};
  if (body !== undefined) extra["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: headers(extra),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new QwenPawError(`Tidak bisa menghubungi ${hostname()}.`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text.slice(0, 200);
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (typeof parsed.detail === "string") detail = parsed.detail;
    } catch {
      /* bukan JSON — pakai teks mentah */
    }
    throw new QwenPawError(detail || `${hostname()} membalas ${res.status}.`, res.status);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

function hostname(): string {
  try {
    return new URL(BASE).hostname;
  } catch {
    return BASE;
  }
}

/** Selalu kembalikan array, apa pun bentuk pembungkus yang dikirim QwenPaw. */
function asArray<T>(raw: unknown, key: string): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object") {
    const inner = (raw as Record<string, unknown>)[key];
    if (Array.isArray(inner)) return inner as T[];
  }
  return [];
}

// ── Bentuk data ─────────────────────────────────────────────────

export interface QwenPawAgent {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  active_model: { provider_id: string; model: string } | null;
}

export interface ChatSession {
  id: string;
  name: string;
  session_id: string;
  channel: string;
  created_at: string;
  updated_at: string;
  status: string;
}

export interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: { type: string; cron: string | null; timezone: string | null } | null;
  dispatch?: { target?: { session_id?: string } };
  /** Instruksi job hidup di sini (request.input), bukan di `text`. */
  request?: Record<string, unknown>;
  text?: string | null;
}

export interface CronState {
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
}

export interface McpServer {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  transport: string;
}

// ── Agents ──────────────────────────────────────────────────────

export async function listAgents(): Promise<QwenPawAgent[]> {
  const raw = await get<unknown>("/api/agents");
  return asArray<QwenPawAgent>(raw, "agents");
}

export async function createAgent(
  id: string,
  name: string,
  language = "en",
): Promise<QwenPawAgent> {
  return send<QwenPawAgent>("POST", "/api/agents", { id, name, language });
}

export async function renameAgent(id: string, name: string): Promise<void> {
  await send("PUT", `/api/agents/${encodeURIComponent(id)}`, { id, name });
}

export async function deleteAgent(id: string): Promise<void> {
  await send("DELETE", `/api/agents/${encodeURIComponent(id)}`);
}

// ── Workspace files (PROFILE.md / SOUL.md / AGENTS.md) ───────────
//
// Inilah "kontrak kerja" agent — isi file inilah yang menentukan agent itu
// jadi siapa. Agent tanpa PROFILE.md yang diisi = agent yang tidak akan
// mengerjakan apa pun; report memakai fakta ini untuk menandai kursi kosong.

export async function readWorkspaceFile(
  agentId: string,
  name: string,
): Promise<string> {
  const raw = await get<{ content?: string }>(
    `/api/workspace/files/${encodeURIComponent(name)}`,
    { agentId, soft404: true },
  );
  return raw?.content ?? "";
}

export async function writeWorkspaceFile(
  agentId: string,
  name: string,
  content: string,
): Promise<void> {
  await send("PUT", `/api/workspace/files/${encodeURIComponent(name)}`, { content }, agentId);
}

/**
 * Template bawaan QwenPaw yang belum disentuh. Agent yang PROFILE.md-nya masih
 * berisi placeholder ini adalah kursi kosong: sudah direkrut, tidak pernah
 * diberi identitas, dan karena itu tidak akan pernah mengerjakan apa pun.
 * Deteksinya lewat placeholder literal template — bukan tebakan panjang teks.
 */
const UNCONFIGURED_MARKERS = ["*(pick something you like)*", "*(AI familiar"];

export function looksUnconfigured(description: string): boolean {
  return UNCONFIGURED_MARKERS.some((m) => description.includes(m));
}

// ── Riwayat kerja ───────────────────────────────────────────────

export async function listChats(agentId: string): Promise<ChatSession[]> {
  const raw = await get<unknown>(`/api/agents/${encodeURIComponent(agentId)}/chats`, {
    soft404: true,
  });
  return asArray<ChatSession>(raw, "chats");
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: string | null;
}

/** Isi satu sesi. Blok `reasoning` DIBUANG — itu isi pikiran, bukan hasil kerja. */
export async function readChat(agentId: string, chatId: string): Promise<ChatMessage[]> {
  const raw = await get<{ messages?: unknown[] }>(
    `/api/agents/${encodeURIComponent(agentId)}/chats/${encodeURIComponent(chatId)}`,
    { soft404: true },
  );
  const messages = Array.isArray(raw?.messages) ? raw.messages : [];
  return messages
    .map((m) => m as Record<string, unknown>)
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.type !== "reasoning")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      text: readableText(m),
      timestamp: readTimestamp(m),
    }))
    .filter((m) => m.text.length > 0);
}

function readableText(m: Record<string, unknown>): string {
  const content = Array.isArray(m.content) ? m.content : [m.content];
  return content
    .map((p) => p as Record<string, unknown> | null)
    .filter((p) => p && p.type === "text" && typeof p.text === "string")
    .map((p) => p!.text as string)
    .join("\n")
    .trim();
}

function readTimestamp(m: Record<string, unknown>): string | null {
  const meta = m.metadata as Record<string, unknown> | undefined;
  const candidates = [meta?.timestamp, m.created_at, m.updated_at];
  for (const c of candidates) if (typeof c === "string" && c) return c;
  return null;
}

// ── Jadwal kerja (cron) ─────────────────────────────────────────

export async function listCronJobs(agentId: string): Promise<CronJob[]> {
  const raw = await get<unknown>(`/api/agents/${encodeURIComponent(agentId)}/cron/jobs`, {
    soft404: true,
  });
  return asArray<CronJob>(raw, "jobs");
}

/**
 * Buat jadwal kerja. Bentuk wire-nya rewel dan tidak terdokumentasi dengan
 * benar — disalin dari clawcity/server/src/routes/schedule.ts yang sudah
 * terbukti jalan di produksi:
 *
 *  - `task_type` WAJIB "agent" (job menjalankan agent, bukan mengirim teks
 *    statis), dan karena itu instruksinya HARUS ada di `request.input` —
 *    QwenPaw menolak input null.
 *  - `text` sengaja null supaya instruksi cuma punya satu sumber kebenaran.
 *  - `session_id` yang sama dipakai `request` dan `dispatch.target`: di situlah
 *    hasil kerjanya ditulis, dan itulah yang nanti dibaca panel hasil. Kalau
 *    keduanya berbeda, hasil run tidak akan pernah ketemu.
 */
export interface CronInput {
  name: string;
  cron: string;
  instruction: string;
  timezone?: string;
  enabled?: boolean;
}

/**
 * Rakit body wire cron QwenPaw. Satu perakit dipakai create DAN update, karena
 * `PUT` MENGGANTI job seutuhnya — update parsial yang cuma mengirim field yang
 * berubah akan mengosongkan sisanya. `existing` yang diberikan jadi nilai
 * jatuhan untuk setiap field yang tidak disebut pemanggil.
 */
function cronPayload(
  agentId: string,
  input: Partial<CronInput>,
  existing?: CronJob & { request?: Record<string, unknown> },
): Record<string, unknown> {
  // session_id DIPERTAHANKAN dari job lama saat update. Kalau di-generate ulang,
  // panel hasil kehilangan seluruh riwayat run sebelumnya — ia akan menunjuk
  // sesi chat yang berbeda dan tampak seperti jadwal yang belum pernah jalan.
  const sessionId =
    existing?.dispatch?.target?.session_id ??
    `claw-cron-${agentId}-${Math.random().toString(36).slice(2, 10)}`;

  const instruction = input.instruction ?? readInstruction(existing) ?? "";
  const name = (input.name ?? existing?.name ?? "Jadwal").slice(0, 120);

  return {
    name,
    enabled: input.enabled ?? existing?.enabled ?? true,
    schedule: {
      type: "cron",
      cron: input.cron ?? existing?.schedule?.cron ?? "0 2 * * *",
      timezone: input.timezone ?? existing?.schedule?.timezone ?? "Asia/Jakarta",
    },
    task_type: "agent",
    // text sengaja null: instruksi hanya hidup di request.input supaya tidak
    // ada dua sumber kebenaran yang bisa berbeda isi.
    text: null,
    request: {
      input: [
        { role: "user", type: "message", content: [{ type: "text", text: instruction }] },
      ],
      session_id: sessionId,
      user_id: agentId,
    },
    dispatch: {
      type: "channel",
      channel: "console",
      target: { user_id: agentId, session_id: sessionId },
      mode: "final",
      meta: {},
    },
    save_result_to_inbox: true,
  };
}

/** Instruksi sebuah job, dari mana pun ia disimpan (request.input atau text). */
export function readInstruction(job?: {
  request?: Record<string, unknown>;
  text?: string | null;
}): string {
  const input = job?.request?.input;
  if (Array.isArray(input) && input.length > 0) {
    const content = (input[0] as Record<string, unknown> | undefined)?.content;
    if (Array.isArray(content) && content.length > 0) {
      const text = (content[0] as Record<string, unknown> | undefined)?.text;
      if (typeof text === "string") return text;
    }
  }
  return typeof job?.text === "string" ? job.text : "";
}

export async function createCronJob(
  agentId: string,
  input: CronInput,
): Promise<{ id?: string }> {
  return send<{ id?: string }>(
    "POST",
    `/api/agents/${encodeURIComponent(agentId)}/cron/jobs`,
    cronPayload(agentId, input),
  );
}

/**
 * Ubah jadwal. Job lama dibaca dulu supaya field yang tidak dikirim tetap utuh
 * — lihat catatan di `cronPayload` soal PUT yang mengganti seutuhnya.
 */
export async function updateCronJob(
  agentId: string,
  jobId: string,
  input: Partial<CronInput>,
): Promise<void> {
  const jobs = await listCronJobs(agentId);
  const existing = jobs.find((j) => j.id === jobId);
  if (!existing) throw new QwenPawError("Jadwal tidak ditemukan.", 404);
  await send(
    "PUT",
    `/api/agents/${encodeURIComponent(agentId)}/cron/jobs/${encodeURIComponent(jobId)}`,
    cronPayload(agentId, input, existing),
  );
}

export async function deleteCronJob(agentId: string, jobId: string): Promise<void> {
  await send(
    "DELETE",
    `/api/agents/${encodeURIComponent(agentId)}/cron/jobs/${encodeURIComponent(jobId)}`,
  );
}

/**
 * Jalankan sekarang, di luar jadwalnya. Ini obat untuk friction terbesar dalam
 * memasang jadwal: tanpa tombol ini, satu-satunya cara tahu instruksinya benar
 * adalah menunggu sampai besok pagi.
 */
export async function runCronJobNow(agentId: string, jobId: string): Promise<void> {
  await send(
    "POST",
    `/api/agents/${encodeURIComponent(agentId)}/cron/jobs/${encodeURIComponent(jobId)}/run`,
  );
}

export interface CronRun {
  run_at: string;
  status: string;
  error: string | null;
  trigger: string | null;
}

export async function readCronHistory(agentId: string, jobId: string): Promise<CronRun[]> {
  const raw = await get<unknown>(
    `/api/agents/${encodeURIComponent(agentId)}/cron/jobs/${encodeURIComponent(jobId)}/history`,
    { soft404: true },
  );
  return asArray<CronRun>(raw, "history");
}

/**
 * Hasil kerja sebuah jadwal.
 *
 * Cron run TIDAK mengembalikan hasilnya lewat HTTP — QwenPaw men-dispatch
 * balasan agent ke sebuah sesi chat. Jadi menampilkannya butuh tiga permintaan
 * berantai: job → session_id → chat id → riwayat pesan.
 */
export async function readJobOutput(
  agentId: string,
  jobId: string,
): Promise<{ sessionName: string; messages: ChatMessage[]; note?: string }> {
  const jobs = await listCronJobs(agentId);
  const job = jobs.find((j) => j.id === jobId);
  if (!job) throw new QwenPawError("Jadwal tidak ditemukan.", 404);

  const targetSessionId = job.dispatch?.target?.session_id;
  if (!targetSessionId) {
    return {
      sessionName: job.name,
      messages: [],
      note: "Jadwal ini tidak menulis hasil ke sesi mana pun.",
    };
  }

  const chats = await listChats(agentId);
  const chat = chats.find((c) => c.session_id === targetSessionId);
  // Sesi baru dibuat saat job pertama kali jalan, jadi "belum ada" adalah
  // keadaan normal — bukan error.
  if (!chat) {
    return {
      sessionName: targetSessionId,
      messages: [],
      note: "Belum ada hasil. Tekan Jalankan sekarang, atau tunggu jadwalnya tiba.",
    };
  }

  return { sessionName: chat.name || targetSessionId, messages: await readChat(agentId, chat.id) };
}

export async function readCronState(
  agentId: string,
  jobId: string,
): Promise<CronState | null> {
  return get<CronState>(
    `/api/agents/${encodeURIComponent(agentId)}/cron/jobs/${encodeURIComponent(jobId)}/state`,
    { soft404: true },
  );
}

// ── Peralatan (MCP) ─────────────────────────────────────────────

/**
 * Peralatan yang terpasang pada SATU karyawan.
 *
 * Terverifikasi 2026-07-31: konfigurasi MCP di QwenPaw memang per-agent, bukan
 * global se-instance — client yang dibuat dengan `X-Agent-Id: clawmpany` tidak
 * muncul saat didaftar dengan `X-Agent-Id: default`. Karena itu "peralatan per
 * karyawan" bisa dimodelkan apa adanya, tanpa lapisan pemetaan sendiri.
 */
export async function listMcpServers(agentId?: string): Promise<McpServer[]> {
  const raw = await get<unknown>("/api/mcp", { agentId, soft404: true });
  return asArray<McpServer>(raw, "servers");
}

/** Definisi satu peralatan yang dikirim saat memasang. */
export interface McpClientSpec {
  name: string;
  description?: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

/**
 * Pasang peralatan pada satu karyawan.
 *
 * PENTING: ini TIDAK menghubungi server MCP-nya — QwenPaw cuma menulis
 * konfigurasi. Jadi 200 di sini bukan bukti peralatannya hidup; satu-satunya
 * tes koneksi sungguhan adalah `probeMcpTools()`.
 */
export async function installMcpServer(
  agentId: string,
  key: string,
  client: McpClientSpec,
): Promise<void> {
  await send("POST", "/api/mcp", { client_key: key, client }, agentId);
}

export async function uninstallMcpServer(agentId: string, key: string): Promise<void> {
  await send("DELETE", `/api/mcp/${encodeURIComponent(key)}`, undefined, agentId);
}

/**
 * Nyalakan/matikan peralatan. Endpoint QwenPaw `PATCH /api/mcp/toggle/{key}`
 * MEMBALIK nilai dan tidak membaca body, jadi memanggilnya dengan niat "set
 * true" akan mematikan peralatan yang sudah menyala. Fungsi ini membacanya
 * dulu dan hanya membalik bila memang beda — supaya UI yang state-nya basi
 * tidak menghasilkan kebalikan dari yang diklik.
 */
export async function setMcpEnabled(
  agentId: string,
  key: string,
  enabled: boolean,
): Promise<void> {
  const current = (await listMcpServers(agentId)).find((s) => s.key === key);
  if (!current) throw new QwenPawError(`Peralatan "${key}" tidak terpasang.`, 404);
  if (current.enabled === enabled) return;
  await send("PATCH", `/api/mcp/toggle/${encodeURIComponent(key)}`, undefined, agentId);
}

export interface McpProbe {
  ok: boolean;
  tools: string[];
  message?: string;
}

/**
 * Tes koneksi sungguhan: QwenPaw menyalakan driver, handshake ke server MCP,
 * lalu mengembalikan daftar tool-nya.
 *
 * Tiga hasil yang berbeda artinya:
 *   200 + tool   → tersambung
 *   200 + kosong → peralatannya sedang dimatikan
 *   502          → tidak bisa dihubungi; pesan aslinya ikut ditampilkan
 */
export async function probeMcpTools(
  agentId: string,
  key: string,
  timeoutMs = 8_000,
): Promise<McpProbe> {
  try {
    const raw = await get<unknown>(`/api/mcp/tools/${encodeURIComponent(key)}`, {
      agentId,
      soft404: true,
      timeoutMs,
    });
    const list = asArray<unknown>(raw, "tools");
    const tools = list
      .map((t) =>
        typeof t === "string"
          ? t
          : ((t as Record<string, unknown>)?.name as string | undefined),
      )
      .filter((n): n is string => Boolean(n));
    if (tools.length === 0) {
      return { ok: false, tools: [], message: "Tersambung tapi tidak ada tool — peralatan ini sedang dimatikan." };
    }
    return { ok: true, tools };
  } catch (e) {
    return {
      ok: false,
      tools: [],
      message: e instanceof Error ? e.message : "Tidak bisa menghubungi server peralatan.",
    };
  }
}

/** Apakah instance-nya terkonfigurasi sama sekali. */
export function isConfigured(): boolean {
  return Boolean(BASE && TOKEN);
}
