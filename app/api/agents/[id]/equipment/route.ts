// Peralatan (MCP) satu karyawan.
//
//   GET    → yang terpasang + katalog gedung
//   POST   → pasang satu peralatan dari katalog  {utilityKey}
//   PATCH  → nyalakan / matikan                  {key, enabled}
//   DELETE → lepas                               ?key=
//
// Setiap metode digerbangi keanggotaan roster: id yang tidak ada di kantor si
// pemanggil dijawab 404, bukan 403 — 403 mengonfirmasi bahwa agentnya ada, dan
// instance QwenPaw ini dipakai bersama penyewa lain.
import { NextResponse } from "next/server";

import { currentOffice } from "@/lib/office";
import {
  installMcpServer,
  listMcpServers,
  probeMcpTools,
  setMcpEnabled,
  uninstallMcpServer,
} from "@/lib/qwenpaw";
import { findUtility, offers } from "@/lib/utilities";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Karyawan ini milik kantor pemanggil? Kalau tidak, jawaban selalu 404. */
async function guard(params: Params["params"]) {
  const { id } = await params;
  const office = await currentOffice();
  if (!office.roster.includes(id)) {
    return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  }
  if (!office.writable) {
    return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  }
  return { agentId: id };
}

function failure(e: unknown, fallback: string) {
  const message = e instanceof Error ? e.message : fallback;
  return NextResponse.json({ error: message }, { status: 502 });
}

export async function GET(_req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  try {
    const installed = await listMcpServers(g.agentId);
    // Tes koneksi hanya untuk yang menyala. Yang dimatikan sudah pasti tidak
    // menjawab, jadi menanyakannya cuma menambah detik pada waktu muat.
    const probed = await Promise.all(
      installed.map(async (s) => ({
        ...s,
        probe: s.enabled ? await probeMcpTools(g.agentId, s.key) : null,
      })),
    );
    return NextResponse.json({ installed: probed, catalog: offers() });
  } catch (e) {
    return failure(e, "Could not read equipment.");
  }
}

export async function POST(req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  let body: { utilityKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body bukan JSON." }, { status: 400 });
  }

  const utilityKey = typeof body.utilityKey === "string" ? body.utilityKey : "";
  const utility = findUtility(utilityKey);
  if (!utility) {
    return NextResponse.json({ error: "Unknown equipment." }, { status: 400 });
  }

  // Peralatan yang env-nya belum diisi ditolak DI SINI, bukan dibiarkan lolos
  // dan gagal diam-diam nanti: QwenPaw menerima konfigurasi tanpa pernah
  // menghubungi servernya, jadi pemasangan yang cacat akan tampak berhasil.
  const spec = utility.build();
  if (!spec) {
    return NextResponse.json(
      {
        error: `This equipment is not ready on the server. Set these first: ${utility.requires.join(", ")}.`,
      },
      { status: 409 },
    );
  }

  try {
    await installMcpServer(g.agentId, utility.key, spec);
  } catch (e) {
    return failure(e, "Could not fit the equipment.");
  }

  // Pemasangan sukses belum berarti tersambung — sekalian diuji supaya UI bisa
  // langsung jujur alih-alih menampilkan centang hijau yang belum tentu benar.
  const probe = await probeMcpTools(g.agentId, utility.key);
  return NextResponse.json({ key: utility.key, probe });
}

export async function PATCH(req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  let body: { key?: unknown; enabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body bukan JSON." }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key : "";
  if (!key || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "key and enabled are required." }, { status: 400 });
  }

  try {
    await setMcpEnabled(g.agentId, key, body.enabled);
    return NextResponse.json({ key, enabled: body.enabled });
  } catch (e) {
    return failure(e, "Could not change the equipment.");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  const key = new URL(req.url).searchParams.get("key")?.trim() ?? "";
  if (!key) return NextResponse.json({ error: "Butuh key." }, { status: 400 });

  try {
    await uninstallMcpServer(g.agentId, key);
    return NextResponse.json({ key });
  } catch (e) {
    return failure(e, "Could not remove the equipment.");
  }
}
