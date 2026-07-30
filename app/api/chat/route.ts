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

export const runtime = "nodejs";

const PAW_URL = (process.env.PAW_URL ?? "https://paw.wheza.id").replace(/\/$/, "");
const PAW_AUTH_TOKEN = process.env.PAW_AUTH_TOKEN ?? "";
const PAW_AGENT_ID = process.env.PAW_AGENT_ID ?? "default";

function newSessionId(): string {
  return `clawmpany-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function POST(req: Request) {
  let body: { message?: unknown; sessionId?: unknown };
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

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Agent-Id": PAW_AGENT_ID,
    Accept: "text/event-stream",
  };
  if (PAW_AUTH_TOKEN) headers["Authorization"] = `Bearer ${PAW_AUTH_TOKEN}`;

  let upstream: Response;
  try {
    upstream = await fetch(`${PAW_URL}/api/console/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        input: [{ role: "user", content: [{ type: "text", text: message }] }],
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
