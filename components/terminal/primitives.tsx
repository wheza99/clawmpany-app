import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Terminal vocabulary shared by the chat surface. Adapted from
 * pabrik-startup's components/terminal/primitives.tsx, trimmed to just what
 * this transcript needs: a fixed-width gutter marker and a labelled TUI box.
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
  tone?: "default" | "warn" | "dim";
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
