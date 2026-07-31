// /api/chat — single hop to paw.wheza.id (QwenPaw).
//
// The browser POSTs { message, sessionId }; this route injects the secret
// Authorization token + agent id + session id and forwards the request to
// QwenPaw's /api/console/chat as Server-Sent Events, then pipes the SSE body
// straight back. The token NEVER reaches the browser — same shape as the
// ClawCity backend (server/src/index.ts app.post('/api/chat')).
//
// The QwenPaw SSE contract parsed by the client (lib/paw.ts) mirrors
// ClawCity's src/agents/hub.ts chatStream(): data lines carry {type:"text"}
// deltas, {object:"message", type:"reasoning"|"message"} block openers, a
// final {object:"response", status:"completed"} event, and {status:"failed"}.

import { officeDirectory } from "@/lib/directory";
import { buildDirectory } from "@/lib/handoff";
import { currentOffice, type Office } from "@/lib/office";
import { CONCIERGE_AGENT_ID } from "@/lib/qwenpaw";

export const runtime = "nodejs";

// Env reads prefer QWENPAW_* because that is the naming already provisioned on
// the Coolify resource (and the convention across the wheza projects — e.g.
// clawcity). PAW_* is accepted as a fallback so a local .env.local can use a
// shorter name without touching the server config.
const PAW_URL = (
  process.env.PAW_URL ??
  process.env.QWENPAW_URL ??
  "https://paw.wheza.id"
).replace(/\/$/, "");
const PAW_AUTH_TOKEN = process.env.PAW_AUTH_TOKEN ?? process.env.QWENPAW_AUTH_TOKEN ?? "";
const PAW_AGENT_ID =
  process.env.PAW_AGENT_ID ?? process.env.QWENPAW_AGENT_ID ?? "default";

function newSessionId(): string {
  return `clawmpany-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function POST(req: Request) {
  let body: {
    message?: unknown;
    sessionId?: unknown;
    agentId?: unknown;
    withDirectory?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", {
      status: 400,
      headers: { "content-type": "text/plain" },
    });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return new Response("message required", {
      status: 400,
      headers: { "content-type": "text/plain" },
    });
  }

  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.trim()
      ? body.sessionId.trim()
      : newSessionId();

  // Agent mana yang menjawab. Klien boleh MEMINTA, server yang memutuskan:
  // hanya manajer gedung dan karyawan yang benar-benar ada di roster kantor si
  // pemanggil yang boleh dituju. Tanpa gate ini, mengubah satu field di
  // DevTools akan membuka agent milik penyewa lain di instance yang sama.
  const requested = typeof body.agentId === "string" ? body.agentId.trim() : "";

  // Kantor si pemanggil dibaca paling banyak SEKALI per permintaan, walau
  // dibutuhkan dua kali (gerbang kepemilikan + direktori).
  let office: Office | null = null;
  const thisOffice = async (): Promise<Office> => (office ??= await currentOffice());

  let agentId = PAW_AGENT_ID;
  if (requested) {
    if (requested === CONCIERGE_AGENT_ID) {
      agentId = requested;
    } else {
      if (!(await thisOffice()).roster.includes(requested)) {
        return new Response("Karyawan itu bukan penghuni kantor ini.", {
          status: 403,
          headers: { "content-type": "text/plain" },
        });
      }
      agentId = requested;
    }
  }

  // Giliran pertama sebuah sesi membawa direktori kantor + aturan mengalihkan.
  // Klien yang menentukan kapan "pertama" — itu bukan keputusan keamanan, dan
  // hanya klien yang tahu apakah sesi ini sudah pernah dipakai di tab ini.
  // Isinya tetap disusun di sini, dari roster yang sama yang menjaga gerbang di
  // atas: agent tidak akan pernah diberi tahu ada kolega yang tidak boleh
  // dituju.
  let outbound = message;
  if (body.withDirectory === true) {
    try {
      const home = await thisOffice();
      const dir = await officeDirectory(home);
      const self = dir.find((c) => c.id === agentId);
      // Agent di luar direktori (mode solo dengan agent bawaan) tidak diberi
      // preamble — tidak ada kantor untuk diceritakan.
      if (self) {
        outbound =
          buildDirectory({
            self,
            company: home.name,
            others: dir.filter((c) => c.id !== agentId),
          }) + message;
      }
    } catch {
      // Direktori gagal disusun bukan alasan pesannya tidak terkirim; yang
      // hilang cuma kemampuan mengalihkan pada sesi ini.
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Agent-Id": agentId,
    Accept: "text/event-stream",
  };
  if (PAW_AUTH_TOKEN) headers["Authorization"] = `Bearer ${PAW_AUTH_TOKEN}`;

  let upstream: Response;
  try {
    upstream = await fetch(`${PAW_URL}/api/console/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        input: [{ role: "user", content: [{ type: "text", text: outbound }] }],
        session_id: sessionId,
        channel: "console",
      }),
    });
  } catch {
    return new Response("Tidak bisa menghubungi paw.wheza.id.", {
      status: 502,
      headers: { "content-type": "text/plain" },
    });
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(`paw.wheza.id ${upstream.status}: ${text.slice(0, 200)}`, {
      status: upstream.status,
      headers: { "content-type": "text/plain" },
    });
  }

  // Pipe the upstream SSE stream straight through. Returning the ReadableStream
  // body verbatim keeps the response unbuffered so tokens surface one-by-one —
  // the same anti-buffer rule as ClawCity's nginx proxy_buffering off.
  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
