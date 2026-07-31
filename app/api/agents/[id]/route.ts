// Karyawan itu sendiri: identitas, nama, dan pemecatan.
//
//   GET    → identitas mentah (nama + PROFILE.md, SOUL.md, AGENTS.md)
//   PATCH  → simpan {name?, profile?, soul?, agents?}
//   DELETE → pecat: hapus agent di QwenPaw + keluarkan dari roster kantor
//
// PATCH ada karena 40-an agent di instance ini terlanjur jadi kursi kosong
// lewat alur rekrut yang lama. Mencegahnya berulang (lihat /api/hire) tidak
// menolong yang sudah telanjur — kursi kosong juga harus bisa DIPERBAIKI,
// bukan cuma dipecat lalu direkrut ulang dari nol.
//
// GET mengembalikan NAMA juga, bukan hanya isi berkas: dialog manajemen dibuka
// dari chat, di mana tidak ada server component yang sudah memuat direktori
// agent. Tanpa nama di sini, penyunting identitas harus menunggu satu request
// kedua hanya untuk mengisi kolom pertamanya.
import { NextResponse } from "next/server";

import { currentOffice, saveRoster } from "@/lib/office";
import {
  deleteAgent,
  listAgents,
  looksUnconfigured,
  readWorkspaceFile,
  renameAgent,
  writeWorkspaceFile,
} from "@/lib/qwenpaw";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function guard(params: Params["params"]) {
  const { id } = await params;
  const office = await currentOffice();
  if (!office.roster.includes(id)) {
    return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  }
  if (!office.writable) {
    return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  }
  return { agentId: id, office };
}

function failure(e: unknown, fallback: string) {
  return NextResponse.json(
    { error: e instanceof Error ? e.message : fallback },
    { status: 502 },
  );
}

export async function GET(_req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  try {
    const [directory, profile, soul, agents] = await Promise.all([
      listAgents().catch(() => []),
      readWorkspaceFile(g.agentId, "PROFILE.md"),
      readWorkspaceFile(g.agentId, "SOUL.md"),
      readWorkspaceFile(g.agentId, "AGENTS.md"),
    ]);
    const found = directory.find((a) => a.id === g.agentId);
    return NextResponse.json({
      id: g.agentId,
      name: found?.name ?? g.agentId,
      model: found?.active_model?.model ?? null,
      profile,
      soul,
      agents,
      configured: !looksUnconfigured(found?.description ?? ""),
    });
  } catch (e) {
    return failure(e, "Could not read the identity.");
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  let body: {
    name?: unknown;
    profile?: unknown;
    soul?: unknown;
    agents?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body bukan JSON." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const profile = typeof body.profile === "string" ? body.profile : undefined;
  const soul = typeof body.soul === "string" ? body.soul : undefined;
  const agents = typeof body.agents === "string" ? body.agents : undefined;

  if (name !== undefined && (!name || name.length > 40)) {
    return NextResponse.json(
      { error: "A name is required, 40 characters at most." },
      { status: 400 },
    );
  }
  // PROFILE.md kosong = kursi kosong. Menolaknya di sini menjaga janji yang
  // dibuat alur rekrut: tidak ada karyawan tanpa identitas.
  if (profile !== undefined && !profile.trim()) {
    return NextResponse.json(
      { error: "An identity cannot be empty — it is what tells them what to do." },
      { status: 400 },
    );
  }

  try {
    if (name !== undefined) await renameAgent(g.agentId, name);
    if (profile !== undefined) await writeWorkspaceFile(g.agentId, "PROFILE.md", profile);
    if (soul !== undefined) await writeWorkspaceFile(g.agentId, "SOUL.md", soul);
    if (agents !== undefined) await writeWorkspaceFile(g.agentId, "AGENTS.md", agents);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e, "Could not save.");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  // Nama diketik ulang sebagai konfirmasi. Pemecatan menghapus workspace agent
  // beserta seluruh riwayat kerjanya di QwenPaw dan tidak bisa dibatalkan, jadi
  // dialog "yakin?" yang bisa diklik refleks tidak cukup.
  const confirm = new URL(req.url).searchParams.get("confirm")?.trim() ?? "";
  if (!confirm) {
    return NextResponse.json(
      { error: "Type the employee's name to confirm." },
      { status: 400 },
    );
  }

  try {
    await deleteAgent(g.agentId);
  } catch (e) {
    return failure(e, "Could not delete the employee in QwenPaw.");
  }

  // Roster dibersihkan SETELAH agentnya benar-benar hilang. Urutan sebaliknya
  // bisa meninggalkan agent yatim: tidak ada di kantor mana pun, tapi masih
  // hidup di instance dan tetap menjalankan jadwalnya.
  try {
    await saveRoster(
      g.office,
      g.office.roster.filter((r) => r !== g.agentId),
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `The employee was deleted, but the office roster could not be updated: ${e.message}`
            : "The employee was deleted, but the office roster could not be updated.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ removed: g.agentId });
}
