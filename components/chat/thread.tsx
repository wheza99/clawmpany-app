"use client";

import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { useTheme } from "next-themes";

import { scanForHireDraft } from "@/lib/hire-draft";
import { chatStream, newId, newSessionId, type PawPhase } from "@/lib/paw";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { MarkdownText } from "@/components/markdown-text";
import { HireDraftCard } from "@/components/office/hire-draft-card";
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
 * QwenPaw's console chat only streams text + reasoning — it has no structured
 * tool-call events — so the model can't drive UI tools the way pabrik-startup
 * does. The same capabilities (theme, new chat, help) are instead reached with
 * slash commands (/light, /dark, /system, /new, /help) intercepted client-side
 * in `handleCommand`: the command is echoed into the transcript the way a shell
 * echoes input, and its result lands as a terminal block below it, keeping the
 * "everything happens in the conversation" feel without any sidebar or menu.
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
 *  4. Kanal tool-call yang tidak ada itu juga alasan merekrut lewat chat memakai
 *     SATU BLOK ```json di dalam balasan biasa (lib/hire-draft.ts). Manajer
 *     gedung menulis usulannya sebagai teks; `AssistantBody` memungutnya dan
 *     menukarnya dengan kartu konfirmasi. Kalau pemungutnya gagal, yang tersisa
 *     adalah blok kode yang terbaca manusia — bukan gelembung kosong.
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
}

export const Thread: FC<ThreadProps> = ({
  agentId,
  agentName,
  userName = "kamu",
  greeting,
  prime = false,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const { setTheme, resolvedTheme } = useTheme();

  // session id is stable for the life of this mount so QwenPaw keeps the
  // thread across turns; reload (or /new) starts a fresh session.
  const sessionIdRef = useRef<string>(newSessionId());
  const abortRef = useRef<AbortController | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const isEmpty = messages.length === 0;
  const speaker = agentName || agentId || "agent";

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
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );
  };

  // ----------------------------------------------------------------- commands

  /** Echo `raw` as a user line, then a labelled block as the reply. */
  const echoBlock = useCallback((raw: string, block: CommandBlock) => {
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "user", text: raw },
      { id: newId(), role: "assistant", text: "", block },
    ]);
  }, []);

  // Naik tiap `/new`. Efek pembuka membaca angka ini, jadi sesi baru dibuka
  // ulang dengan sambutan baru alih-alih halaman kosong.
  const [primeNonce, setPrimeNonce] = useState(0);

  const handleCommand = useCallback((raw: string) => {
    const body = raw.slice(1).trim().toLowerCase();
    const name = body.split(/\s+/)[0] ?? "";

    if (THEME_COMMANDS.has(name)) {
      setTheme(name);
      echoBlock(raw, {
        label: "display",
        tone: "dim",
        rows: [{ label: "theme", value: name }],
        note:
          name === "system" && resolvedTheme
            ? `resolved ${resolvedTheme}`
            : undefined,
      });
      return;
    }

    if (name === "new" || name === "clear") {
      // Wipe the transcript and start a fresh QwenPaw session. No echo — the
      // empty state (banner, atau sambutan baru bila `prime`) yang jadi
      // konfirmasinya.
      setMessages([]);
      sessionIdRef.current = newSessionId();
      setPrimeNonce((n) => n + 1);
      return;
    }

    if (name === "help") {
      echoBlock(raw, {
        label: "help",
        tone: "dim",
        note: "Slash commands run in your browser — they never reach paw.wheza.id. Anything else is sent as chat.",
        rows: [
          { label: "/light · /dark · /system", value: "switch theme" },
          { label: "/new", value: "start a fresh chat" },
          { label: "/help", value: "this list" },
        ],
      });
      return;
    }

    echoBlock(raw, {
      label: "error",
      tone: "warn",
      note: `unknown command: ${raw} — type /help for the list.`,
    });
    // setTheme stabil dari next-themes; resolvedTheme ikut supaya catatan
    // "/system" selalu menyebut tema yang benar-benar sedang berlaku.
  }, [echoBlock, setTheme, resolvedTheme]);

  // --------------------------------------------------------------------- send

  /**
   * Satu giliran chat. `hidden` menahan gelembung penggunanya — dipakai giliran
   * pembuka, yang isinya instruksi sesi dan bukan sesuatu yang pernah diketik
   * orang, jadi menampilkannya akan berbohong soal siapa yang bicara.
   */
  const runTurn = useCallback(
    async (text: string, hidden = false) => {
      const assistantId = newId();
      const opening: ChatMessage[] = hidden
        ? []
        : [{ id: newId(), role: "user", text }];
      setMessages((prev) => [
        ...prev,
        ...opening,
        {
          id: assistantId,
          role: "assistant",
          text: "",
          streaming: true,
          phase: "connecting",
          startedAt: Date.now(),
        },
      ]);
      setIsRunning(true);
      stickToBottomRef.current = true;

      const ctl = new AbortController();
      abortRef.current = ctl;

      try {
        const reply = await chatStream(hidden ? "" : text, sessionIdRef.current, {
          signal: ctl.signal,
          agentId,
          prime: hidden,
          onPhase: (phase) => patchMessage(assistantId, { phase }),
          onText: (full) => patchMessage(assistantId, { text: full }),
          onReasoning: (full) => patchMessage(assistantId, { reasoning: full }),
        });
        patchMessage(assistantId, { text: reply, streaming: false });
      } catch (err) {
        if (ctl.signal.aborted) {
          // Stop pressed: keep whatever streamed in so far, mark it done.
          patchMessage(assistantId, { streaming: false });
          return;
        }
        const msg = err instanceof Error ? err.message : "Gagal mengirim pesan.";
        patchMessage(assistantId, {
          text: msg,
          error: true,
          streaming: false,
        });
      } finally {
        setIsRunning(false);
        abortRef.current = null;
      }
    },
    // agentId is here because switching employees must not reuse a closure
    // still pointed at the previous one.
    [agentId],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isRunning) return;

      // Slash commands are intercepted locally and never sent to QwenPaw.
      if (trimmed.startsWith("/")) {
        handleCommand(trimmed);
        setInput("");
        return;
      }

      setInput("");
      await runTurn(trimmed);
    },
    [isRunning, runTurn, handleCommand],
  );

  // Giliran pembuka. Penjaganya sebuah ref, bukan state, supaya efek yang
  // dijalankan dua kali (StrictMode di dev) tetap menghasilkan SATU panggilan
  // ke QwenPaw — bukan dua sambutan yang saling menimpa.
  const primedRef = useRef(-1);
  useEffect(() => {
    if (!prime || primedRef.current === primeNonce) return;
    primedRef.current = primeNonce;
    void runTurn("", true);
  }, [prime, primeNonce, runTurn]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="bg-background flex h-full w-full flex-col">
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
                  name={speaker}
                  agentId={agentId}
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
        // Balasan slash command tidak datang dari agent mana pun — ia dihitung
        // di browser ini. Menamainya dengan nama agent akan menyesatkan.
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
          <AssistantBody text={message.text} />
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
        <p className="text-term-dim term-caret my-2 text-xs">menyusun usulan karyawan</p>
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
          <TermBlock label="Usulan tidak terbaca" tone="warn">
            <p className="text-xs leading-relaxed">{scan.reason}</p>
            <p className="text-term-dim mt-1.5 text-[11px]">
              Minta manajer gedung menyusun ulang usulannya, atau rekrut dari
              katalog di halaman depan.
            </p>
          </TermBlock>
        </div>
      )}
      {scan.after.trim() ? <MarkdownText content={scan.after} /> : null}
    </>
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
}> = ({ value, onChange, onSend, onStop, isRunning }) => {
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
        placeholder="ketik pesan…  (/help untuk perintah)"
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
