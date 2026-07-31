// Hasil kerja satu jadwal, dan tombol jalankan-sekarang.
//
//   GET  → hasil run terakhir + riwayat eksekusi
//   POST → jalankan sekarang, di luar jadwalnya
//
// "Jalankan sekarang" ada karena tanpa itu, satu-satunya cara tahu instruksi
// jadwal sudah benar adalah menunggu sampai besok pagi — dan orang yang harus
// menunggu semalam untuk tahu dia salah ketik tidak akan memasang jadwal kedua.
import { NextResponse } from "next/server";

import { currentOffice } from "@/lib/office";
import { readCronHistory, readJobOutput, runCronJobNow } from "@/lib/qwenpaw";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; jobId: string }> };

async function guard(params: Params["params"]) {
  const { id, jobId } = await params;
  const office = await currentOffice();
  if (!office.roster.includes(id)) {
    return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  }
  if (!office.writable) {
    return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  }
  return { agentId: id, jobId };
}

function failure(e: unknown, fallback: string) {
  return NextResponse.json(
    { error: e instanceof Error ? e.message : fallback },
    { status: 502 },
  );
}

export async function GET(_req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  try {
    const [output, history] = await Promise.all([
      readJobOutput(g.agentId, g.jobId),
      readCronHistory(g.agentId, g.jobId).catch(() => []),
    ]);
    return NextResponse.json({ ...output, history: history.slice(0, 8) });
  } catch (e) {
    return failure(e, "Could not read the schedule result.");
  }
}

export async function POST(_req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  try {
    await runCronJobNow(g.agentId, g.jobId);
    // Sengaja TIDAK menunggu selesai: satu run bisa makan menit, dan menahan
    // koneksi selama itu membuat tab tampak menggantung. Klien memuat ulang
    // hasilnya sendiri.
    return NextResponse.json({ started: true });
  } catch (e) {
    return failure(e, "Could not run the schedule.");
  }
}
