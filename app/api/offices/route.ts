// Semua perusahaan milik orang ini, satu baris per kantor.
//
// Menjawab satu pertanyaan saja: perusahaan mana yang butuh saya hari ini.
// Pemilik lima usaha tidak akan membuka lima kantor tiap pagi untuk tahu ada
// yang macet atau tidak — dia akan berhenti membuka semuanya.
//
// Urutannya ditentukan DI SINI, bukan di browser: yang menentukan mana yang
// "butuh perhatian" adalah aturan produk, dan aturan itu tidak seharusnya
// punya dua salinan yang bisa berbeda pendapat.
import { NextResponse } from "next/server";

import { allOffices, currentOffice } from "@/lib/office";
import { buildBrief, type OfficeBrief } from "@/lib/report";

export const runtime = "nodejs";

/** Makin besar makin butuh perhatian. Menentukan urutan baris. */
function score(b: OfficeBrief): number {
  return (
    b.failing * 100 +
    b.unconfigured * 10 +
    (b.headcount > 0 && b.working === 0 ? 5 : 0)
  );
}

export async function GET() {
  const active = await currentOffice();
  if (!active.userId) {
    return NextResponse.json({ error: "Sign in to see your companies." }, { status: 401 });
  }

  try {
    const briefs = await Promise.all((await allOffices()).map(buildBrief));
    return NextResponse.json({
      activeOrgId: active.orgId,
      offices: [...briefs].sort((a, b) => score(b) - score(a)),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read the company list." },
      { status: 502 },
    );
  }
}
