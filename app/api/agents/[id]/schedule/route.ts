// Jadwal kerja satu karyawan.
//
//   GET    → daftar jadwal + status runtime tiap job
//   POST   → buat            {name, cron, instruction}
//   PUT    → ubah            {jobId, ...field yang berubah}
//   DELETE → hapus           ?jobId=
//
// Gerbangnya sama dengan peralatan: id di luar roster kantor pemanggil dijawab
// 404, bukan 403, karena 403 mengonfirmasi bahwa agentnya ada.
import { NextResponse } from "next/server";

import { currentOffice } from "@/lib/office";
import {
  createCronJob,
  deleteCronJob,
  listCronJobs,
  readCronState,
  readInstruction,
  updateCronJob,
} from "@/lib/qwenpaw";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function guard(params: Params["params"]) {
  const { id } = await params;
  const office = await currentOffice();
  if (!office.roster.includes(id)) {
    return { error: NextResponse.json({ error: "Tidak ditemukan." }, { status: 404 }) };
  }
  if (!office.writable) {
    return { error: NextResponse.json({ error: "Masuk dulu." }, { status: 401 }) };
  }
  return { agentId: id };
}

function failure(e: unknown, fallback: string) {
  const message = e instanceof Error ? e.message : fallback;
  return NextResponse.json({ error: message }, { status: 502 });
}

/**
 * Cron lima-field, itu saja. Tidak menerima `@daily`/`@hourly` karena QwenPaw
 * tidak menjanjikannya, dan tidak menerima detik karena field keenam akan
 * diam-diam menggeser arti keempat field lainnya.
 */
const CRON_RE = /^(\S+\s+){4}\S+$/;

export async function GET(_req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  try {
    const jobs = await listCronJobs(g.agentId);
    const rows = await Promise.all(
      jobs.map(async (job) => ({
        id: job.id,
        name: job.name,
        enabled: job.enabled,
        cron: job.schedule?.cron ?? null,
        timezone: job.schedule?.timezone ?? null,
        instruction: readInstruction(job),
        state: await readCronState(g.agentId, job.id).catch(() => null),
      })),
    );
    return NextResponse.json({ jobs: rows });
  } catch (e) {
    return failure(e, "Gagal membaca jadwal.");
  }
}

export async function POST(req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  let body: { name?: unknown; cron?: unknown; instruction?: unknown; enabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body bukan JSON." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const cron = typeof body.cron === "string" ? body.cron.trim() : "";
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";

  if (!name) return NextResponse.json({ error: "Beri nama jadwalnya." }, { status: 400 });
  if (!CRON_RE.test(cron)) {
    return NextResponse.json(
      { error: "Pola cron harus lima bagian, mis. 0 2 * * 1-5." },
      { status: 400 },
    );
  }
  if (!instruction) {
    return NextResponse.json(
      { error: "Tulis instruksinya — jadwal tanpa instruksi tidak mengerjakan apa pun." },
      { status: 400 },
    );
  }

  try {
    const created = await createCronJob(g.agentId, {
      name,
      cron,
      instruction,
      enabled: body.enabled !== false,
    });
    return NextResponse.json({ id: created.id ?? null });
  } catch (e) {
    return failure(e, "Gagal membuat jadwal.");
  }
}

export async function PUT(req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  let body: {
    jobId?: unknown;
    name?: unknown;
    cron?: unknown;
    instruction?: unknown;
    enabled?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body bukan JSON." }, { status: 400 });
  }

  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!jobId) return NextResponse.json({ error: "Butuh jobId." }, { status: 400 });

  if (typeof body.cron === "string" && !CRON_RE.test(body.cron.trim())) {
    return NextResponse.json(
      { error: "Pola cron harus lima bagian, mis. 0 2 * * 1-5." },
      { status: 400 },
    );
  }

  try {
    await updateCronJob(g.agentId, jobId, {
      name: typeof body.name === "string" ? body.name.trim() : undefined,
      cron: typeof body.cron === "string" ? body.cron.trim() : undefined,
      instruction:
        typeof body.instruction === "string" ? body.instruction.trim() : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    });
    return NextResponse.json({ jobId });
  } catch (e) {
    return failure(e, "Gagal mengubah jadwal.");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const g = await guard(params);
  if ("error" in g) return g.error;

  const jobId = new URL(req.url).searchParams.get("jobId")?.trim() ?? "";
  if (!jobId) return NextResponse.json({ error: "Butuh jobId." }, { status: 400 });

  try {
    await deleteCronJob(g.agentId, jobId);
    return NextResponse.json({ jobId });
  } catch (e) {
    return failure(e, "Gagal menghapus jadwal.");
  }
}
