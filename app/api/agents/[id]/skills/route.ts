// Keahlian satu karyawan.
//
//   GET    → daftar keahlian (yang menyala maupun mati)
//   POST   → buat        {name, description, body, emoji?}
//   PUT    → simpan      {sourceName, name, description, body, emoji?}
//   PATCH  → nyalakan / matikan  {name, enabled}
//   DELETE → hapus       ?name=
//
// Gerbangnya sama dengan peralatan dan jadwal: id di luar roster kantor si
// pemanggil dijawab 404, bukan 403 — 403 mengonfirmasi bahwa agentnya ada, dan
// instance QwenPaw ini dipakai bersama penyewa lain.
import { NextResponse } from "next/server";

import { currentOffice } from "@/lib/office";
import {
  createSkill,
  deleteSkill,
  listSkills,
  saveSkill,
  setSkillEnabled,
  skillBody,
} from "@/lib/qwenpaw";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function guard(params: Params["params"]) {
  const { id } = await params;
  const office = await currentOffice();
  if (!office.roster.includes(id)) {
    return { error: NextResponse.json({ error: "Tidak ditemukan." }, { status: 404 }) };
  }
  if (!office.writable) {
    return { error: NextResponse.json({ error: "Masuk dulu." }, { status: 401 }) };
  }
  return { agentId: id };
}

function failure(e: unknown, fallback: string) {
  const message = e instanceof Error ? e.message : fallback;
  return NextResponse.json({ error: message }, { status: 502 });
}

/**
 * Nama keahlian ikut jadi nama berkas di workspace, jadi ia dibatasi ke bentuk
 * yang aman untuk path — bukan sekadar selera penamaan. Menolaknya di sini
 * memberi kalimat yang bisa dibaca; membiarkannya lolos menghasilkan 500 dari
 * QwenPaw yang tidak menjelaskan apa pun.
 */
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,59}$/;

interface Draft {
  name: string;
  description: string;
  body: string;
  emoji: string;
}

/** Baca + validasi badan permintaan create/save. */
function readDraft(body: Record<string, unknown>): Draft | string {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const text = typeof body.body === "string" ? body.body : "";
  const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";

  if (!NAME_RE.test(name)) {
    return "Nama keahlian: huruf/angka, spasi, - dan _ saja, maksimal 60 karakter.";
  }
  // Deskripsi adalah PEMICU keahlian — tanpa itu, keahlian ini tidak akan
  // pernah dipanggil karena agent tidak punya cara tahu kapan ia relevan.
  if (!description) {
    return "Tulis kapan keahlian ini dipakai — itu yang membuat dia tahu kapan memanggilnya.";
  }
  if (!skillBody(text).trim()) {
    return "Isi langkah-langkahnya — keahlian kosong tidak mengubah apa pun.";
  }
  return { name, description, body: text, emoji };
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  try {
    // `content` dikirim tanpa frontmatter: itulah satu-satunya bagian yang
    // disunting orang, dan name/description sudah punya kolomnya sendiri.
    const skills = (await listSkills(g.agentId)).map((s) => ({
      ...s,
      content: skillBody(s.content),
    }));
    return NextResponse.json({ skills });
  } catch (e) {
    return failure(e, "Gagal membaca keahlian.");
  }
}

export async function POST(req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Body bukan JSON." }, { status: 400 });

  const draft = readDraft(body);
  if (typeof draft === "string") {
    return NextResponse.json({ error: draft }, { status: 400 });
  }

  try {
    await createSkill(g.agentId, { ...draft, enabled: body.enabled !== false });
    return NextResponse.json({ name: draft.name });
  } catch (e) {
    return failure(e, "Gagal membuat keahlian.");
  }
}

export async function PUT(req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Body bukan JSON." }, { status: 400 });

  const sourceName = typeof body.sourceName === "string" ? body.sourceName.trim() : "";
  if (!sourceName) {
    return NextResponse.json({ error: "Butuh sourceName." }, { status: 400 });
  }

  const draft = readDraft(body);
  if (typeof draft === "string") {
    return NextResponse.json({ error: draft }, { status: 400 });
  }

  try {
    await saveSkill(g.agentId, { ...draft, sourceName });
    return NextResponse.json({ name: draft.name });
  } catch (e) {
    return failure(e, "Gagal menyimpan keahlian.");
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Body bukan JSON." }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Butuh name dan enabled." }, { status: 400 });
  }

  try {
    await setSkillEnabled(g.agentId, name, body.enabled);
    return NextResponse.json({ name, enabled: body.enabled });
  } catch (e) {
    return failure(e, "Gagal mengubah keahlian.");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
  if (!name) return NextResponse.json({ error: "Butuh name." }, { status: 400 });

  try {
    await deleteSkill(g.agentId, name);
    return NextResponse.json({ name });
  } catch (e) {
    return failure(e, "Gagal menghapus keahlian.");
  }
}
