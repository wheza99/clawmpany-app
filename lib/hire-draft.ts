// ────────────────────────────────────────────────────────────────
// lib/hire-draft.ts — Usulan karyawan yang belum jadi.
//
// KENAPA ADA LANGKAH ANTARA.
// Sampai sekarang "Rekrut" langsung membuat agent: satu klik, dan tiga file
// tulang punggungnya ditulis tanpa pernah dilihat pemiliknya. Itu cepat, tapi
// yang dibeli orang di layar rekrut bukan kecepatan — melainkan seorang
// karyawan yang perilakunya bisa dia percaya. Membiarkan dia mengetahui
// perilaku itu SETELAH agentnya hidup berarti satu-satunya cara memperbaiki
// tebakan yang meleset adalah memecat lalu merekrut ulang.
//
// Maka rekrut sekarang dua langkah: usulan dulu (objek di bawah — nama,
// deskripsi, dan isi AGENTS.md / SOUL.md / PROFILE.md apa adanya), baru
// eksekusi. Yang dieksekusi PERSIS yang ditampilkan; server tidak menyusun
// ulang isinya diam-diam.
//
// Modul ini sengaja BEBAS SERVER — dipakai apa adanya oleh:
//   • katalog rekrut di browser  (menyusun usulan tanpa satu pun request)
//   • transkrip chat             (memungut usulan dari balasan manajer gedung)
//   • POST /api/hire             (memvalidasi ulang sebelum menulis)
// Satu definisi bentuk, tiga pemakai, jadi tidak ada versi yang bisa melenceng.
// ────────────────────────────────────────────────────────────────

import {
  buildAgents,
  buildDescription,
  buildProfile,
  buildSoul,
  findRole,
  type RoleTemplate,
} from "@/lib/roles";

/** Penanda di dalam JSON. Manajer gedung menulisnya; parser mencarinya. */
export const HIRE_DRAFT_TYPE = "clawmpany.hire";

/**
 * Tiga file tulang punggung agent QwenPaw. Urutannya urutan tampil, dan
 * disengaja: apa yang dia kerjakan → siapa dirinya → bagaimana dia membawa
 * diri, dari yang paling menentukan hasil ke yang paling menentukan rasa.
 */
export const BACKBONE_FILES = ["AGENTS.md", "PROFILE.md", "SOUL.md"] as const;
export type BackboneFile = (typeof BACKBONE_FILES)[number];

/** Batas per file. Cukup longgar untuk kontrak kerja yang panjang, cukup ketat
 *  supaya satu permintaan tidak bisa menjejalkan buku ke workspace agent. */
export const MAX_FILE_CHARS = 20_000;
export const MAX_NAME_CHARS = 40;
export const MAX_DESCRIPTION_CHARS = 240;

export interface HireDraft {
  type: typeof HIRE_DRAFT_TYPE;
  /** Kunci jabatan di ROLE_CATALOG — menentukan jadwal kerja pertamanya. */
  roleKey: string;
  name: string;
  /** Satu kalimat yang tampil sebagai deskripsi karyawan. */
  description: string;
  files: Record<BackboneFile, string>;
}

/** Susun usulan dari katalog. Inilah yang dilihat pemilik sebelum menyetujui. */
export function buildDraft(params: {
  role: RoleTemplate;
  name: string;
  company: string;
  extra?: string;
}): HireDraft {
  const { role, name, company, extra } = params;
  return {
    type: HIRE_DRAFT_TYPE,
    roleKey: role.key,
    name,
    description: buildDescription({ role, extra }),
    files: {
      "AGENTS.md": buildAgents({ name, role, company }),
      "PROFILE.md": buildProfile({ name, role, company, extra }),
      "SOUL.md": buildSoul({ name, role, company }),
    },
  };
}

/**
 * Periksa satu objek asing menjadi `HireDraft`, atau jelaskan kenapa tidak.
 *
 * Dipanggil dua kali untuk usulan yang datang dari chat — sekali di browser
 * sebelum ditampilkan, sekali lagi di server sebelum ditulis. Yang mengarang
 * isinya adalah model bahasa, jadi "sudah lolos di browser" bukan jaminan
 * apa-apa: yang sampai ke server tetap teks yang bisa diubah siapa saja.
 */
export function readDraft(
  raw: unknown,
): { draft: HireDraft; role: RoleTemplate } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Usulan bukan objek." };
  const o = raw as Record<string, unknown>;

  if (o.type !== HIRE_DRAFT_TYPE) return { error: "Ini bukan usulan rekrut." };

  const roleKey = typeof o.roleKey === "string" ? o.roleKey : "";
  const role = findRole(roleKey);
  if (!role) return { error: `Role "${roleKey}" is not in the catalogue.` };

  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) return { error: "The proposal gives no name." };
  if (name.length > MAX_NAME_CHARS) {
    return { error: `Name is too long (max ${MAX_NAME_CHARS}).` };
  }

  const rawFiles = o.files;
  if (!rawFiles || typeof rawFiles !== "object") {
    return { error: "The proposal carries no AGENTS.md / PROFILE.md / SOUL.md content." };
  }
  const source = rawFiles as Record<string, unknown>;

  const files = {} as Record<BackboneFile, string>;
  for (const key of BACKBONE_FILES) {
    const value = source[key];
    if (typeof value !== "string") return { error: `${key} is missing from the proposal.` };
    if (value.length > MAX_FILE_CHARS) {
      return { error: `${key} terlalu panjang (maks ${MAX_FILE_CHARS} karakter).` };
    }
    files[key] = value;
  }

  // PROFILE.md kosong = kursi kosong, yaitu tepat hal yang seluruh alur ini ada
  // untuk mencegahnya. Ditolak di sini, bukan ditulis lalu ditandai merah.
  if (!files["PROFILE.md"].trim()) {
    return { error: "PROFILE.md is empty — it is what tells them what to do." };
  }

  const description =
    typeof o.description === "string" && o.description.trim()
      ? o.description.trim().slice(0, MAX_DESCRIPTION_CHARS)
      : role.summary;

  return {
    draft: { type: HIRE_DRAFT_TYPE, roleKey: role.key, name, description, files },
    role,
  };
}

// ── Memungut usulan dari balasan manajer gedung ──────────────────
//
// Chat console QwenPaw hanya mengalirkan teks — tidak ada event tool-call yang
// bisa membawa data terstruktur. Jadi kanal untuk usulan ini adalah satu blok
// ```json di dalam balasan biasa, dan modul ini yang memisahkannya dari
// kalimat di sekitarnya.

export type DraftScan =
  | { state: "none" }
  | { state: "pending"; before: string }
  | { state: "ready"; before: string; after: string; draft: HireDraft }
  | { state: "broken"; before: string; after: string; reason: string };

/**
 * Cari usulan di dalam satu balasan.
 *
 * `pending` ada karena teksnya sampai token demi token: blok JSON yang baru
 * setengah tertulis tidak bisa diparse, dan menampilkan potongan mentahnya
 * berarti pemilik melihat kurung kurawal setengah jalan sebelum melihat
 * kartunya. Pagarnya sempit — hanya blok yang penandanya sudah muncul yang
 * disembunyikan, jadi blok kode lain tetap tampil seperti biasa.
 */
export function scanForHireDraft(text: string): DraftScan {
  if (!text.includes(HIRE_DRAFT_TYPE)) return { state: "none" };

  const fence = /```[ \t]*[a-zA-Z0-9]*[ \t]*\r?\n([\s\S]*?)```/g;
  for (let m = fence.exec(text); m; m = fence.exec(text)) {
    if (!m[1].includes(HIRE_DRAFT_TYPE)) continue;
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    const parsed = safeParse(m[1]);
    if (parsed === undefined) {
      return { state: "broken", before, after, reason: "The proposal is not valid JSON." };
    }
    const read = readDraft(parsed);
    return "draft" in read
      ? { state: "ready", before, after, draft: read.draft }
      : { state: "broken", before, after, reason: read.error };
  }

  // Pagar yang belum ditutup: masih mengalir, jadi tahan tampilannya.
  const opening = openFenceIndex(text);
  if (opening !== null && text.slice(opening).includes(HIRE_DRAFT_TYPE)) {
    return { state: "pending", before: text.slice(0, opening) };
  }

  // Tanpa pagar sama sekali — sebagian model mengirim JSON telanjang.
  const bare = safeParse(text);
  if (bare !== undefined) {
    const read = readDraft(bare);
    if ("draft" in read) return { state: "ready", before: "", after: "", draft: read.draft };
  }

  return { state: "none" };
}

/** Posisi pagar kode yang dibuka dan belum ditutup, kalau ada. */
function openFenceIndex(text: string): number | null {
  let index = text.indexOf("```");
  let open: number | null = null;
  while (index !== -1) {
    open = open === null ? index : null;
    index = text.indexOf("```", index + 3);
  }
  return open;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw.trim()) as unknown;
  } catch {
    return undefined;
  }
}
