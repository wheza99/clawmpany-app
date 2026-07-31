// Pasang AGENTS.md manajer gedung ke QwenPaw.
//
//     npm run concierge:sync            # tulis
//     npm run concierge:sync -- --dry   # tampilkan hasilnya, jangan tulis
//
// Isinya dirakit dari dua file di concierge/:
//   manager.md          — cara kerja manajer gedung
//   hiring-protocol.md  — bentuk JSON usulan rekrut, di antara dua penanda
//
// KENAPA DIRAKIT DI SINI, BUKAN SATU FILE. Protokol rekrut harus tetap sejalan
// dengan lib/roles.ts dan lib/hire-draft.ts; memisahkannya membuat jelas bagian
// mana yang ikut berubah saat kode berubah. Penandanya juga dipertahankan
// supaya sunting manual di QwenPaw pada bagian LAIN tidak terhapus kalau suatu
// saat skrip ini dikembalikan ke mode tempel.
//
// Perubahan ini menyentuh instance produksi. Isi AGENTS.md yang sekarang
// disalin dulu ke concierge/.previous-AGENTS.md sebelum ditimpa, jadi tidak ada
// yang hilang tanpa jejak. Tanpa --dry ia benar-benar menulis.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BEGIN = "<!-- clawmpany:hiring-protocol:begin -->";
const END = "<!-- clawmpany:hiring-protocol:end -->";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dry = process.argv.includes("--dry");

const base = (process.env.QWENPAW_URL ?? process.env.PAW_URL ?? "").replace(/\/$/, "");
const token = process.env.QWENPAW_AUTH_TOKEN ?? process.env.PAW_AUTH_TOKEN ?? "";
const agentId = process.env.QWENPAW_CONCIERGE_ID ?? "clawmpany";

if (!base || !token) {
  console.error(
    "QWENPAW_URL dan QWENPAW_AUTH_TOKEN belum terisi.\n" +
      "Jalankan lewat `npm run concierge:sync` (memuat .env.local), bukan `node` langsung.",
  );
  process.exit(1);
}

const headers = { Authorization: `Bearer ${token}`, "X-Agent-Id": agentId };
const fileUrl = `${base}/api/workspace/files/AGENTS.md`;

/** Isi satu sumber tanpa komentar HTML pembukanya — itu catatan untuk manusia. */
async function source(name) {
  const raw = await readFile(resolve(root, "concierge", name), "utf8");
  return raw.replace(/^<!--[\s\S]*?-->\s*/, "").trim();
}

async function readCurrent() {
  const res = await fetch(fileUrl, { headers });
  if (res.status === 404) return "";
  if (!res.ok) throw new Error(`GET AGENTS.md → ${res.status} ${await res.text()}`);
  const data = await res.json();
  return typeof data?.content === "string" ? data.content : "";
}

const [manager, protocol, current] = await Promise.all([
  source("manager.md"),
  source("hiring-protocol.md"),
  readCurrent(),
]);

const next = `${manager}\n\n${BEGIN}\n\n${protocol}\n\n${END}\n`;

// QwenPaw membuang baris kosong di ujung saat menyimpan, jadi apa yang dikirim
// tidak pernah sama persis dengan apa yang dibaca kembali. Membandingkan mentah
// membuat skrip ini selalu merasa perlu menulis ulang — dan penulisan ulang
// yang tidak perlu itulah yang akan menimpa salinan cadangan di bawah.
if (current.trimEnd() === next.trimEnd()) {
  console.log(`AGENTS.md ${agentId} sudah mutakhir — tidak ada yang ditulis.`);
  process.exit(0);
}

console.log(
  `${agentId} @ ${base}\n` +
    `  sekarang : ${current.length} karakter` +
    `${current.includes(BEGIN) ? " (sudah pernah disinkron)" : " (belum pernah disinkron)"}\n` +
    `  jadi     : ${next.length} karakter`,
);

if (dry) {
  console.log(`\n--- hasil (tidak ditulis) ---\n${next}`);
  process.exit(0);
}

// Salinan yang akan ditimpa, supaya keputusan ini bisa ditinjau ulang besok.
// Hanya isi yang BUKAN keluaran skrip ini yang disalin: kalau tidak, sync kedua
// akan mengganti satu-satunya jejak isi aslinya dengan salinan dirinya sendiri.
if (current && !current.includes(BEGIN)) {
  const backup = resolve(root, "concierge/.previous-AGENTS.md");
  await writeFile(backup, current, "utf8");
  console.log(`  salinan  : concierge/.previous-AGENTS.md`);
}

const res = await fetch(fileUrl, {
  method: "PUT",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ content: next }),
});
if (!res.ok) {
  console.error(`PUT AGENTS.md → ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log("Terpasang.");
