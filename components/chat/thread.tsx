"use client";

import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { useTheme } from "next-themes";

import {
  HANDOVER_CHARS,
  HANDOVER_TURNS,
  buildHandover,
  findColleague,
  parseHandoff,
  visibleText,
  type Colleague,
} from "@/lib/handoff";
import { scanForHireDraft } from "@/lib/hire-draft";
import { chatStream, newId, newSessionId, type PawPhase } from "@/lib/paw";
import { cn } from "@/lib/utils";
import { ROLE_CATALOG } from "@/lib/roles";
import type { OfficeBrief, OfficeReport } from "@/lib/report";
import { MarkdownText } from "@/components/markdown-text";
import { AgentAvatar } from "@/components/office/agent-avatar";
import { AgentDialog } from "@/components/office/agent-dialog";
import { HireCatalog } from "@/components/office/hire-catalog";
import { HireDraftCard } from "@/components/office/hire-draft-card";
import { OfficeList } from "@/components/office/office-list";
import { ReportView } from "@/components/office/report-view";
import { IdentityRow } from "@/components/terminal/identity-row";
import { Elapsed, Spinner } from "@/components/terminal/spinner";
import {
  TermBlock,
  TermRow,
  type TermTone,
} from "@/components/terminal/primitives";

/**
 * SELURUH antarmuka Clawmpany. Satu kolom di tengah, satu halaman, tanpa menu.
 *
 * Dulu ada tiga halaman — laporan kantor, daftar perusahaan, dan ruang chat —
 * dengan rel navigasi untuk berpindah di antaranya. Ketiganya sekarang ada di
 * sini. Yang jadi kerangka cuma `IdentityRow`: nama produk (atau pemilih
 * perusahaan begitu kamu masuk) di kiri, ikon akun di kanan. Selebihnya
 * percakapan.
 *
 * ── KE MANA PERGINYA HALAMAN-HALAMAN ITU ────────────────────────────────────
 *  · Laporan kantor    → `/laporan`, dirender sebagai blok di transkrip.
 *  · Semua perusahaan  → `/semua`, sama.
 *  · Katalog rekrut    → `/rekrut`, sama — dan manajer gedung tetap bisa
 *                        mengusulkan sendiri lewat `HireDraftCard`.
 *  · Pengaturan karyawan → `AgentDialog`, dibuka dengan mengklik namanya di
 *                        mana pun ia muncul: di atas balasannya, atau di
 *                        daftar karyawan dalam blok laporan.
 *
 * Itu bukan tiga layar yang disembunyikan di balik perintah. Bedanya nyata:
 * jawabannya muncul DI TEMPAT pertanyaannya diketik, jadi kalimat berikutnya
 * masih punya konteks angka yang barusan terbaca — yang justru hilang setiap
 * kali orang harus pergi ke halaman lain untuk melihatnya.
 *
 * Visual grammar lifted from pabrik-startup's components/assistant-ui/thread.tsx
 * — a fixed-width `❯` gutter opens every line, rules are hairlines, nothing is
 * rounded, and the only interactive elements are a textarea and a send/stop
 * button. The difference is the runtime: where pabrik-startup drives this from
 * an assistant-ui runtime over an AI-SDK stream (and the MODEL calls frontend
 * tools like set_theme), this talks straight to the /api/chat proxy
 * (→ paw.wheza.id QwenPaw) through lib/paw.ts.
 *
 * Tool bawaan QwenPaw memang disiarkan terstruktur (`plugin_call`), tapi daftar
 * tool sebuah agent tidak bisa ditambah dari sisi permintaan — lihat catatan
 * panjang di lib/handoff.ts. Jadi kemampuan yang dijalankan browser dicapai
 * lewat dua jalur teks: slash command yang dicegat di sini (`/light`, `/new`,
 * `/ke`…) dan satu baris penanda `@alih:` yang boleh ditulis agent sendiri.
 * Keduanya tampil sebagai blok terminal bernama `lokal`.
 *
 * Lima hal yang membuat transkrip ini bisa dibaca sambil berjalan:
 *
 *  1. SETIAP giliran melaporkan tahapnya (lib/paw.ts `PawPhase`) — spinner yang
 *     berputar plus "berpikir… 12.4s", bukan kursor berkedip yang tidak bisa
 *     dibedakan dari aplikasi yang menggantung.
 *  2. Setiap gelembung diberi NAMA — satu kata untuk manusianya, nama (dan id)
 *     agent untuk lawan bicaranya. Tanpa itu, kantor berisi 20 karyawan
 *     menghasilkan 20 transkrip yang terlihat persis sama.
 *  3. Instruksi sesi disusun SERVER (lib/prompt.ts) dan menumpang pada pesan
 *     pertama yang benar-benar diketik orang — jadi agent sudah tahu keadaan
 *     kantor sebelum menjawab kalimat pertama, tanpa satu pun giliran yang
 *     terbakar hanya untuk menyapa.
 *  4. Kanal tool-call yang tidak ada itu juga alasan merekrut lewat chat memakai
 *     SATU BLOK ```json di dalam balasan biasa (lib/hire-draft.ts). Manajer
 *     gedung menulis usulannya sebagai teks; `AssistantBody` memungutnya dan
 *     menukarnya dengan kartu konfirmasi. Kalau pemungutnya gagal, yang tersisa
 *     adalah blok kode yang terbaca manusia — bukan gelembung kosong.
 *  5. Dengan `colleagues`, pembicaraan bisa BERPINDAH orang di tengah jalan.
 *     Tiap karyawan memegang sesinya sendiri; yang berganti cuma siapa yang
 *     menjawab, dan blok `alih` mencatat perpindahannya di transkrip.
 */

interface CommandBlock {
  label: string;
  tone?: TermTone;
  rows?: Array<{ label: string; value: string }>;
  note?: string;
}

/**
 * Layar yang dulu berupa halaman, kini jadi blok di transkrip.
 *
 * Yang disimpan di state cuma NAMANYA. Isinya diambil `PanelView` saat blok itu
 * dipasang — jadi angka yang kamu minta lima menit lalu tidak diam-diam
 * berubah, dan transkrip tidak perlu menyimpan satu laporan penuh per baris.
 */
type PanelKind = "report" | "all" | "hire";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** `Date.now()` saat baris ini masuk transkrip — jam kecil di gelembungnya. */
  at: number;
  reasoning?: string;
  error?: boolean;
  streaming?: boolean;
  /** Tahap giliran ini selagi `streaming`. */
  phase?: PawPhase;
  /** `Date.now()` saat giliran dikirim — sumber angka detik di indikator. */
  startedAt?: number;
  /** id karyawan yang mengucapkannya. Diisi hanya saat pembicaraan bisa pindah. */
  speaker?: string;
  /** Render as a labelled terminal block instead of markdown text. */
  block?: CommandBlock;
  /** Render a whole ex-halaman di sini. Mengalahkan `block` dan `text`. */
  panel?: PanelKind;
}

/**
 * `14:32` — jam kirim, zona waktu browsernya.
 *
 * Aman dibaca di sini meski komponennya juga dirender di server: transkrip
 * SELALU mulai kosong, jadi tidak ada satu pun jam yang ikut dirender server
 * dan bisa berbeda dari yang dihitung ulang browser saat hidrasi.
 */
const CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

const Clock: FC<{ at: number }> = ({ at }) => (
  <time
    dateTime={new Date(at).toISOString()}
    className="text-term-dim shrink-0 text-[11px] leading-5 tabular-nums select-none"
  >
    {CLOCK.format(at)}
  </time>
);

const THEME_COMMANDS = new Set(["light", "dark", "system"]);

/** Apa yang sebenarnya sedang terjadi, per tahap aliran. */
const PHASE_LABEL: Record<PawPhase, string> = {
  connecting: "reaching paw.wheza.id",
  waiting: "waiting for a reply",
  thinking: "thinking",
  writing: "writing",
};

/**
 * Berapa kali pembicaraan boleh berpindah dalam SATU giliran pengguna.
 *
 * Dua karyawan yang sama-sama merasa ini bukan bidangnya akan saling melempar
 * sampai kuota habis kalau tidak dibatasi — dan yang menonton cuma melihat
 * layar berjalan sendiri. Dua sudah cukup untuk "manajer → karyawan yang tepat".
 */
const MAX_SWITCH_PER_TURN = 2;

export interface ThreadProps {
  /**
   * Karyawan yang diajak bicara. Kosong = agent bawaan server. Dikirim ke
   * /api/chat, yang menolaknya kalau id itu bukan penghuni kantor si pemanggil
   * — jadi mengganti nilai ini di browser tidak membuka agent orang lain.
   */
  agentId?: string;
  /** Nama yang tampil di gelembung agent. Jatuh ke `agentId` kalau kosong. */
  agentName?: string;
  /** Nama panggilan penggunanya, SATU KATA (lihat lib/office.ts viewerName). */
  userName?: string;
  /** Clerk menyala. Mati = tanpa pemilih perusahaan dan tanpa tombol akun. */
  authOn: boolean;
  /** Nama kantor — ikut tertulis di berkas karyawan yang direkrut dari sini. */
  companyName: string;
  /**
   * Semua yang boleh diajak bicara di layar ini, TERMASUK yang membuka
   * percakapan. Diisi = pembicaraan bisa berpindah karyawan. Server tetap
   * memeriksa ulang setiap tujuan, jadi daftar ini soal tampilan, bukan izin.
   */
  colleagues?: Colleague[];
}

export const Thread: FC<ThreadProps> = ({
  agentId,
  agentName,
  userName = "you",
  authOn,
  companyName,
  colleagues,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  /** Karyawan yang dialog pengaturannya sedang terbuka. */
  const [managing, setManaging] = useState<Colleague | null>(null);

  const roster = colleagues ?? [];
  const canSwitch = roster.length > 1;
  const opening = agentId ?? roster[0]?.id ?? "";

  /** Siapa yang menjawab sekarang. */
  const [speaking, setSpeaking] = useState(opening);
  const speakingRef = useRef(opening);

  const { setTheme, resolvedTheme } = useTheme();

  // Satu sesi PER KARYAWAN, dibuat saat dia pertama kali bicara dan stabil
  // selama mount ini supaya QwenPaw menyambung riwayatnya. Kalau semua berbagi
  // satu id sesi, tiap karyawan akan membaca percakapan yang ditulis orang lain
  // sebagai riwayatnya sendiri.
  const sessionsRef = useRef<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Transkrip yang terlihat, dicatat terpisah dari state React supaya bisa
   * dibaca di tengah rantai async — state di dalam closure sudah basi saat alih
   * terjadi. Inilah yang dititipkan ke karyawan yang menerima alih.
   */
  const historyRef = useRef<Array<{ who: string; text: string }>>([]);
  const lastAskRef = useRef("");

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const isEmpty = messages.length === 0;

  const nameOf = (id: string): Colleague =>
    roster.find((c) => c.id === id) ?? {
      id,
      name: agentName || id || "agent",
      title: "employee",
    };

  /**
   * Boleh diatur dari sini atau tidak.
   *
   * Manajer gedung tidak pernah masuk roster mana pun (lihat lib/qwenpaw.ts),
   * jadi semua rute manajemennya menjawab 404 — foto yang bisa diklik untuknya
   * cuma jalan buntu yang terbaca sebagai kerusakan. Dialah yang membuka
   * percakapan; semua nama LAIN datang dari roster kantor dan memang bisa
   * diatur.
   */
  const canManage = (id?: string): boolean =>
    Boolean(id) && canSwitch && id !== opening;

  const nearBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  const scrollToBottom = useCallback((force: boolean) => {
    if (force || stickToBottomRef.current) {
      const el = scrollerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, []);

  // Keep pinned to the bottom while streaming, unless the reader scrolled up.
  useEffect(() => {
    scrollToBottom(false);
  }, [messages, scrollToBottom]);

  const onViewportScroll = () => {
    stickToBottomRef.current = nearBottom();
  };

  const patchMessage = (id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const dropMessage = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const pushBlock = (block: CommandBlock) => {
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "assistant", text: "", at: Date.now(), block },
    ]);
  };

  /** Echo perintahnya, lalu pasang satu ex-halaman di bawahnya. */
  const echoPanel = (raw: string, panel: PanelKind) => {
    setMessages((prev) => {
      const at = Date.now();
      return [
        ...prev,
        { id: newId(), role: "user" as const, text: raw, at },
        { id: newId(), role: "assistant" as const, text: "", at, panel },
      ];
    });
  };

  const remember = (who: string, text: string) => {
    if (!text.trim()) return;
    historyRef.current = [
      ...historyRef.current,
      { who, text: text.slice(0, HANDOVER_CHARS) },
    ].slice(-HANDOVER_TURNS);
  };

  // ----------------------------------------------------------------- commands

  /** Echo `raw` as a user line, then a labelled block as the reply. */
  const echoBlock = (raw: string, block: CommandBlock) => {
    const at = Date.now();
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "user", text: raw, at },
      { id: newId(), role: "assistant", text: "", at, block },
    ]);
  };

  /**
   * Jalankan satu slash command. Semuanya ditangani di browser — yang
   * dikembalikan adalah pekerjaan yang masih harus DITUNGGU (`/ke` memanggil
   * karyawan lain), atau null kalau sudah selesai saat itu juga.
   */
  const handleCommand = (raw: string): (() => Promise<void>) | null => {
    const body = raw.slice(1).trim();
    const name = (body.split(/\s+/)[0] ?? "").toLowerCase();
    const rest = body.slice(name.length).trim();

    if (THEME_COMMANDS.has(name)) {
      setTheme(name);
      echoBlock(raw, {
        label: "display",
        tone: "dim",
        rows: [{ label: "theme", value: name }],
        note:
          name === "system" && resolvedTheme ? `resolved ${resolvedTheme}` : undefined,
      });
      return null;
    }

    if (name === "new" || name === "clear") {
      // Bersihkan transkrip dan buang id sesinya, jadi pesan berikutnya membuka
      // sesi QwenPaw yang benar-benar baru — lengkap dengan instruksi sesinya
      // lagi. Tanpa echo: kembalinya layar pembuka yang jadi konfirmasinya.
      setMessages([]);
      sessionsRef.current = {};
      historyRef.current = [];
      lastAskRef.current = "";
      speakingRef.current = opening;
      setSpeaking(opening);
      return null;
    }

    if (canSwitch && (name === "who" || name === "siapa")) {
      echoBlock(raw, {
        label: "office",
        tone: "dim",
        rows: roster.map((c) => ({
          label: c.id === speakingRef.current ? `${c.id} ←` : c.id,
          value: c.name,
        })),
        note: `You are talking to ${nameOf(speakingRef.current).name}. Type /to <name> to switch — or just ask in plain words.`,
      });
      return null;
    }

    if (canSwitch && (name === "to" || name === "ke")) {
      if (!rest) {
        echoBlock(raw, {
          label: "error",
          tone: "warn",
          note: "Name who you want to talk to — for example /to wati.",
        });
        return null;
      }
      const target = findColleague(roster, rest);
      if (!target) {
        echoBlock(raw, {
          label: "error",
          tone: "warn",
          note: `No one called "${rest}" in this office. Type /who for the list.`,
        });
        return null;
      }
      if (target.id === speakingRef.current) {
        echoBlock(raw, {
          label: "handover",
          tone: "dim",
          note: `You are already talking to ${target.name}.`,
        });
        return null;
      }
      // Diminta pengguna secara eksplisit, jadi tidak perlu membakar satu
      // giliran model cuma untuk memutuskan hal yang sudah diputuskan.
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", text: raw, at: Date.now() },
      ]);
      return () =>
        switchTo({
          to: target,
          brief: `${userName} asked to speak with you directly.`,
          ask:
            lastAskRef.current ||
            "No question yet — introduce yourself and offer to help.",
          depth: 0,
        });
    }

    // Tiga layar yang dulu berupa halaman tersendiri. Dipasang apa adanya di
    // transkrip — tanpa memanggil QwenPaw, karena semuanya dijawab server
    // aplikasi ini sendiri dan tidak ada yang perlu dipikirkan model.
    if (name === "report" || name === "office" || name === "laporan") {
      echoPanel(raw, "report");
      return null;
    }
    if (name === "all" || name === "companies" || name === "semua") {
      echoPanel(raw, "all");
      return null;
    }
    if (name === "hire" || name === "rekrut") {
      echoPanel(raw, "hire");
      return null;
    }

    if (name === "help") {
      echoBlock(raw, {
        label: "help",
        tone: "dim",
        note: "Slash commands run in this browser — none of them reach paw.wheza.id. Anything else you type is sent as chat.",
        rows: [
          { label: "/report", value: "the office today" },
          { label: "/all", value: "every company you own" },
          { label: "/hire", value: "role catalogue" },
          ...(canSwitch
            ? [
                { label: "/to <name>", value: "switch employee" },
                { label: "/who", value: "everyone in this office" },
              ]
            : []),
          { label: "/new", value: "start a fresh conversation" },
          { label: "/light · /dark · /system", value: "switch theme" },
          { label: "/help", value: "this list" },
        ],
      });
      return null;
    }

    echoBlock(raw, {
      label: "error",
      tone: "warn",
      note: `unknown command: ${raw} — type /help for the list.`,
    });
    return null;
  };

  // --------------------------------------------------------------------- alih

  /**
   * Sambungkan ke karyawan lain, lalu biarkan DIA yang menjawab.
   *
   * Ini yang membedakan "ganti lawan bicara" dari "operator menyambungkan
   * telepon": penerimanya langsung dapat konteks — kenapa dia dipanggil, apa
   * yang sudah dibicarakan, dan apa yang ditunggu — jadi jawabannya datang di
   * giliran yang sama, bukan setelah pemilik mengetik ulang pertanyaannya.
   */
  const switchTo = async (params: {
    to: Colleague;
    brief: string;
    ask: string;
    depth: number;
  }) => {
    const { to, brief, ask, depth } = params;
    const from = nameOf(speakingRef.current);

    pushBlock({
      label: "handover",
      tone: "dim",
      rows: [
        { label: "from", value: from.name },
        { label: "to", value: `${to.name} · ${to.title}` },
      ],
      note: brief || undefined,
    });

    speakingRef.current = to.id;
    setSpeaking(to.id);

    await runTurn(
      to.id,
      buildHandover({ from, brief, transcript: historyRef.current, ask }),
      { hidden: true, depth: depth + 1 },
    );
  };

  // --------------------------------------------------------------------- send

  /**
   * Satu giliran chat. `hidden` menahan gelembung penggunanya — dipakai giliran
   * pembuka dan giliran hasil alih, yang isinya instruksi sesi atau berkas
   * pengalihan dan bukan sesuatu yang pernah diketik orang, jadi menampilkannya
   * akan berbohong soal siapa yang bicara.
   *
   * Sesi yang belum pernah dipakai selalu dibuka dengan `prime`, TERMASUK saat
   * pembicaraan baru dialihkan ke sana: instruksi sesi dan berkas pengalihan
   * masuk dalam satu giliran tersembunyi yang sama, jadi tetap satu panggilan.
   */
  const runTurn = async (
    target: string,
    text: string,
    opts: { hidden?: boolean; depth?: number } = {},
  ) => {
    const hidden = opts.hidden ?? false;
    const depth = opts.depth ?? 0;

    const known = sessionsRef.current[target];
    const sessionId = known ?? newSessionId();
    if (!known) sessionsRef.current[target] = sessionId;

    const assistantId = newId();
    setMessages((prev) => {
      // Satu stempel untuk kedua baris: gelembung yang dikirim dan balasan yang
      // menyusulnya harus menunjukkan jam yang sama, bukan dua pembacaan jam
      // yang kebetulan jatuh di menit berbeda.
      const at = Date.now();
      return [
        ...prev,
        ...(hidden ? [] : [{ id: newId(), role: "user" as const, text, at }]),
        {
          id: assistantId,
          role: "assistant" as const,
          text: "",
          at,
          streaming: true,
          phase: "connecting" as const,
          startedAt: at,
          speaker: canSwitch ? target : undefined,
        },
      ];
    });
    stickToBottomRef.current = true;

    const ctl = new AbortController();
    abortRef.current = ctl;

    let raw = "";
    try {
      raw = await chatStream(text, sessionId, {
        signal: ctl.signal,
        agentId: target,
        prime: !known,
        switching: canSwitch,
        onPhase: (phase) => patchMessage(assistantId, { phase }),
        onText: (full) => {
          raw = full;
          patchMessage(assistantId, { text: visibleText(full) });
        },
        onReasoning: (full) => patchMessage(assistantId, { reasoning: full }),
      });
    } catch (err) {
      if (ctl.signal.aborted) {
        // Stop pressed: keep whatever streamed in so far, mark it done.
        patchMessage(assistantId, { streaming: false });
        return;
      }
      const msg = err instanceof Error ? err.message : "Could not send the message.";
      patchMessage(assistantId, { text: msg, error: true, streaming: false });
      return;
    }

    const handoff = canSwitch ? parseHandoff(raw) : null;
    const said = handoff ? handoff.rest : raw;

    // Balasan yang ISINYA cuma penanda alih tidak menyisakan apa pun untuk
    // dibaca. Blok "alih" di bawahnya sudah mengatakan semuanya; gelembung
    // kosong hanya menambah baris.
    if (said || !handoff) {
      patchMessage(assistantId, { text: said, streaming: false });
      remember(nameOf(target).name, said);
    } else {
      dropMessage(assistantId);
    }

    if (!handoff) return;

    const to = findColleague(roster, handoff.to);
    if (!to || to.id === target) {
      pushBlock({
        label: "handover failed",
        tone: "warn",
        note: `${nameOf(target).name} tried to hand over to "${handoff.to}", and there is no such employee in this office.`,
      });
      return;
    }
    if (depth >= MAX_SWITCH_PER_TURN) {
      pushBlock({
        label: "handover stopped",
        tone: "warn",
        note: `Handed over ${depth} times for one question. Type /to ${to.id} if you really want to continue with ${to.name}.`,
      });
      return;
    }

    await switchTo({ to, brief: handoff.brief, ask: lastAskRef.current, depth });
  };

  /**
   * Satu giliran penuh dari sisi pengguna — TERMASUK alih yang menyusul.
   *
   * Penanda "sedang jalan" dipegang di sini, bukan di dalam `runTurn`: kalau
   * tiap giliran mematikannya sendiri, tombol send berkedip kembali di sela dua
   * karyawan dan sempat menerima pesan yang akan salah alamat.
   */
  const runChain = async (job: () => Promise<void>) => {
    setIsRunning(true);
    try {
      await job();
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isRunning) return;

    // Slash commands are intercepted locally and never sent to QwenPaw.
    if (trimmed.startsWith("/")) {
      setInput("");
      const pending = handleCommand(trimmed);
      if (pending) await runChain(pending);
      return;
    }

    setInput("");
    lastAskRef.current = trimmed;
    remember(userName, trimmed);
    await runChain(() => runTurn(speakingRef.current, trimmed));
  };

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const here = nameOf(speaking);

  const speakerLine = canSwitch ? (
    // Siapa yang sedang menjawab HARUS terlihat tanpa menggulir ke bawah:
    // begitu pembicaraan bisa berpindah, "aku sedang bicara dengan siapa" jadi
    // pertanyaan yang muncul terus-menerus. Satu baris, menempel di bawah garis
    // pita — bukan bilah kedua, yang akan memakan sepertiga layar ponsel
    // sebelum satu kalimat percakapan pun terbaca.
    <div className="text-term-dim mt-2 flex items-baseline gap-x-2 text-[11px]">
      <span aria-hidden="true" className="text-term-prompt">
        ■
      </span>
      <span className="text-foreground truncate">{here.name}</span>
      <span className="truncate">{here.title}</span>
      <span className="ml-auto shrink-0 whitespace-nowrap">
        <span className="text-term-prompt">/who</span> to switch
      </span>
    </div>
  ) : null;

  return (
    <div className="bg-background flex h-full w-full flex-col">
      {!isEmpty ? <AppHeader authOn={authOn}>{speakerLine}</AppHeader> : null}

      <div
        ref={scrollerRef}
        onScroll={onViewportScroll}
        // `scrollbar-gutter: stable both-edges` yang menjaga pita di atas
        // sejajar dengan transkrip: pita berada di luar elemen ini, jadi ia
        // memusat pada lebar penuh sementara isi di sini memusat pada lebar
        // sisa setelah batang gulung — setengah batang gulung selisihnya, yang
        // terbaca sebagai header yang tergeser ke kanan.
        className="relative flex flex-1 flex-col overflow-y-auto scroll-smooth [scrollbar-gutter:stable_both-edges]"
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-[46rem] flex-1 flex-col px-4 sm:px-6",
            // Hanya keadaan kosong yang membayar padding atasnya sendiri.
            // Begitu pita ada, dialah pemilik ruang itu, dan menggandakannya di
            // sini cuma melipatduakan jarak di bawah garis.
            isEmpty && "justify-center pt-6",
          )}
        >
          {isEmpty ? <Banner authOn={authOn} /> : null}

          <div className="mb-10 flex flex-col gap-6 empty:hidden">
            {messages.map((m) =>
              m.role === "user" ? (
                <UserMessage key={m.id} text={m.text} at={m.at} />
              ) : (
                <AssistantMessage
                  key={m.id}
                  message={m}
                  name={
                    m.speaker ? nameOf(m.speaker).name : agentName || agentId || "agent"
                  }
                  agentId={m.speaker ?? agentId}
                  company={companyName}
                  // Nama karyawan di dalam blok laporan membuka dialog yang
                  // sama dengan foto di atas balasannya. Satu pintu, di mana
                  // pun namanya kebetulan muncul.
                  onOpenAgent={(id, name) => setManaging({ id, name, title: "employee" })}
                  onManage={
                    canManage(m.speaker ?? agentId)
                      ? () => setManaging(nameOf((m.speaker ?? agentId)!))
                      : undefined
                  }
                />
              ),
            )}
          </div>

          <div
            className={cn(
              "bg-background flex flex-col gap-2 pb-4 sm:pb-6",
              // `mt-auto` HANYA setelah ada percakapan. Di layar kosong ia
              // mendorong kotak ketik ke dasar layar dan membatalkan
              // `justify-center` di kolomnya — banner tertinggal sendirian di
              // atas, jauh dari kotak yang seharusnya ia ajak mengetik.
              !isEmpty && "sticky bottom-0 mt-auto",
            )}
          >
            <Composer
              value={input}
              onChange={setInput}
              onSend={send}
              onStop={stop}
              isRunning={isRunning}
              who={canSwitch ? here.name : undefined}
            />
          </div>
        </div>
      </div>

      {/* Dipasang hanya saat terbuka — jadi tiap kali dibuka, isinya dimuat
          ulang dari nol. Dialog manajemen yang menampilkan keadaan basi lebih
          berbahaya daripada satu request tambahan: orang membukanya justru
          untuk memastikan perubahannya benar-benar mendarat. */}
      {managing ? (
        <AgentDialog
          agentId={managing.id}
          agentName={managing.name}
          onClose={() => setManaging(null)}
        />
      ) : null}
    </div>
  );
};

// ------------------------------------------------------------------- banner

/**
 * Layar pembuka — dan satu-satunya kali seluruh identitas duduk di tengah.
 *
 * Bertahan selama transkrip kosong, yaitu sampai kamu benar-benar mengetik
 * sesuatu. Tidak ada sapaan otomatis yang menggesernya: manajer gedung baru
 * bicara setelah ditanya, dan instruksi sesinya menumpang pada pertanyaan
 * pertama itu (lihat lib/prompt.ts). Begitu ada percakapan, baris ini naik jadi
 * `AppHeader` — pita yang sama di tempat yang sama, cuma berhenti ikut
 * menggulung, jadi yang terjadi terbaca sebagai perpindahan dan bukan sebagai
 * bilah baru yang tiba-tiba muncul.
 */
const Banner: FC<{ authOn: boolean }> = ({ authOn }) => (
  <div className="mb-8 select-none">
    <IdentityRow authOn={authOn} />
    <div className="border-term-rule my-2.5 border-t" />
    {/*
      One sentence, one claim: they work while you are not looking. It is the
      only thing on this screen a chat box could not also say.

      Two earlier drafts died here and both died the same way. The first listed
      steps ("hire employees, set their schedule, read the report") and closed
      on a note about the interface itself — but the screen is already one
      page, so a page explaining its own shape spends its most valuable line on
      something already visible. The second promised a morning report, which is
      a promise an empty office cannot keep: nobody is scheduled yet, so the
      line was true about the product and false about the screen it sat on.

      What survives says only what is true the moment you read it.
    */}
    <p className="text-muted-foreground text-xs leading-relaxed">
      AI employees that work on a schedule, whether or not you open this screen.
    </p>
    <p className="text-term-dim term-caret mt-1.5 text-xs">type below to begin</p>
  </div>
);

/**
 * Apa jadinya baris atas banner begitu ada percakapan yang harus ia payungi.
 *
 * Ia hidup DI LUAR area yang menggulung, dan itu bukan pilihan gaya. Sebagai
 * elemen sticky di dalamnya, ia akan menutupi baris teratas transkrip setiap
 * kali isinya digulung ke atas — dan `pb-6` di bawah garisnya akan ikut
 * menggulung pergi, membuat pesan pertama menempel di garis. Ruang di bawah
 * garis hanya bertahan kalau yang memegangnya adalah elemen di luar penggulung.
 */
const AppHeader: FC<{ authOn: boolean; children?: React.ReactNode }> = ({
  authOn,
  children,
}) => (
  // `relative z-20` bukan hiasan. `animate-fade-in` menyentuh opacity, dan itu
  // membuat elemen ini jadi stacking context tersendiri — sehingga `z-10` milik
  // panel akun di dalamnya terkurung di sini, tidak bisa naik melewati kolom
  // transkrip yang (sebagai `position: relative`) dilukis belakangan. Akibatnya
  // panel akun tampak tembus pandang: teks percakapan menimpanya. Yang harus
  // diangkat adalah stacking context-nya, bukan panelnya.
  <div className="bg-background animate-fade-in relative z-20 shrink-0 pt-6 pb-6 select-none">
    <div className="mx-auto w-full max-w-[46rem] px-4 sm:px-6">
      <IdentityRow authOn={authOn} />
      <div className="border-term-rule mt-2.5 border-t" />
      {children}
    </div>
  </div>
);

// ------------------------------------------------------------------ messages

/**
 * Baris nama di atas setiap balasan.
 *
 * Tidak ada lagi penanda `❯`/`■` di kolom gutter, dan badan pesannya tidak lagi
 * digeser masuk untuk menghindarinya: sisi pengguna sekarang berupa kotak yang
 * rata kanan, jadi SISI dan BENTUK sudah mengatakan siapa yang bicara. Penanda
 * di gutter cuma mengulangi hal yang sama untuk kedua kalinya sambil memakan
 * satu kolom di setiap baris.
 *
 * Yang tersisa di sini adalah dua fakta yang tidak bisa dibaca dari bentuknya:
 * SIAPA yang menjawab (dan karena itu, siapa yang bisa diatur) dan KAPAN.
 */
const MessageHeader: FC<{
  name: string;
  at: number;
  /** id agent, kalau berbeda dari namanya. */
  sub?: string;
  tone?: "prompt" | "dim";
  /**
   * Bila diisi, foto + nama jadi TOMBOL pembuka dialog manajemen — satu-satunya
   * jalan ke sana dari percakapan.
   */
  onManage?: () => void;
  children?: React.ReactNode;
}> = ({ name, at, sub, tone = "prompt", onManage, children }) => {
  const ink = tone === "dim" ? "text-term-dim" : "text-term-prompt";
  const label = (
    <span className={cn("text-[11px] leading-5 font-medium tracking-wide", ink)}>
      {name}
    </span>
  );
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {onManage ? (
        // Isyarat "atur" muncul saat disorot, bukan permanen: baris ini
        // terulang di SETIAP balasan, jadi ajakan yang selalu terlihat menumpuk
        // jadi kebisingan di transkrip yang panjang.
        <button
          type="button"
          onClick={onManage}
          title={`Manage ${name}`}
          className="group focus-visible:ring-ring flex cursor-pointer items-center focus-visible:ring-1 focus-visible:outline-none"
        >
          <AgentAvatar
            name={name}
            className="group-hover:border-term-prompt group-focus-visible:border-term-prompt mr-1.5 size-4 text-[9px]"
          />
          {label}
          <span
            aria-hidden="true"
            className="text-term-dim ml-2 text-[10px] leading-5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            manage ▸
          </span>
        </button>
      ) : (
        label
      )}
      {sub && sub !== name ? (
        <span className="text-term-dim text-[10px] leading-5">{sub}</span>
      ) : null}
      <Clock at={at} />
      {children}
    </div>
  );
};

/**
 * Yang kamu ketik: satu kotak, rata kanan, sudutnya siku.
 *
 * Namanya sengaja TIDAK dicetak. Di layar yang cuma berisi dua pihak, sisi dan
 * kotak sudah menjawab "siapa ini" lebih cepat daripada label yang harus
 * dibaca — dan menuliskannya di tiap giliran berarti nama pengguna terulang
 * puluhan kali di transkrip yang panjang. Nama karyawan tetap dicetak, karena
 * di sisi sana ia BISA berganti orang di tengah percakapan.
 *
 * `max-w-[85%]` yang membuat rata-kanannya terbaca: kotak selebar kolom tidak
 * terlihat berpihak ke mana pun.
 */
const UserMessage: FC<{ text: string; at: number }> = ({ text, at }) => (
  <div className="animate-fade-in flex flex-col items-end gap-1">
    <div className="border-border bg-card text-foreground max-w-[85%] min-w-0 border px-3 py-1.5 text-sm leading-6 wrap-break-word whitespace-pre-wrap">
      {text}
    </div>
    <Clock at={at} />
  </div>
);

const AssistantMessage: FC<{
  message: ChatMessage;
  name: string;
  agentId?: string;
  company: string;
  onOpenAgent: (id: string, name: string) => void;
  /** Kosong = karyawan ini tidak bisa diatur dari sini (lihat ThreadProps). */
  onManage?: () => void;
}> = ({ message, name, agentId, company, onOpenAgent, onManage }) => {
  // Selagi menalar dan belum satu kata pun ditulis, cuplikan pikirannya JAUH
  // lebih menjelaskan daripada tombol "thinking" yang tertutup. Begitu jawaban
  // mulai mengalir, cuplikan itu berhenti berguna dan tombolnya kembali.
  const peeking = Boolean(message.streaming && !message.text && message.reasoning);

  return (
    <div className="animate-fade-in">
      {message.block || message.panel ? (
        // Balasan slash command, catatan alih, dan ex-halaman tidak datang dari
        // agent mana pun — semuanya dirakit browser ini. Menamainya dengan nama
        // agent adalah kebohongan kecil yang merusak arti semua nama lain, dan
        // karena itu tak satu pun membawa foto yang membuka pengaturannya.
        <MessageHeader
          name={message.panel ?? "local"}
          at={message.at}
          tone="dim"
        />
      ) : (
        <MessageHeader
          name={name}
          at={message.at}
          sub={agentId}
          onManage={onManage}
        >
          {message.streaming ? (
            <StreamStatus phase={message.phase} startedAt={message.startedAt} />
          ) : null}
        </MessageHeader>
      )}

      <div className="text-foreground min-w-0 text-sm leading-relaxed wrap-break-word">
        {peeking ? <ReasoningPeek text={message.reasoning ?? ""} /> : null}

        {message.reasoning && message.reasoning.trim() && !message.block && !peeking ? (
          <ReasoningBlock text={message.reasoning} />
        ) : null}

        {message.panel ? (
          <PanelView
            kind={message.panel}
            company={company}
            onOpenAgent={onOpenAgent}
          />
        ) : message.block ? (
          <CommandBlockView block={message.block} />
        ) : message.error ? (
          <div className="my-2">
            <TermBlock label="error" tone="warn">
              <p className="text-destructive text-xs leading-relaxed wrap-break-word whitespace-pre-wrap">
                {message.text}
              </p>
            </TermBlock>
          </div>
        ) : message.text ? (
          <AssistantBody text={message.text} />
        ) : !message.streaming ? (
          // Stop ditekan sebelum satu kata pun sampai. Gelembung kosong tanpa
          // keterangan terbaca seperti balasan yang hilang.
          <p className="text-term-dim text-xs leading-6">(stopped)</p>
        ) : null}
      </div>
    </div>
  );
};

/**
 * `⠹ berpikir… 12.4s` — apa yang sedang terjadi, dan sudah berapa lama.
 *
 * Hanya labelnya yang masuk `role="status"`: spinner dan angka detik berubah
 * sepuluh kali per detik, dan mengumumkan itu ke pembaca layar akan mengubah
 * satu penantian jadi ratusan interupsi.
 */
const StreamStatus: FC<{ phase?: PawPhase; startedAt?: number }> = ({
  phase = "connecting",
  startedAt,
}) => (
  <span className="text-term-dim ml-auto flex shrink-0 items-baseline gap-1.5 text-[11px] leading-5">
    <Spinner className="text-term-prompt" />
    <span role="status">{PHASE_LABEL[phase]}…</span>
    {startedAt ? <Elapsed since={startedAt} /> : null}
  </span>
);

/** Baris terakhir dari pikirannya, dipotong — bukti bahwa ada yang bergerak. */
const ReasoningPeek: FC<{ text: string }> = ({ text }) => {
  const line = text.trim().split("\n").filter(Boolean).at(-1) ?? "";
  if (!line) return null;
  return (
    <p className="text-term-dim animate-fade-in my-1 truncate text-[11px] leading-5 italic">
      {line}
    </p>
  );
};

/**
 * Isi satu balasan: markdown biasa, kecuali kalau di dalamnya ada usulan
 * rekrut — yang ditukar dengan kartu konfirmasi, tetap di tempatnya semula
 * supaya kalimat sebelum dan sesudahnya masih membingkainya.
 */
const AssistantBody: FC<{ text: string }> = ({ text }) => {
  const scan = scanForHireDraft(text);

  if (scan.state === "none") return <MarkdownText content={text} />;

  if (scan.state === "pending") {
    return (
      <>
        {scan.before.trim() ? <MarkdownText content={scan.before} /> : null}
        <p className="text-term-dim term-caret my-2 text-xs">drafting the hire proposal</p>
      </>
    );
  }

  return (
    <>
      {scan.before.trim() ? <MarkdownText content={scan.before} /> : null}
      {scan.state === "ready" ? (
        <HireDraftCard draft={scan.draft} />
      ) : (
        // Usulan yang cacat TIDAK disembunyikan. Kartu yang diam-diam hilang
        // membuat manajer gedung tampak mengabaikan permintaan; menyebut apa
        // yang salah membuat "coba lagi" jadi kalimat berikutnya yang wajar.
        <div className="my-2">
          <TermBlock label="proposal unreadable" tone="warn">
            <p className="text-xs leading-relaxed">{scan.reason}</p>
            <p className="text-term-dim mt-1.5 text-[11px]">
              Ask the building manager to redo the proposal, or type /hire to
              pick from the catalogue.
            </p>
          </TermBlock>
        </div>
      )}
      {scan.after.trim() ? <MarkdownText content={scan.after} /> : null}
    </>
  );
};

// ------------------------------------------------------------------- panels

/**
 * Satu ex-halaman, dipasang di tempat perintahnya diketik.
 *
 * Isinya diambil saat blok ini dipasang, BUKAN disimpan di transkrip. Dua
 * akibat, keduanya disengaja: minta `/laporan` dua kali dan kamu benar-benar
 * membaca dua keadaan yang berbeda, dan sepuluh blok laporan di satu
 * percakapan tidak menyimpan sepuluh salinan laporan di memori browser.
 *
 * Katalog rekrut tidak mengambil apa pun — daftar jabatannya konstanta di
 * lib/roles.ts, dan yang memanggil server justru langkah setelahnya.
 */
const PanelView: FC<{
  kind: PanelKind;
  company: string;
  onOpenAgent: (id: string, name: string) => void;
}> = ({ kind, company, onOpenAgent }) => {
  const [report, setReport] = useState<OfficeReport | null>(null);
  const [offices, setOffices] = useState<{
    activeOrgId: string | null;
    offices: OfficeBrief[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kind === "hire") return;
    let alive = true;

    void (async () => {
      const url = kind === "report" ? "/api/report" : "/api/offices";
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data.error || `Failed (${res.status}).`);
        if (kind === "report") setReport(data as OfficeReport);
        else setOffices(data as { activeOrgId: string | null; offices: OfficeBrief[] });
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not read that.");
      }
    })();

    return () => {
      alive = false;
    };
  }, [kind]);

  if (kind === "hire") {
    return (
      <div className="my-2">
        <HireCatalog roles={ROLE_CATALOG} company={company} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-2">
        <TermBlock label={kind} tone="warn">
          <p className="text-xs leading-relaxed">{error}</p>
        </TermBlock>
      </div>
    );
  }

  const data = kind === "report" ? report : offices;
  if (!data) {
    return (
      <p className="text-term-dim my-2 flex items-baseline gap-1.5 text-xs">
        <Spinner className="text-term-prompt" />
        <span>reading {kind === "report" ? "the office" : "your companies"}…</span>
      </p>
    );
  }

  return (
    <div className="my-2">
      {kind === "report" ? (
        <ReportView report={report!} onOpenAgent={onOpenAgent} />
      ) : (
        <OfficeList offices={offices!.offices} activeOrgId={offices!.activeOrgId} />
      )}
    </div>
  );
};

/** A labelled terminal block rendered as a tool-style reply (theme, help…). */
const CommandBlockView: FC<{ block: CommandBlock }> = ({ block }) => (
  <div className="my-2">
    <TermBlock label={block.label} tone={block.tone ?? "dim"}>
      {block.rows?.map((r) => (
        <TermRow key={r.label} label={r.label}>
          {r.value}
        </TermRow>
      ))}
      {block.note ? (
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
          {block.note}
        </p>
      ) : null}
    </TermBlock>
  </div>
);

const ReasoningBlock: FC<{ text: string }> = ({ text }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-term-dim hover:text-muted-foreground flex items-baseline gap-1 text-[11px] tracking-wide uppercase transition-colors"
        aria-expanded={open}
      >
        <span aria-hidden="true" className="term-gutter">
          {open ? "▾" : "▸"}
        </span>
        thinking
      </button>
      {open ? (
        <div className="border-term-rule text-term-dim animate-fade-in mt-1 ml-[0.6em] border-l pl-3 text-xs leading-relaxed whitespace-pre-wrap">
          {text}
        </div>
      ) : null}
    </div>
  );
};

// ------------------------------------------------------------------ composer

const Composer: FC<{
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  isRunning: boolean;
  /** Nama yang sedang menjawab — hanya diisi saat pembicaraan bisa berpindah. */
  who?: string;
}> = ({ value, onChange, onSend, onStop, isRunning, who }) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  /**
   * Tumbuh mengikuti isi, sampai `max-h-40`.
   *
   * Kotak kosong TIDAK pernah diberi tinggi eksplisit: pengukuran pertama
   * terjadi sebelum layout halaman selesai, dan `scrollHeight` di saat itu
   * mengembalikan angka tinggi kolom (ratusan piksel), bukan tinggi satu baris
   * — cukup untuk mengunci composer setinggi 160px seumur halaman. Selama
   * kosong, biarkan `rows=1` + `min-h-8` yang menentukan.
   */
  const autoGrow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    if (!el.value) return;
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  useEffect(() => {
    autoGrow();
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend(value);
    }
  };

  return (
    <div className="border-border focus-within:border-term-prompt bg-card flex items-start gap-1.5 border px-2.5 py-2 transition-colors">
      <span
        aria-hidden="true"
        className="text-term-prompt shrink-0 py-1 text-sm leading-6 select-none"
      >
        ❯
      </span>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        // Satu frasa, tanpa petunjuk dalam kurung — bentuk pabrik-startup
        // ("describe what you want…"). Kurung yang menempel di placeholder
        // membuat kotak ketik jadi tempat menaruh dokumentasi, dan itu terbaca
        // tiap kali orang menatapnya, bukan sekali saat dia butuh.
        placeholder={who ? `message ${who}…` : "describe the work…"}
        className="caret-term-prompt placeholder:text-term-dim max-h-40 min-h-8 w-full flex-1 resize-none bg-transparent py-1 text-sm leading-6 outline-none"
        rows={1}
        autoFocus
        enterKeyHint="send"
        aria-label="Message"
      />
      {isRunning ? (
        <button
          type="button"
          onClick={onStop}
          className="border-term-warn text-term-warn hover:bg-term-warn hover:text-background focus-visible:ring-ring shrink-0 self-end border px-2 py-1 text-[11px] leading-5 transition-colors focus-visible:ring-1 focus-visible:outline-none"
          aria-label="Stop generating"
        >
          stop ␛
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onSend(value)}
          disabled={!value.trim()}
          className="border-border text-term-dim hover:border-term-prompt hover:bg-term-prompt hover:text-primary-foreground focus-visible:ring-ring shrink-0 self-end border px-2 py-1 text-[11px] leading-5 transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
          aria-label="Send message"
        >
          send ⏎
        </button>
      )}
    </div>
  );
};
