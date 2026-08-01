// app/api/whop/webhook/route.ts
// Whop webhook receiver — verifies signature, settles payments in PocketBase.
//
// This is the ONLY place a purchase is recognised. Browser-side "payment
// complete" callbacks can be spoofed; the HMAC signature cannot.
//
// Idempotent: event.id is checked against whop_events before any side effects.
// Raw body is read for signature verification (JSON.parse changes spacing).

import { Whop } from "@whop/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PB_URL = process.env.PB_URL || "https://pocketbase.clawmpany.id";
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || "";
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || "";
const WHOP_API_KEY = process.env.WHOP_API_KEY || "";
const WHOP_WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET || "";

// ── PocketBase helpers (plain fetch, no SDK) ─────────────────

let _pbToken: string | null = null;

async function pbAuth(): Promise<string> {
  if (_pbToken) return _pbToken;
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`PB auth failed: ${res.status}`);
  const data = await res.json();
  _pbToken = data.token;
  return _pbToken!;
}

async function pbFindPayment(checkoutSessionId: string): Promise<any | null> {
  const token = await pbAuth();
  const filter = encodeURIComponent(
    `metadata.app = "clawcity" && metadata.checkout_session_id = "${checkoutSessionId}"`
  );
  const res = await fetch(
    `${PB_URL}/api/collections/payments/records?filter=${filter}&perPage=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.items?.[0] ?? null;
}

async function pbUpdatePayment(id: string, fields: Record<string, any>): Promise<void> {
  const token = await pbAuth();
  await fetch(`${PB_URL}/api/collections/payments/records/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
}

async function pbCheckEvent(eventId: string): Promise<boolean> {
  const token = await pbAuth();
  const filter = encodeURIComponent(`event_id = "${eventId}"`);
  const res = await fetch(
    `${PB_URL}/api/collections/whop_events/records?filter=${filter}&perPage=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return false;
  const data = await res.json();
  return (data.items?.length ?? 0) > 0;
}

async function pbRecordEvent(eventId: string, type: string): Promise<void> {
  const token = await pbAuth();
  await fetch(`${PB_URL}/api/collections/whop_events/records`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: eventId, type }),
  });
}

// ── Webhook handler ──────────────────────────────────────────

export async function POST(req: Request) {
  try {
    if (!WHOP_WEBHOOK_SECRET) {
      console.error("[/api/whop/webhook] WHOP_WEBHOOK_SECRET not set — ignoring event");
      return NextResponse.json({ received: true, error: "webhook not configured" });
    }

    // Read raw body — signature is computed over the exact bytes.
    const rawBody = await req.text();

    // Collect headers (lowercase keys).
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Verify signature via Whop SDK.
    const whop = new Whop({
      apiKey: WHOP_API_KEY || "dummy",
      webhookKey: Buffer.from(WHOP_WEBHOOK_SECRET).toString("base64"),
    });

    let event: any;
    try {
      event = whop.webhooks.unwrap(rawBody, { headers });
    } catch (err) {
      console.error(
        "[/api/whop/webhook] signature verification FAILED:",
        err instanceof Error ? err.message : err
      );
      return NextResponse.json({ received: false, error: "invalid signature" }, { status: 401 });
    }

    console.log(`[/api/whop/webhook] event=${event.type} id=${event.id}`);

    // Idempotency check.
    if (await pbCheckEvent(event.id)) {
      console.log(`[/api/whop/webhook] event ${event.id} already processed — skip`);
      return NextResponse.json({ received: true });
    }

    // Handle event.
    try {
      const data = event.data || {};
      switch (event.type) {
        case "payment.succeeded":
          await handlePaymentSucceeded(data);
          break;
        case "payment.failed":
          await handlePaymentFailed(data);
          break;
        default:
          break;
      }
    } catch (err) {
      // Fulfilment failure must NOT block ack — Whop would retry the same error.
      console.error(
        `[/api/whop/webhook] handler error for ${event.type}:`,
        err instanceof Error ? err.message : err
      );
    }

    // Record event AFTER handler (so retry gets another chance if it failed).
    await pbRecordEvent(event.id, event.type);

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[/api/whop/webhook] fatal:", err);
    return NextResponse.json({ received: true, error: "internal" });
  }
}

async function handlePaymentSucceeded(data: any): Promise<void> {
  const paymentId = String(data?.id ?? "");
  const checkoutSessionId = data?.checkout_configuration_id || "";
  const membershipId = data?.membership?.id ?? data?.member?.id ?? null;
  const paidAt = data?.paid_at ? new Date(data.paid_at) : new Date();

  // Find the invoice by checkout session id.
  let row = await pbFindPayment(String(checkoutSessionId));

  // Also try metadata.invoice_id (our own id passed through Whop).
  if (!row && data?.metadata?.invoice_id) {
    const token = await pbAuth();
    const res = await fetch(`${PB_URL}/api/collections/payments/records/${data.metadata.invoice_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) row = await res.json();
  }

  if (!row) {
    console.warn(`[whop] payment ${paymentId} — no matching invoice found`);
    return;
  }

  // Already paid → skip (Whop sends at-least-once).
  if (row.status === "paid") {
    console.log(`[whop] ${row.metadata?.invoice_no} already paid — skip`);
    return;
  }

  // Calculate expiry for office purchases.
  const meta = row.metadata || {};
  const officeDays = Number(meta.office_days) || 0;
  const expiresAt =
    officeDays > 0
      ? new Date(paidAt.getTime() + officeDays * 86_400_000).toISOString()
      : "";

  await pbUpdatePayment(row.id, {
    status: "paid",
    metadata: {
      ...meta,
      whop_payment_id: paymentId,
      membership_id: membershipId ? String(membershipId) : meta.membership_id,
      paid_at: paidAt.toISOString(),
      expires_at: expiresAt,
    },
  });

  console.log(
    `[whop] ${meta.invoice_no} PAID — user=${row.user_id} sku=${meta.sku} $${row.amount}`
  );
}

async function handlePaymentFailed(data: any): Promise<void> {
  const checkoutSessionId = data?.checkout_configuration_id || "";
  const row = await pbFindPayment(String(checkoutSessionId));
  if (!row || row.status === "paid") return;

  await pbUpdatePayment(row.id, {
    status: "failed",
    metadata: {
      ...(row.metadata || {}),
      whop_payment_id: String(data?.id || ""),
      failure_reason: String(data?.failure_message || "Payment declined").slice(0, 300),
    },
  });
}
