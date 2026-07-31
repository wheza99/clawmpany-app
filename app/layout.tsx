import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/theme-provider";
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
  title: "Clawmpany — an office for AI agents",
  description:
    "AI employees that work on a schedule. Clawmpany is the building, not the agent.",
};

export const viewport: Viewport = {
  // Match the chrome to the two themes so mobile browsers don't frame a
  // near-black terminal in a white status bar.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0b0b" },
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
    <html lang="en" suppressHydrationWarning className={geistMono.variable}>
      <body className="bg-background text-foreground min-h-full font-mono antialiased">
        <ThemeProvider>
          {/*
            Kerangka aplikasi: layar adalah bingkainya, isinya yang menggulung.
            Tanpa rel navigasi — tiap halaman membuka dengan `AppHeader`-nya
            sendiri (components/office/app-header.tsx) dan mengurus gulungannya
            sendiri di bawah pita itu.

            Bingkai ini yang menjaga `h-full` di halaman berarti "setinggi
            layar": halaman chat menggantungkan seluruh tata letaknya pada itu,
            karena header dan kotak ketik harus diam sementara transkrip yang
            bergerak.
          */}
          <div className="h-svh overflow-hidden">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  );

  if (!authOn) return shell;

  return (
    <ClerkProvider
      /*
       * Permukaan Clerk diwarnai lewat API-nya sendiri, bukan lewat kelas
       * Tailwind di tiap elemen. Dua alasan, dan keduanya pernah menggigit:
       *
       *  1. Clerk memasang gaya buatannya sendiri pada elemen-elemennya, dan
       *     gaya itu mengalahkan kelas utilitas — bahkan yang bertanda `!`.
       *     Yang ditulis di `appearance.elements` jadi terlihat terpasang
       *     padahal mati.
       *  2. Kartu login, popover akun, dan pemilih perusahaan dirender ke
       *     portal di luar pohon halaman. Mewarnainya satu per satu berarti
       *     mengejar setiap permukaan baru yang Clerk tambahkan.
       *
       * Nilainya adalah VARIABEL CSS, bukan warna mati: kelas `dark` menempel
       * di <html> dan menurun sampai ke portal, jadi permukaan Clerk berganti
       * tema bersama halamannya tanpa provider ini perlu tahu tema yang
       * sedang aktif — yang memang mustahil, karena ia dirender di server.
       */
      appearance={{
        variables: {
          colorPrimary: "var(--term-prompt)",
          colorPrimaryForeground: "var(--primary-foreground)",
          colorBackground: "var(--popover)",
          colorForeground: "var(--foreground)",
          colorMuted: "var(--muted)",
          colorMutedForeground: "var(--muted-foreground)",
          colorBorder: "var(--border)",
          colorInput: "var(--card)",
          colorInputForeground: "var(--foreground)",
          colorRing: "var(--ring)",
          colorDanger: "var(--destructive)",
          colorWarning: "var(--term-warn)",
          borderRadius: "0px",
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontFamilyButtons: "var(--font-geist-mono), ui-monospace, monospace",
        },
      }}
    >
      {shell}
    </ClerkProvider>
  );
}
