"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Theming. pabrik-startup switches theme via a model-called `set_theme` tool;
 * clawmpany-app talks to QwenPaw, whose console chat doesn't emit tool calls,
 * so the model can't drive a theme switch. Instead the theme is changed by the
 * user through slash commands (/light, /dark, /system) handled client-side in
 * components/chat/thread.tsx — this provider is what those commands write to.
 *
 * `attribute="class"` matches the `.dark` selector in globals.css, and
 * `disableTransitionOnChange` stops every border and background on the page
 * from cross-fading when the class flips — a terminal should switch instantly.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
