// ────────────────────────────────────────────────────────────────
// lib/handoff.ts — protokol alih pembicaraan antar karyawan.
//
// KENAPA PENANDA TEKS, BUKAN TOOL CALL SUNGGUHAN.
// QwenPaw MEMANG menyiarkan pemanggilan tool secara terstruktur — aliran SSE
// `/api/console/chat` membawa `plugin_call` / `plugin_call_output` berisi
// {call_id, name, arguments} (diverifikasi langsung 2026-07-31; komentar lama
// di thread.tsx yang bilang sebaliknya keliru). Tapi daftar tool sebuah agent
// hanya berasal dari tool bawaan + client MCP yang terpasang PADA agent itu:
// body `/api/console/chat` cuma menerima {input, session_id, user_id, channel},
// jadi tidak ada cara mendaftarkan tool milik aplikasi ini per-permintaan.
//
// Untuk membuat `switch_agent` jadi tool asli, Clawmpany harus menghosting
// server MCP sendiri lalu memasangnya ke SETIAP agent di setiap roster — dan
// server itu harus bisa dihubungi paw.wheza.id, artinya fiturnya mati saat app
// dijalankan lokal. Pelajaran iterasi 5 masih berlaku: yang tidak bisa
// dijalankan lokal tidak akan pernah benar-benar diuji.
//
// Maka alih dilakukan lewat SATU BARIS penanda di balasan agent. Nol infra,
// jalan di lokal maupun produksi, dan agent tetap yang memutuskan.
// ────────────────────────────────────────────────────────────────

/** Satu orang yang bisa diajak bicara di kantor ini. */
export interface Colleague {
  /** id agent QwenPaw. Inilah yang dipakai agent saat mengalihkan. */
  id: string;
  name: string;
  /** Satu frasa: dia mengurus apa. Muncul di label & direktori. */
  title: string;
}

/**
 * Penanda alih. Sengaja pendek dan tidak menyerupai markdown apa pun, supaya
 * (a) model gampang menirunya persis, dan (b) potongannya yang belum utuh
 * mudah disembunyikan selagi teks masih mengalir.
 *
 *   @alih: wati | pemilik nanya tagihan yang lewat tempo
 */
const MARKER = "@alih:";

/** Karakter hiasan markdown yang sering dibubuhkan model ke barisnya. */
const DECOR = /[*_`>#]/g;

export interface ParsedHandoff {
  /** id tujuan APA ADANYA dari model — belum tentu ada di kantor ini. */
  to: string;
  /** Satu kalimat konteks untuk yang menerima. Boleh kosong. */
  brief: string;
  /** Sisa balasan setelah baris penanda dibuang — kalimat pamitnya. */
  rest: string;
}

/**
 * Cari baris penanda di dalam balasan. Dicari di SELURUH teks, bukan cuma baris
 * pertama: model diminta menaruhnya di depan, tapi sesekali ia menulis satu
 * kalimat pengantar lebih dulu, dan menolak alih karena posisinya bergeser satu
 * baris akan terasa seperti fiturnya rusak.
 */
export function parseHandoff(text: string): ParsedHandoff | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const bare = lines[i].replace(DECOR, "").trim();
    if (!bare.toLowerCase().startsWith(MARKER)) continue;

    const body = bare.slice(MARKER.length).trim();
    const bar = body.indexOf("|");
    const rawTo = (bar === -1 ? body : body.slice(0, bar)).trim();
    // Model kadang membungkus id dengan kutip atau menutupnya dengan titik.
    const to = rawTo.replace(/^["'<(\[]+/, "").replace(/["'>)\].,;:]+$/, "");
    if (!to) continue;

    return {
      to,
      brief: bar === -1 ? "" : body.slice(bar + 1).trim(),
      rest: [...lines.slice(0, i), ...lines.slice(i + 1)].join("\n").trim(),
    };
  }
  return null;
}

/**
 * Sembunyikan penanda yang baru setengah tertulis.
 *
 * Tanpa ini pembaca melihat `@`, lalu `@al`, lalu `@alih:` muncul sekejap di
 * layar sebelum hilang — protokol internal bocor sebagai kedipan. Dipanggil
 * tiap delta; begitu penandanya utuh, `parseHandoff` yang mengambil alih.
 */
export function hidePendingMarker(text: string): string {
  const cut = text.lastIndexOf("\n");
  const tail = text.slice(cut + 1).replace(DECOR, "").trim().toLowerCase();
  if (tail && MARKER.startsWith(tail)) return text.slice(0, Math.max(cut, 0));
  return text;
}

/** Teks yang boleh tampil selagi balasan masih mengalir. */
export function visibleText(text: string): string {
  const found = parseHandoff(text);
  return found ? found.rest : hidePendingMarker(text);
}

// ── Yang dikirim ke agent ───────────────────────────────────────

/**
 * Direktori kantor + aturan mengalihkan, ditempel di DEPAN pesan pertama tiap
 * sesi.
 *
 * Kenapa di pesan, bukan di `AGENTS.md` (yang memang file system prompt di
 * QwenPaw): file harus ditulis ulang ke SETIAP agent tiap kali ada yang
 * direkrut atau dipecat, dan tetap basi untuk agent yang dibuat di luar
 * Clawmpany. Preamble per sesi selalu benar tanpa satu pun tulisan ke workspace.
 *
 * Hanya sekali per sesi, jadi ia tidak pernah jadi pesan TERAKHIR — dan panel
 * "Pekerjaan terakhir" (yang membaca dua pesan buncit) tetap bersih.
 */
export function buildDirectory(params: {
  self: Colleague;
  company: string;
  others: Colleague[];
}): string {
  const { self, company, others } = params;
  const roster = others.map((c) => `- ${c.id} — ${c.name} — ${c.title}`).join("\n");

  return `<kantor>
Kamu ${self.name} (${self.title}) di ${company}. Lawan bicaramu pemilik perusahaan.

Kolega di kantor ini — id, nama, urusannya:
${roster || "- (belum ada kolega lain)"}

ALIHKAN pembicaraan kalau yang diminta jelas bidang kolega, atau kalau pemilik
memang meminta bicara dengan orang tertentu. Caranya: balas dengan baris ini,
sendirian di barisnya, tanpa tanda kutip dan tanpa format apa pun:

@alih: <id-kolega> | <satu kalimat konteks untuk dia>

Setelah itu boleh satu kalimat pamit, lalu berhenti — JANGAN ikut menjawab
pertanyaannya, kolega yang akan menjawab. Pakai id persis seperti di daftar.

Jangan mengalihkan ke dirimu sendiri, jangan mengalihkan karena tidak tahu
jawabannya (bilang tidak tahu), dan jangan mengalihkan cuma karena ada nama
kolega tersebut di kalimat pemilik.
</kantor>

`;
}

/**
 * Pesan yang diterima karyawan baru saat pembicaraan dialihkan kepadanya.
 *
 * Isinya tiga hal: kenapa dia dipanggil, apa yang sudah dibicarakan, dan apa
 * yang sebenarnya ditanyakan. Tanpa bagian ketiga, karyawan baru cuma bisa
 * menyapa — dan pemilik harus mengetik ulang pertanyaannya, yang persis
 * friction yang mau dihapus fitur ini.
 */
export function buildHandover(params: {
  from: Colleague;
  brief: string;
  transcript: Array<{ who: string; text: string }>;
  ask: string;
}): string {
  const { from, brief, transcript, ask } = params;
  const lines = transcript.map((t) => `[${t.who}] ${t.text}`).join("\n");

  return `<pengalihan>
Pembicaraan ini baru dialihkan kepadamu oleh ${from.name} (${from.title}).
${brief ? `Alasannya: ${brief}` : "Tidak ada catatan alasan."}

Yang sudah dibicarakan:
${lines || "(belum ada)"}

Yang ditunggu pemilik sekarang: ${ask}
</pengalihan>

Perkenalkan dirimu dalam SATU kalimat pendek, lalu langsung jawab. Jangan
mengulang isi percakapan di atas, dan jangan bertanya ulang apa yang sudah
jelas di sana.`;
}

/** Berapa giliran terakhir yang ikut dibawa sebagai konteks. */
export const HANDOVER_TURNS = 6;
/** Panjang tiap giliran dalam ringkasan. Cukup untuk maksud, bukan untuk arsip. */
export const HANDOVER_CHARS = 500;

// ── Menamai orang ───────────────────────────────────────────────

/**
 * Satu frasa pendek dari deskripsi agent. Deskripsi QwenPaw bisa sepanjang
 * paragraf; yang dibutuhkan direktori cuma "dia mengurus apa".
 */
export function describeRole(description: string, fallback = "karyawan"): string {
  const first = description
    .split("\n")
    .map((l) => l.replace(DECOR, "").trim())
    .find((l) => l.length > 0);
  if (!first) return fallback;
  const clipped = first.split(/(?<=[.!?])\s/)[0] ?? first;
  return clipped.length > 72 ? `${clipped.slice(0, 69).trimEnd()}…` : clipped;
}

/** Cari kolega dari id, atau dari nama yang diketik manusia (`/ke wati`). */
export function findColleague(
  colleagues: Colleague[],
  needle: string,
): Colleague | undefined {
  const want = needle.trim().toLowerCase();
  if (!want) return undefined;
  return (
    colleagues.find((c) => c.id.toLowerCase() === want) ??
    colleagues.find((c) => c.name.toLowerCase() === want) ??
    colleagues.find((c) => c.name.toLowerCase().startsWith(want)) ??
    colleagues.find((c) => c.id.toLowerCase().startsWith(want))
  );
}
