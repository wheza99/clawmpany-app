import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/theme-provider";
import { OfficeSidebar } from "@/components/office/sidebar";
import "./globals.css";

import { authEnabled } from "@/lib/office";

// One face for the entire product. globals.css aliases --font-sans to this same
// variable, so `font-sans` and `font-mono` resolve identically — there is no
// proportional text anywhere in the interface by design.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clawmpany — kantor untuk AI agent",
  description:
    "Rekrut agent, beri jadwal kerja, baca laporannya. Clawmpany adalah gedungnya, bukan agentnya.",
};

export const viewport: Viewport = {
  // Match the chrome to the two themes so mobile browsers don't frame a
  // near-black terminal in a white status bar.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1210" },
  ],
};

/**
 * ClerkProvider hanya dipasang kalau kuncinya ada. Tanpa itu ia melempar saat
 * render dan SELURUH app mati — padahal ketiadaan login seharusnya cuma berarti
 * "belum ada kantor yang bisa dibuka", bukan halaman error. Lihat lib/office.ts:
 * mode tanpa login tetap aman karena roster selalu eksplisit, jadi tidak ada
 * jalur yang membocorkan agent milik orang lain di instance yang sama.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authOn = authEnabled();

  // No hardcoded `dark` class: next-themes writes the resolved theme onto
  // <html> before React hydrates, so the server and client markup differ on
  // that one attribute — hence suppressHydrationWarning.
  const shell = (
    <html lang="id" suppressHydrationWarning className={geistMono.variable}>
      <body className="bg-background text-foreground min-h-full font-mono antialiased">
        <ThemeProvider>
          {/*
            Kerangka aplikasi: layar adalah bingkainya, isinya yang menggulung.
            `flex-col-reverse` menaruh rel di BAWAH pada ponsel tanpa position
            fixed — jadi tidak ada isi yang tertutup dan tidak ada padding
            kompensasi yang harus dijaga di tiap halaman.

            Dulu tiap halaman merender header-nya sendiri. Menaruhnya di sini
            berarti navigasi tidak ikut dirender ulang saat berpindah halaman:
            popover Clerk yang sedang terbuka tetap terbuka, dan rel tidak
            berkedip.
          */}
          <div className="flex h-svh flex-col-reverse overflow-hidden md:flex-row">
            <OfficeSidebar authOn={authOn} />
            <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );

  if (!authOn) return shell;

  return (
    <ClerkProvider
      appearance={{
        variables: {
          borderRadius: "0px",
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        },
      }}
    >
      {shell}
    </ClerkProvider>
  );
}
