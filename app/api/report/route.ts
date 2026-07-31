// Laporan kantor yang sedang dibuka.
//
// Dulu ini server component di halaman depan. Halaman depan sekarang adalah
// percakapan, jadi laporannya diminta — `/laporan` di kotak ketik — dan datang
// sebagai blok di dalam transkrip, di tempat pertanyaannya muncul.
//
// Yang menyeberang cuma hasil rakitan `buildReport`, bukan roster mentahnya:
// lib/report.ts sudah membatasi diri pada agent yang tercatat di kantor si
// pemanggil, dan itulah yang menjaga instance QwenPaw bersama ini tidak
// membocorkan karyawan orang lain.
import { NextResponse } from "next/server";

import { currentOffice } from "@/lib/office";
import { buildReport } from "@/lib/report";

export const runtime = "nodejs";

export async function GET() {
  const office = await currentOffice();

  // Belum masuk = belum punya kantor. Dijawab 401 dan bukan laporan kosong:
  // laporan kosong terbaca seperti "kantormu memang tidak berisi apa-apa",
  // yang salah alamat untuk orang yang bahkan belum punya kantor.
  if (!office.userId) {
    return NextResponse.json({ error: "Sign in to open your office." }, { status: 401 });
  }

  try {
    return NextResponse.json(await buildReport(office));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read the office." },
      { status: 502 },
    );
  }
}
