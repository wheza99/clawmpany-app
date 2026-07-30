import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// One face for the entire product. globals.css aliases --font-sans to this same
// variable, so `font-sans` and `font-mono` resolve identically — there is no
// proportional text anywhere in the interface by design.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clawmpany",
  description: "Terminal chat yang memanggil paw.wheza.id.",
};

export const viewport: Viewport = {
  // Match the chrome to the two themes so mobile browsers don't frame a
  // near-black terminal in a white status bar.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1210" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // No hardcoded `dark` class: next-themes writes the resolved theme onto
  // <html> before React hydrates, so the server and client markup differ on
  // that one attribute — hence suppressHydrationWarning.
  return (
    <html lang="en" suppressHydrationWarning className={geistMono.variable}>
      <body className="bg-background text-foreground min-h-full font-mono antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
