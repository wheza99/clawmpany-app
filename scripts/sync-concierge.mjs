// Pasang protokol rekrut ke AGENTS.md manajer gedung di QwenPaw.
//
//     npm run concierge:sync            # tulis
//     npm run concierge:sync -- --dry   # tampilkan hasilnya, jangan tulis
//
// KENAPA MENEMPEL, BUKAN MENGGANTI. AGENTS.md agent `clawmpany` ditulis tangan
// (dia manajer gedung, bukan karyawan hasil rekrut) dan isinya jauh lebih luas
// daripada urusan rekrut. Skrip ini hanya menguasai satu blok bertanda, membuang
// versi lamanya, lalu menempelkan yang baru — jadi menjalankannya dua kali tidak
// menggandakan apa pun, dan tulisan lain di file itu tidak pernah tersentuh.
//
// Perubahan ini menyentuh instance produksi. Tanpa --dry ia benar-benar menulis.

import { readFile } from "node:fs/promises";
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

/** Isi protokol tanpa komentar HTML pembukanya (itu catatan untuk manusia). */
async function protocol() {
  const raw = await readFile(resolve(root, "concierge/hiring-protocol.md"), "utf8");
  return raw.replace(/^<!--[\s\S]*?-->\s*/, "").trim();
}

async function readCurrent() {
  const res = await fetch(fileUrl, { headers });
  if (res.status === 404) return "";
  if (!res.ok) throw new Error(`GET AGENTS.md → ${res.status} ${await res.text()}`);
  const data = await res.json();
  return typeof data?.content === "string" ? data.content : "";
}

function merge(current, block) {
  const wrapped = `${BEGIN}\n\n${block}\n\n${END}`;
  const start = current.indexOf(BEGIN);
  const end = current.indexOf(END);
  if (start !== -1 && end > start) {
    return current.slice(0, start) + wrapped + current.slice(end + END.length);
  }
  return current.trim() ? `${current.trimEnd()}\n\n${wrapped}\n` : `${wrapped}\n`;
}

const current = await readCurrent();
const next = merge(current, await protocol());

if (current === next) {
  console.log(`AGENTS.md ${agentId} sudah mutakhir — tidak ada yang ditulis.`);
  process.exit(0);
}

console.log(
  `${agentId} @ ${base}\n` +
    `  sekarang : ${current.length} karakter${current.includes(BEGIN) ? " (sudah ada blok protokol)" : ""}\n` +
    `  jadi     : ${next.length} karakter`,
);

if (dry) {
  console.log(`\n--- hasil (tidak ditulis) ---\n${next}`);
  process.exit(0);
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
