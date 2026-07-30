"use client";

import { useCallback, useEffect, useRef, useState, type FC } from "react";

import { chatStream, newId, newSessionId } from "@/lib/paw";
import { cn } from "@/lib/utils";
import { MarkdownText } from "@/components/markdown-text";
import { TermBlock, TermGutter } from "@/components/terminal/primitives";

/**
 * The whole interface: one centred column, no chrome.
 *
 * Visual grammar lifted from pabrik-startup's components/assistant-ui/thread.tsx
 * — a fixed-width `❯` gutter opens every line, rules are hairlines, nothing is
 * rounded, and the only interactive elements are a textarea and a send/stop
 * button. The difference is the runtime: where pabrik-startup drives this from
 * an assistant-ui runtime over an AI-SDK stream, this talks straight to the
 * /api/chat proxy (→ paw.wheza.id QwenPaw) through lib/paw.ts, no extra state
 * library in between.
 */

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  reasoning?: string;
  error?: boolean;
  streaming?: boolean;
}

export interface ThreadProps {
  /**
   * Karyawan yang diajak bicara. Kosong = agent bawaan server. Dikirim ke
   * /api/chat, yang menolaknya kalau id itu bukan penghuni kantor si pemanggil
   * — jadi mengganti nilai ini di browser tidak membuka agent orang lain.
   */
  agentId?: string;
  /** Kalimat pembuka saat transkrip masih kosong. */
  greeting?: string;
}

export const Thread: FC<ThreadProps> = ({ agentId, greeting }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  // session id is stable for the life of this mount so QwenPaw keeps the
  // thread across turns; reload starts a fresh session.
  const sessionIdRef = useRef<string>(newSessionId());
  const abortRef = useRef<AbortController | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const isEmpty = messages.length === 0;

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

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isRunning) return;

      const userMsg: ChatMessage = { id: newId(), role: "user", text: trimmed };
      const assistantId = newId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        text: "",
        streaming: true,
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      setIsRunning(true);
      stickToBottomRef.current = true;

      const ctl = new AbortController();
      abortRef.current = ctl;

      try {
        const reply = await chatStream(trimmed, sessionIdRef.current, {
          signal: ctl.signal,
          agentId,
          onText: (full) => patchMessage(assistantId, { text: full }),
          onReasoning: (full) =>
            patchMessage(assistantId, { reasoning: full }),
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
    [isRunning, agentId],
  );

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
            isEmpty && "justify-center",
          )}
        >
          {isEmpty ? <Banner greeting={greeting} /> : null}

          <div className="mb-10 flex flex-col gap-6">
            {messages.map((m) =>
              m.role === "user" ? (
                <UserMessage key={m.id} text={m.text} />
              ) : (
                <AssistantMessage key={m.id} message={m} onRetry={() => send(m.error ? "" : "")} />
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
      <span className="text-term-dim text-[11px]">chat</span>
    </div>
    <div className="border-term-rule my-2.5 border-t" />
    <p className="text-muted-foreground text-xs leading-relaxed">
      {greeting ??
        "Ketik apa pun di bawah — jawabannya mengalir token demi token."}
    </p>
    <p className="text-term-dim term-caret mt-1.5 text-xs">ketik di bawah</p>
  </div>
);

// ------------------------------------------------------------------ messages

const UserMessage: FC<{ text: string }> = ({ text }) => (
  <div className="animate-fade-in flex gap-1">
    <TermGutter marker="❯" className="text-term-prompt text-sm leading-6" />
    <div className="text-foreground min-w-0 flex-1 text-sm leading-6 wrap-break-word whitespace-pre-wrap">
      {text}
    </div>
  </div>
);

const AssistantMessage: FC<{
  message: ChatMessage;
  onRetry: () => void;
}> = ({ message }) => (
  <div className="animate-fade-in">
    <div className="text-foreground min-w-0 text-sm leading-relaxed wrap-break-word">
      {message.reasoning && message.reasoning.trim() ? (
        <ReasoningBlock text={message.reasoning} />
      ) : null}

      {message.error ? (
        <div className="my-2">
          <TermBlock label="error" tone="warn">
            <p className="text-destructive text-xs leading-relaxed wrap-break-word whitespace-pre-wrap">
              {message.text}
            </p>
          </TermBlock>
        </div>
      ) : message.text ? (
        <MarkdownText content={message.text} />
      ) : message.streaming ? (
        <span className="text-term-prompt text-sm" aria-label="Working">
          <span className="animate-pulse">█</span>
        </span>
      ) : null}
    </div>
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

  const autoGrow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}`;
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
        placeholder="ketik pesan…"
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
