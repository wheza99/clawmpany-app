"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Penanda "sedang jalan" untuk antarmuka terminal ini.
 *
 * Kenapa bukan kursor berkedip: kedipan hanya punya dua keadaan, jadi ia tidak
 * bisa dibedakan dari kursor yang diam — dan tidak bisa menunjukkan bahwa ada
 * kemajuan. Braille spinner adalah cara CLI menjawab itu sejak dulu: sepuluh
 * bingkai yang berputar, satu karakter monospace, tidak menggeser satu pun
 * kolom teks di sekitarnya.
 *
 * Bingkainya digerakkan JavaScript, bukan CSS, karena yang berubah adalah ISI
 * karakter — `content` di keyframe belum bisa diandalkan lintas browser, dan
 * memutar elemen dengan `transform` akan melanggar aturan "tidak ada lengkungan
 * di mana pun" yang dipegang seluruh antarmuka ini.
 */

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_MS = 80;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function Spinner({ className }: { className?: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), FRAME_MS);
    return () => clearInterval(t);
  }, []);

  return (
    // Dekoratif: statusnya sendiri sudah diumumkan sebagai teks di sebelahnya,
    // jadi pembaca layar tidak perlu mendengar sepuluh bingkai per detik.
    <span aria-hidden="true" className={cn("inline-block select-none", className)}>
      {FRAMES[frame]}
    </span>
  );
}

/**
 * Waktu berjalan sejak `since`, "3.4s".
 *
 * Ini bagian yang membuat penantian bisa dinilai: spinner membuktikan aplikasi
 * hidup, angka ini membuktikan agent-nya belum tentu — 4 detik itu wajar, 70
 * detik itu alasan untuk menekan stop. Ikut disembunyikan dari pembaca layar
 * karena berubah sepuluh kali per detik.
 */
export function Elapsed({ since, className }: { since: number; className?: string }) {
  const [now, setNow] = useState(since);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);

  const seconds = Math.max(0, (now - since) / 1000);
  return (
    <span aria-hidden="true" className={cn("tabular-nums", className)}>
      {seconds.toFixed(1)}s
    </span>
  );
}
