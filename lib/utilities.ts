// ────────────────────────────────────────────────────────────────
// lib/utilities.ts — Peralatan yang disediakan gedung.
//
// MCP = utilitas gedung. Agent tanpa peralatan cuma bisa mengarang; dengan
// peralatan ia bekerja pada data sungguhan — WhatsApp yang benar-benar milikmu,
// pencarian web yang benar-benar hidup. Itulah yang membuat "kantor" jadi kata
// yang jujur, bukan metafora.
//
// Katalog ini juga kanal distribusi: tiap tool MCP yang dibangun sebagai produk
// tersendiri masuk ke sini, dan merekrut karyawan berarti memasangkannya.
//
// KENAPA ALAMATNYA DARI ENV, BUKAN DI-HARDCODE DI SINI.
// Alamat instance tiap peralatan berbeda per pemasangan (dan beberapa belum
// punya domain tetap). Menuliskan tebakan di sini menghasilkan peralatan yang
// tampak tersedia lalu gagal saat dipasang — lebih buruk daripada terang-
// terangan berkata "isi dulu env ini". Peralatan yang env-nya kosong tetap
// TAMPIL, tapi ditandai belum siap beserta nama variabelnya.
// ────────────────────────────────────────────────────────────────

import type { McpClientSpec } from "@/lib/qwenpaw";

export interface Utility {
  key: string;
  name: string;
  /** Satu kalimat: agent bisa apa dengan ini. */
  summary: string;
  /** Contoh pekerjaan nyata — ini yang bikin orang paham gunanya. */
  examples: string[];
  /** Env var yang harus terisi di server. Kosong = selalu siap. */
  requires: string[];
  /** Peringatan yang harus dibaca sebelum dipasang. */
  caution?: string;
  build: () => McpClientSpec | null;
}

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/** Header Authorization bila tokennya ada; objek kosong bila tidak. */
function bearer(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const UTILITY_CATALOG: Utility[] = [
  {
    key: "washarp_whatsapp",
    name: "WhatsApp (Washarp)",
    summary: "Membaca dan membalas WhatsApp bisnis lewat nomor yang sudah kamu sambungkan.",
    examples: [
      "Menyapu pesan belum dibaca di semua nomor tiap pagi",
      "Membalas pertanyaan berulang dari calon pelanggan",
      "Merangkum percakapan panjang jadi satu paragraf keputusan",
    ],
    requires: ["CLAWMPANY_MCP_WASHARP_URL"],
    caution:
      "Pesan terkirim sampai ke orang sungguhan dan tidak bisa ditarik. Biarkan konfirmasi kirim tetap menyala.",
    build: () => {
      const url = env("CLAWMPANY_MCP_WASHARP_URL");
      if (!url) return null;
      const token = env("CLAWMPANY_MCP_WASHARP_TOKEN");
      return {
        name: "washarp",
        description: "WhatsApp — baca chat, kirim pesan, sapu pesan belum dibaca.",
        transport: "http",
        url,
        headers: bearer(token),
        enabled: true,
      };
    },
  },
  {
    key: "tavily_web",
    name: "Pencarian web (Tavily)",
    summary: "Mencari dan membaca halaman web supaya jawabannya berdasar kenyataan hari ini.",
    examples: [
      "Mengecek harga atau regulasi terbaru sebelum menyusun penawaran",
      "Mencari kabar tentang pesaing untuk laporan mingguan",
      "Memverifikasi klaim sebelum masuk ke konten",
    ],
    requires: ["CLAWMPANY_MCP_TAVILY_KEY"],
    build: () => {
      const key = env("CLAWMPANY_MCP_TAVILY_KEY");
      if (!key) return null;
      return {
        name: "tavily_mcp",
        description: "Pencarian web langsung.",
        transport: "stdio",
        command: "npx",
        args: ["-y", "tavily-mcp@latest"],
        env: { TAVILY_API_KEY: key },
        enabled: true,
      };
    },
  },
  {
    key: "pabrik_chats",
    name: "Arsip percakapan (Pabrik)",
    summary: "Membaca kembali percakapan lama supaya keputusan tidak diulang dari nol.",
    examples: [
      "Mencari apa yang dulu diputuskan tentang satu klien",
      "Menyusun ringkasan dari beberapa sesi yang terpisah",
    ],
    requires: ["CLAWMPANY_MCP_PABRIK_URL"],
    build: () => {
      const url = env("CLAWMPANY_MCP_PABRIK_URL");
      if (!url) return null;
      const token = env("CLAWMPANY_MCP_PABRIK_TOKEN");
      return {
        name: "pabrik",
        description: "Arsip percakapan tersimpan.",
        transport: "http",
        url,
        headers: bearer(token),
        enabled: true,
      };
    },
  },
];

export function findUtility(key: string): Utility | undefined {
  return UTILITY_CATALOG.find((u) => u.key === key);
}

export interface UtilityOffer {
  key: string;
  name: string;
  summary: string;
  examples: string[];
  caution?: string;
  /** Siap dipasang. False = env server belum diisi. */
  ready: boolean;
  /** Env yang masih kosong — ditampilkan apa adanya, bukan disembunyikan. */
  missing: string[];
}

/** Katalog dalam bentuk yang aman dikirim ke browser (tanpa kredensial). */
export function offers(): UtilityOffer[] {
  return UTILITY_CATALOG.map((u) => {
    const missing = u.requires.filter((name) => !env(name));
    return {
      key: u.key,
      name: u.name,
      summary: u.summary,
      examples: u.examples,
      caution: u.caution,
      ready: missing.length === 0,
      missing,
    };
  });
}
