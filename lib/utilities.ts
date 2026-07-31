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
    summary: "Reads and answers business WhatsApp through a number you have already linked.",
    examples: [
      "Sweeping unread messages across every number each morning",
      "Answering the questions leads ask over and over",
      "Boiling a long thread down to one paragraph of decisions",
    ],
    requires: ["CLAWMPANY_MCP_WASHARP_URL"],
    caution:
      "A sent message reaches a real person and cannot be taken back. Leave send confirmation switched on.",
    build: () => {
      const url = env("CLAWMPANY_MCP_WASHARP_URL");
      if (!url) return null;
      const token = env("CLAWMPANY_MCP_WASHARP_TOKEN");
      return {
        name: "washarp",
        description: "WhatsApp — read chats, send messages, sweep unread.",
        transport: "http",
        url,
        headers: bearer(token),
        enabled: true,
      };
    },
  },
  {
    key: "tavily_web",
    name: "Web search (Tavily)",
    summary: "Searches and reads the web so answers rest on what is true today.",
    examples: [
      "Checking current prices or regulations before drafting a quote",
      "Looking up competitor news for the weekly report",
      "Verifying a claim before it goes into content",
    ],
    requires: ["CLAWMPANY_MCP_TAVILY_KEY"],
    build: () => {
      const key = env("CLAWMPANY_MCP_TAVILY_KEY");
      if (!key) return null;
      return {
        name: "tavily_mcp",
        description: "Live web search.",
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
    name: "Conversation archive (Pabrik)",
    summary: "Reads old conversations back so decisions are not made twice from scratch.",
    examples: [
      "Finding what was decided about a client back then",
      "Pulling one summary out of several separate sessions",
    ],
    requires: ["CLAWMPANY_MCP_PABRIK_URL"],
    build: () => {
      const url = env("CLAWMPANY_MCP_PABRIK_URL");
      if (!url) return null;
      const token = env("CLAWMPANY_MCP_PABRIK_TOKEN");
      return {
        name: "pabrik",
        description: "Stored conversation archive.",
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
