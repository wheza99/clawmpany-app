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
import { chatStream, newId, newSessionId, type PawPhase } from "@/lib/paw";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { MarkdownText } from "@/components/markdown-text";
import { Elapsed, Spinner } from "@/components/terminal/spinner";
import {
  TermBlock,
  TermGutter,
  TermRow,
  type TermTone,
} from "@/components/terminal/primitives";

/**
 * The whole interface: one centred column, no chrome.
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
 * Empat hal yang membuat transkrip ini bisa dibaca sambil berjalan:
 *
 *  1. SETIAP giliran melaporkan tahapnya (lib/paw.ts `PawPhase`) — spinner yang
 *     berputar plus "berpikir… 12.4s", bukan kursor berkedip yang tidak bisa
 *     dibedakan dari aplikasi yang menggantung.
 *  2. Setiap gelembung diberi NAMA — satu kata untuk manusianya, nama (dan id)
 *     agent untuk lawan bicaranya. Tanpa itu, kantor berisi 20 karyawan
 *     menghasilkan 20 transkrip yang terlihat persis sama.
 *  3. `prime` membuka sesi dengan satu giliran yang tidak pernah ditampilkan:
 *     instruksinya disusun server (lib/prompt.ts), yang muncul di layar hanya
 *     jawaban agent-nya.
 *  4. Dengan `colleagues`, pembicaraan bisa BERPINDAH orang di tengah jalan.
 *     Tiap karyawan memegang sesinya sendiri; yang berganti cuma siapa yang
 *     menjawab, dan blok `alih` mencatat perpindahannya di transkrip.
 */

interface CommandBlock {
  label: string;
  tone?: TermTone;
  rows?: Array<{ label: string; value: string }>;
  note?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
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
}

const THEME_COMMANDS = new Set(["light", "dark", "system"]);

/** Apa yang sebenarnya sedang terjadi, per tahap aliran. */
const PHASE_LABEL: Record<PawPhase, string> = {
  connecting: "menghubungi paw.wheza.id",
  waiting: "menunggu balasan",
  thinking: "berpikir",
  writing: "menulis jawaban",
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
  /** Kalimat pembuka saat transkrip masih kosong. Diabaikan bila `prime`. */
  greeting?: string;
  /**
   * Buka sesi dengan giliran tersembunyi: server menyusun instruksinya, agent
   * menjawab, dan hanya jawaban itu yang masuk transkrip. Satu panggilan ke
   * QwenPaw per sesi — jadi hanya dinyalakan di layar yang memang dibuka untuk
   * mengobrol, bukan di setiap halaman yang kebetulan memuat komponen ini.
   */
  prime?: boolean;
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
  userName = "kamu",
  greeting,
  prime = false,
  colleagues,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

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
      title: "karyawan",
    };

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
    setMessages((prev) => [...prev, { id: newId(), role: "assistant", text: "", block }]);
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
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "user", text: raw },
      { id: newId(), role: "assistant", text: "", block },
    ]);
  };

  // Naik tiap `/new`. Efek pembuka membaca angka ini, jadi sesi baru dibuka
  // ulang dengan sambutan baru alih-alih halaman kosong.
  const [primeNonce, setPrimeNonce] = useState(0);

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
      // Wipe the transcript and start a fresh QwenPaw session. No echo — the
      // empty state (banner, atau sambutan baru bila `prime`) yang jadi
      // konfirmasinya.
      setMessages([]);
      sessionsRef.current = {};
      historyRef.current = [];
      lastAskRef.current = "";
      speakingRef.current = opening;
      setSpeaking(opening);
      setPrimeNonce((n) => n + 1);
      return null;
    }

    if (canSwitch && (name === "siapa" || name === "who")) {
      echoBlock(raw, {
        label: "kantor",
        tone: "dim",
        rows: roster.map((c) => ({
          label: c.id === speakingRef.current ? `${c.id} ←` : c.id,
          value: c.name,
        })),
        note: `Sekarang kamu bicara dengan ${nameOf(speakingRef.current).name}. Ketik /ke <nama> untuk pindah — atau minta saja dengan kalimat biasa.`,
      });
      return null;
    }

    if (canSwitch && (name === "ke" || name === "to")) {
      if (!rest) {
        echoBlock(raw, {
          label: "error",
          tone: "warn",
          note: "Sebut siapa yang mau diajak bicara — misalnya /ke wati.",
        });
        return null;
      }
      const target = findColleague(roster, rest);
      if (!target) {
        echoBlock(raw, {
          label: "error",
          tone: "warn",
          note: `Tidak ada "${rest}" di kantor ini. Ketik /siapa untuk daftarnya.`,
        });
        return null;
      }
      if (target.id === speakingRef.current) {
        echoBlock(raw, {
          label: "alih",
          tone: "dim",
          note: `Kamu memang sedang bicara dengan ${target.name}.`,
        });
        return null;
      }
      // Diminta pengguna secara eksplisit, jadi tidak perlu membakar satu
      // giliran model cuma untuk memutuskan hal yang sudah diputuskan.
      setMessages((prev) => [...prev, { id: newId(), role: "user", text: raw }]);
      return () =>
        switchTo({
          to: target,
          brief: `${userName} meminta bicara denganmu langsung.`,
          ask:
            lastAskRef.current ||
            "Belum ada pertanyaan — perkenalkan diri dan tawarkan bantuan.",
          depth: 0,
        });
    }

    if (name === "help") {
      echoBlock(raw, {
        label: "help",
        tone: "dim",
        note: "Slash commands run in your browser — they never reach paw.wheza.id. Anything else is sent as chat.",
        rows: [
          { label: "/light · /dark · /system", value: "switch theme" },
          { label: "/new", value: "start a fresh chat" },
          ...(canSwitch
            ? [
                { label: "/ke <nama>", value: "pindah karyawan" },
                { label: "/siapa", value: "siapa saja di kantor" },
              ]
            : []),
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
      label: "alih",
      tone: "dim",
      rows: [
        { label: "dari", value: from.name },
        { label: "ke", value: `${to.name} · ${to.title}` },
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
    setMessages((prev) => [
      ...prev,
      ...(hidden ? [] : [{ id: newId(), role: "user" as const, text }]),
      {
        id: assistantId,
        role: "assistant",
        text: "",
        streaming: true,
        phase: "connecting",
        startedAt: Date.now(),
        speaker: canSwitch ? target : undefined,
      },
    ]);
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
      const msg = err instanceof Error ? err.message : "Gagal mengirim pesan.";
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
        label: "alih gagal",
        tone: "warn",
        note: `${nameOf(target).name} mencoba mengalihkan ke "${handoff.to}", dan tidak ada karyawan itu di kantor ini.`,
      });
      return;
    }
    if (depth >= MAX_SWITCH_PER_TURN) {
      pushBlock({
        label: "alih berhenti",
        tone: "warn",
        note: `Sudah ${depth} kali dialihkan untuk satu pertanyaan. Ketik /ke ${to.id} kalau memang mau lanjut ke ${to.name}.`,
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

  // Giliran pembuka. Fungsinya dititipkan lewat ref supaya efek yang
  // membukanya tidak ikut berjalan ulang tiap render — `runTurn` dan `runChain`
  // dibuat baru tiap render karena keduanya saling memanggil dengan `switchTo`.
  // Menitipkannya DI DALAM efek, bukan saat render, karena ref memang tidak
  // boleh ditulis selagi merender.
  const openRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    openRef.current = () =>
      runChain(() => runTurn(speakingRef.current, "", { hidden: true }));
  });

  // Penjaganya sebuah ref, bukan state, supaya efek yang dijalankan dua kali
  // (StrictMode di dev) tetap menghasilkan SATU panggilan ke QwenPaw — bukan
  // dua sambutan yang saling menimpa.
  const primedRef = useRef(-1);
  useEffect(() => {
    if (!prime || primedRef.current === primeNonce) return;
    primedRef.current = primeNonce;
    void openRef.current();
  }, [prime, primeNonce]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const here = nameOf(speaking);

  return (
    <div className="bg-background flex h-full w-full flex-col">
      {canSwitch ? (
        // Siapa yang sedang menjawab HARUS terlihat tanpa menggulir ke bawah:
        // begitu pembicaraan bisa berpindah, "aku sedang bicara dengan siapa"
        // jadi pertanyaan yang muncul terus-menerus.
        <div className="border-border bg-card/40 shrink-0 border-b px-4 py-2 sm:px-6">
          <div className="mx-auto w-full max-w-[46rem]">
            <p className="text-sm">
              {here.name}
              <span className="text-term-dim ml-2 text-[11px]">{here.title}</span>
            </p>
            <p className="text-term-dim text-[11px]">
              Minta saja kalau mau bicara dengan orang lain — atau ketik{" "}
              <span className="text-term-prompt">/siapa</span> untuk daftarnya.
            </p>
          </div>
        </div>
      ) : null}

      <div
        ref={scrollerRef}
        onScroll={onViewportScroll}
        className="relative flex flex-1 flex-col overflow-y-auto scroll-smooth"
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-[46rem] flex-1 flex-col px-4 pt-6 sm:px-6",
            isEmpty && !prime && "justify-center",
          )}
        >
          {isEmpty ? (
            // Dengan `prime`, sambutan datang dari agent-nya sendiri beberapa
            // ratus milidetik lagi. Menampilkan banner statis lebih dulu hanya
            // menghasilkan kedipan; baris ini yang menempati tempatnya.
            prime ? <BootLine /> : <Banner greeting={greeting} />
          ) : null}

          <div className="mb-10 flex flex-col gap-6">
            {messages.map((m) =>
              m.role === "user" ? (
                <UserMessage key={m.id} text={m.text} name={userName} />
              ) : (
                <AssistantMessage
                  key={m.id}
                  message={m}
                  name={
                    m.speaker ? nameOf(m.speaker).name : agentName || agentId || "agent"
                  }
                  agentId={m.speaker ?? agentId}
                />
              ),
            )}
          </div>

          <div
            className={cn(
              "bg-background mt-auto flex flex-col gap-2 pb-4 sm:pb-6",
              !isEmpty && "sticky bottom-0",
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
    </div>
  );
};

// ------------------------------------------------------------------- banner

const Banner: FC<{ greeting?: string }> = ({ greeting }) => (
  <div className="mb-8 select-none">
    <div className="flex items-baseline gap-2">
      <span className="text-term-prompt text-sm font-medium tracking-tight">
        clawmpany
      </span>
      <span className="text-term-dim text-[11px]">v{APP_VERSION}</span>
    </div>
    <div className="border-term-rule my-2.5 border-t" />
    <p className="text-muted-foreground text-xs leading-relaxed">
      {greeting ??
        "Ketik apa pun di bawah — jawabannya mengalir token demi token."}
    </p>
    <p className="text-term-dim term-caret mt-1.5 text-xs">ketik di bawah</p>
    <p className="text-term-dim mt-1.5 text-[11px]">
      ketik <span className="text-term-prompt">/help</span> untuk perintah tema &amp;
      chat baru
    </p>
  </div>
);

/** Satu baris sementara sebelum gelembung pertama muncul. */
const BootLine: FC = () => (
  <div className="text-term-dim mb-8 flex items-baseline gap-1.5 text-[11px]">
    <Spinner className="text-term-prompt" />
    <span>menyiapkan percakapan…</span>
  </div>
);

// ------------------------------------------------------------------ messages

/**
 * Baris nama di atas setiap gelembung.
 *
 * Penandanya dibiarkan di kolom gutter selebar 1.25em dan diberi `text-sm`
 * supaya em-nya sama dengan badan pesan — itulah yang membuat nama dan teks di
 * bawahnya berdiri di kolom yang sama persis, berapa pun ukuran font namanya.
 */
const MessageHeader: FC<{
  marker: string;
  name: string;
  /** id agent, kalau berbeda dari namanya. */
  sub?: string;
  tone?: "prompt" | "dim";
  children?: React.ReactNode;
}> = ({ marker, name, sub, tone = "prompt", children }) => {
  const ink = tone === "dim" ? "text-term-dim" : "text-term-prompt";
  return (
    // Tanpa `gap` di sumbu-x: jarak diatur per elemen, supaya nama benar-benar
    // menempel di tepi kanan kolom gutter dan sejajar dengan badan pesannya.
    <div className="flex flex-wrap items-baseline gap-y-0.5">
      <TermGutter marker={marker} className={cn("text-sm leading-5", ink)} />
      <span className={cn("text-[11px] leading-5 font-medium tracking-wide", ink)}>
        {name}
      </span>
      {sub && sub !== name ? (
        <span className="text-term-dim ml-2 text-[10px] leading-5">{sub}</span>
      ) : null}
      {children}
    </div>
  );
};

const UserMessage: FC<{ text: string; name: string }> = ({ text, name }) => (
  <div className="animate-fade-in">
    <MessageHeader marker="❯" name={name} />
    <div className="text-foreground ml-[1.25em] min-w-0 text-sm leading-6 wrap-break-word whitespace-pre-wrap">
      {text}
    </div>
  </div>
);

const AssistantMessage: FC<{
  message: ChatMessage;
  name: string;
  agentId?: string;
}> = ({ message, name, agentId }) => {
  // Selagi menalar dan belum satu kata pun ditulis, cuplikan pikirannya JAUH
  // lebih menjelaskan daripada tombol "thinking" yang tertutup. Begitu jawaban
  // mulai mengalir, cuplikan itu berhenti berguna dan tombolnya kembali.
  const peeking = Boolean(message.streaming && !message.text && message.reasoning);

  return (
    <div className="animate-fade-in">
      {message.block ? (
        // Balasan slash command dan catatan alih tidak datang dari agent mana
        // pun — keduanya dihitung di browser ini. Menamainya dengan nama agent
        // adalah kebohongan kecil yang merusak arti semua nama lain.
        <MessageHeader marker="▸" name="lokal" tone="dim" />
      ) : (
        <MessageHeader marker="■" name={name} sub={agentId}>
          {message.streaming ? (
            <StreamStatus phase={message.phase} startedAt={message.startedAt} />
          ) : null}
        </MessageHeader>
      )}

      <div className="text-foreground ml-[1.25em] min-w-0 text-sm leading-relaxed wrap-break-word">
        {peeking ? <ReasoningPeek text={message.reasoning ?? ""} /> : null}

        {message.reasoning && message.reasoning.trim() && !message.block && !peeking ? (
          <ReasoningBlock text={message.reasoning} />
        ) : null}

        {message.block ? (
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
          <MarkdownText content={message.text} />
        ) : !message.streaming ? (
          // Stop ditekan sebelum satu kata pun sampai. Gelembung kosong tanpa
          // keterangan terbaca seperti balasan yang hilang.
          <p className="text-term-dim text-xs leading-6">(dihentikan)</p>
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
        placeholder={
          who
            ? `pesan untuk ${who}…  (/siapa untuk pindah)`
            : "ketik pesan…  (/help untuk perintah)"
        }
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
