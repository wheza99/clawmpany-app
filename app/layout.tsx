import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

import { authEnabled } from "@/lib/office";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clawmpany — kantor untuk AI agent",
  description:
    "Rekrut agent, beri jadwal kerja, baca laporannya. Clawmpany adalah gedungnya, bukan agentnya.",
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
  const shell = (
    <html
      lang="id"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground min-h-full font-mono">
        {children}
      </body>
    </html>
  );

  if (!authEnabled()) return shell;

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
