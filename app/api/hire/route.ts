// POST /api/hire — rekrut satu karyawan untuk kantor yang sedang aktif.
//
// Satu permintaan melakukan EMPAT hal sekaligus, dan itu memang intinya:
//   1. buat agent di QwenPaw
//   2. tulis PROFILE.md + SOUL.md-nya            → dia tahu dirinya siapa
//   3. pasang jadwal kerja pertamanya            → dia bekerja tanpa disuruh
//   4. catat id-nya di roster kantor (Clerk)     → dia muncul di laporan
//
// Kalau salah satu dari empat ini ditunda ke "nanti dikonfigurasi", hasilnya
// adalah kursi kosong — persis puluhan agent terlantar yang sudah ada di
// instance ini. Maka langkah 1–2 dianggap wajib: gagal di situ = rekrut gagal.
// Langkah 3 boleh gagal tanpa membatalkan rekrut (jadwal bisa dipasang ulang),
// tapi kegagalannya dilaporkan, tidak ditelan.
import { NextResponse } from "next/server";

import { currentOffice, saveRoster } from "@/lib/office";
import { buildProfile, buildSoul, findRole } from "@/lib/roles";
import { createAgent, createCronJob, deleteAgent, writeWorkspaceFile } from "@/lib/qwenpaw";

export const runtime = "nodejs";

/** Id agent QwenPaw: huruf kecil, angka, strip. Ditambah akhiran acak supaya
 *  dua "Rina" di dua perusahaan berbeda tidak bertabrakan di instance bersama. */
function makeAgentId(name: string): string {
  const slug = name
    .toLowerCase()
    // NFD memisah huruf beraksen jadi huruf + tanda; saringan berikutnya yang
    // membuang tandanya, jadi "José" ikut jadi "jose", bukan "jos".
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slug || "agent"}-${suffix}`;
}

export async function POST(req: Request) {
  const office = await currentOffice();
  if (!office.writable) {
    return NextResponse.json(
      { error: "Masuk dulu sebelum merekrut karyawan." },
      { status: 401 },
    );
  }

  let body: { roleKey?: unknown; name?: unknown; extra?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body bukan JSON." }, { status: 400 });
  }

  const roleKey = typeof body.roleKey === "string" ? body.roleKey : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const extra = typeof body.extra === "string" ? body.extra : "";

  const role = findRole(roleKey);
  if (!role) return NextResponse.json({ error: "Jabatan tidak dikenal." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Nama karyawan wajib diisi." }, { status: 400 });
  if (name.length > 40) {
    return NextResponse.json({ error: "Nama terlalu panjang (maks 40)." }, { status: 400 });
  }

  const agentId = makeAgentId(name);

  // 1. Otak agent di QwenPaw.
  try {
    await createAgent(agentId, name);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "QwenPaw menolak membuat agent." },
      { status: 502 },
    );
  }

  // 2. Identitasnya. Gagal di sini berarti yang tercipta adalah cangkang
  //    kosong — jadi agentnya dibatalkan, bukan dibiarkan menghuni roster.
  try {
    const company = office.name;
    await writeWorkspaceFile(
      agentId,
      "PROFILE.md",
      buildProfile({ name, role, company, extra }),
    );
    await writeWorkspaceFile(agentId, "SOUL.md", buildSoul({ name, role, company }));
  } catch (e) {
    await deleteAgent(agentId).catch(() => {
      /* pembersihan terbaik-usaha; kegagalannya tidak menutupi error asli */
    });
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `Agent dibuat tapi identitasnya gagal ditulis, jadi dibatalkan: ${e.message}`
            : "Gagal menulis identitas agent.",
      },
      { status: 502 },
    );
  }

  // 3. Jadwal kerja pertama. Boleh gagal — kantor tetap dapat karyawannya.
  let scheduleWarning: string | null = null;
  if (role.suggestedSchedule) {
    try {
      await createCronJob(agentId, {
        name: role.suggestedSchedule.label,
        cron: role.suggestedSchedule.cron,
        instruction: role.suggestedSchedule.prompt,
      });
    } catch (e) {
      scheduleWarning =
        e instanceof Error ? e.message : "Jadwal kerja pertamanya gagal dipasang.";
    }
  }

  // 4. Masuk roster kantor.
  try {
    await saveRoster(office, [...office.roster, agentId]);
  } catch (e) {
    await deleteAgent(agentId).catch(() => {});
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `Gagal mencatat karyawan di kantor: ${e.message}`
            : "Gagal mencatat karyawan di kantor.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ agentId, name, role: role.title, scheduleWarning });
}
