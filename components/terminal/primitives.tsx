import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Terminal vocabulary shared by the chat surface. Adapted from
 * pabrik-startup's components/terminal/primitives.tsx: a fixed-width gutter
 * marker, a labelled TUI box, a `[ label ]` button, and a `key ··· value` row.
 * Keeping the vocabulary small is what makes a theme switch and a help card
 * read as the same interface rather than two widgets that happen to share a
 * font.
 */

/** One `❯`/`▸`/`■` marker. Fixed width so message bodies stay on one column. */
export function TermGutter({
  marker,
  className,
}: {
  marker: string;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cn("term-gutter", className)}>
      {marker}
    </span>
  );
}

/** Terminal tone used across blocks and rows. */
export type TermTone = "default" | "warn" | "dim";

/**
 * A labelled box drawn like a TUI frame: a hairline rule all the way round
 * with the caption sitting ON the top rule. The caption is pulled up over the
 * border and given the page background, which is what punches the gap.
 */
export function TermBlock({
  label,
  tone = "default",
  className,
  children,
}: {
  label: string;
  tone?: TermTone;
  className?: string;
  children: ReactNode;
}) {
  const toneRule =
    tone === "warn"
      ? "border-term-warn/50"
      : tone === "dim"
        ? "border-term-rule"
        : "border-border";
  const toneLabel =
    tone === "warn"
      ? "text-term-warn"
      : tone === "dim"
        ? "text-term-dim"
        : "text-term-prompt";

  return (
    <div className={cn("relative border", toneRule, className)}>
      <span
        className={cn(
          "bg-background absolute -top-[0.62em] left-2.5 px-1.5 text-[10px] leading-none font-medium tracking-[0.18em] uppercase",
          toneLabel,
        )}
      >
        {label}
      </span>
      <div className="pt-3.5 pb-3 px-3">{children}</div>
    </div>
  );
}

/**
 * `[ label ]` — a button that looks like something you'd type, not something
 * you'd tap. Hover and focus invert it wholesale (the terminal way of showing
 * a selected item) instead of tinting a background.
 */
export function TermButton({
  children,
  variant = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  /** `primary` fills immediately — reserve it for the one action that matters. */
  variant?: "default" | "primary";
}) {
  return (
    <button
      type="button"
      className={cn(
        "border px-2.5 py-1 text-xs leading-5 transition-colors",
        "focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
        variant === "primary"
          ? "border-term-prompt bg-term-prompt text-primary-foreground hover:bg-transparent hover:text-term-prompt"
          : "border-border text-foreground hover:border-term-prompt hover:bg-term-prompt hover:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="text-current/60 select-none">
        [
      </span>
      <span className="px-1.5">{children}</span>
      <span aria-hidden="true" className="text-current/60 select-none">
        ]
      </span>
    </button>
  );
}

/**
 * One `key ······ value` row. The dot leader is decorative filler, so it is
 * hidden from assistive tech; screen readers get "key value" adjacency.
 */
export function TermRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2 text-xs leading-6">
      <span className="text-term-dim shrink-0">{label}</span>
      <span
        aria-hidden="true"
        className="text-term-rule min-w-4 flex-1 overflow-hidden text-[10px] whitespace-nowrap select-none"
      >
        {"·".repeat(120)}
      </span>
      <span className="text-foreground shrink-0 text-right">{children}</span>
    </div>
  );
}
