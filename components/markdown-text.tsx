"use client";

import { type FC, memo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Markdown rendering for assistant messages. Faithful to pabrik-startup's
 * components/assistant-ui/markdown-text.tsx grammar — hairline code blocks with
 * a lowercase language label and a word-as-button "[copy]" control, inline code
 * tinted with the prompt accent, square everything — but built on plain
 * react-markdown instead of @assistant-ui/react-markdown to stay dependency-
 * light.
 */

const MarkdownTextImpl: FC<{ content: string }> = ({ content }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
};

export const MarkdownText = memo(MarkdownTextImpl);

function useCopyToClipboard(copiedDuration = 3000) {
  const [isCopied, setIsCopied] = useState(false);
  const copyToClipboard = (value: string) => {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(value).then(
      () => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), copiedDuration);
      },
      () => {},
    );
  };
  return { isCopied, copyToClipboard };
}

const CodeBlock: FC<{ language?: string; code: string }> = ({
  language,
  code,
}) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  return (
    <div className="border-term-rule bg-muted/40 mt-3 flex items-center justify-between border border-b-0 px-2.5 py-1 text-[11px]">
      <span className="text-term-dim tracking-wide lowercase">
        {language || "text"}
      </span>
      <button
        type="button"
        onClick={() => !isCopied && copyToClipboard(code)}
        className="text-term-dim hover:text-term-prompt transition-colors"
        aria-label={isCopied ? "Copied" : "Copy code"}
      >
        {isCopied ? "[copied]" : "[copy]"}
      </button>
    </div>
  );
};

const components: Components = {
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        "mt-5 mb-2 scroll-m-20 text-xl font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        "mt-5 mb-2 scroll-m-20 text-lg font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn(
        "mt-4 mb-1.5 scroll-m-20 text-base font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn(
        "mt-3.5 mb-1 scroll-m-20 text-base font-medium first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      className={cn(
        "mt-3 mb-1 text-sm font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn(
        "mt-3 mb-1 text-sm font-medium first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn("my-3 leading-relaxed first:mt-0 last:mb-0", className)}
      {...props}
    />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn(
        "text-primary hover:text-primary/80 underline underline-offset-2",
        className,
      )}
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        "text-muted-foreground my-3 border-s-2 border-muted-foreground/30 ps-4",
        className,
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn(
        "marker:text-muted-foreground my-3 ms-5 list-disc [&>li]:mt-1",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn(
        "marker:text-muted-foreground my-3 ms-5 list-decimal [&>li]:mt-1",
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("border-muted-foreground/20 my-3", className)} {...props} />
  ),
  table: ({ className, ...props }) => (
    <table
      className={cn(
        "my-3 w-full border-separate border-spacing-0 overflow-y-auto",
        className,
      )}
      {...props}
    />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "bg-muted px-3 py-1.5 text-start font-medium [[align=center]]:text-center [[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        "border-muted-foreground/20 border-s border-b px-3 py-1.5 text-start last:border-e [[align=center]]:text-center [[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }) => (
    <tr className={cn("border-b p-0 m-0 first:border-t", className)} {...props} />
  ),
  li: ({ className, ...props }) => (
    <li className={cn("leading-relaxed", className)} {...props} />
  ),
  strong: ({ className, ...props }) => (
    <strong className={cn("font-semibold", className)} {...props} />
  ),
  pre: ({ className, children, ...props }) => {
    // Extract the code string + language so the CodeBlock header can show them.
    let language: string | undefined;
    let code = "";
    const child = (Array.isArray(children) ? children[0] : children) as unknown;
    if (isElement(child)) {
      const cls =
        typeof child.props?.className === "string" ? child.props.className : "";
      const match = /language-(\w+)/.exec(cls);
      if (match) language = match[1];
      code = extractText(child.props?.children);
    }
    return (
      <div className="mb-3 last:mb-0">
        <CodeBlock language={language} code={code} />
        <pre
          className={cn(
            "border-term-rule bg-muted/40 overflow-x-auto border border-t-0 p-3 text-[12.5px] leading-relaxed",
            className,
          )}
          {...props}
        >
          {children}
        </pre>
      </div>
    );
  },
  code: ({ className, children, ...props }) => {
    // Inline code only: react-markdown renders fenced code as `pre > code`,
    // which is styled by the `pre` component above. Detect inline by the absence
    // of a language class and no newline in the content.
    const isInline =
      !/language-/.test(className ?? "") && !String(children).includes("\n");
    return (
      <code
        className={cn(
          isInline &&
            "text-term-prompt bg-muted px-1 py-0.5 text-[0.9em]",
          className,
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
};

function isElement(
  node: unknown,
): node is { props?: { className?: unknown; children?: unknown } } {
  return !!node && typeof node === "object" && "props" in node;
}

function extractText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isElement(node)) return extractText(node.props?.children);
  return "";
}
