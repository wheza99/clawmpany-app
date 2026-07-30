// ────────────────────────────────────────────────────────────────
// lib/report.ts — SERVER ONLY. Mengubah data mentah QwenPaw jadi laporan.
//
// Ini isi layar depan Clawmpany. Aturannya satu: layar depan menjawab
// pertanyaan pemilik, bukan memamerkan data. Empat pertanyaan itu —
//
//   1. Berapa orang yang bekerja untuk saya?      → headcount
//   2. Apa yang terjadi selagi saya tidak lihat?  → activity
//   3. Apa yang berjalan otomatis?                → schedule
//   4. Apa yang butuh keputusan saya?             → attention
//
// — dan yang keempat ditaruh paling atas, karena itulah satu-satunya bagian
// yang menuntut sesuatu dari manusia.
// ────────────────────────────────────────────────────────────────
import "server-only";

import type { Office } from "@/lib/office";
import {
  listAgents,
  listChats,
  listCronJobs,
  looksUnconfigured,
  readCronState,
  type QwenPawAgent,
} from "@/lib/qwenpaw";

/** Batas "baru saja" untuk ringkasan aktivitas. */
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export type AttentionLevel = "blocked" | "idle" | "info";

export interface AttentionItem {
  level: AttentionLevel;
  /** Kalimat singkat: APA yang salah. */
  headline: string;
  /** Kalimat kedua: APA yang harus dilakukan. Selalu ada jalan keluar. */
  action: string;
  agentId?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  model: string | null;
  configured: boolean;
  /** Jadwal aktif yang dimiliki agent ini. */
  scheduleCount: number;
  /** Sesi kerja dalam 24 jam terakhir. */
  recentSessions: number;
  lastActiveAt: string | null;
}

export interface ScheduleRow {
  agentId: string;
  agentName: string;
  jobId: string;
  jobName: string;
  cron: string | null;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

export interface OfficeReport {
  officeName: string;
  /** Kantor belum punya karyawan sama sekali. Layar depan jadi onboarding. */
  empty: boolean;
  headcount: { total: number; configured: number; unconfigured: number };
  activity: { sessions24h: number; activeAgents24h: number };
  schedules: ScheduleRow[];
  staff: StaffMember[];
  attention: AttentionItem[];
  /** Terisi kalau QwenPaw tidak bisa dihubungi — UI menjelaskan, bukan kosong. */
  error?: string;
}

/**
 * Ambil "jabatan" agent dari deskripsi QwenPaw. Deskripsi bawaan menggabung
 * ringkasan + potongan PROFILE.md dengan pemisah " | ", jadi bagian sebelum
 * pemisah itulah kalimat yang ditulis manusia.
 */
function roleOf(agent: QwenPawAgent): string {
  const desc = (agent.description || "").trim();
  if (!desc) return "Belum ada jabatan";
  const head = desc.split(" | ")[0].trim();
  if (!head || head.startsWith("- **Name:**")) return "Belum ada jabatan";
  return head.length > 90 ? `${head.slice(0, 87)}…` : head;
}

function isRecent(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && Date.now() - t < RECENT_WINDOW_MS;
}

/**
 * Rakit laporan satu kantor. Hanya agent yang ada di roster yang disentuh —
 * jumlah request naik linear terhadap ukuran kantor, bukan terhadap ukuran
 * instance QwenPaw yang dipakai bersama.
 */
export async function buildReport(office: Office): Promise<OfficeReport> {
  const base: OfficeReport = {
    officeName: office.name,
    empty: office.roster.length === 0,
    headcount: { total: 0, configured: 0, unconfigured: 0 },
    activity: { sessions24h: 0, activeAgents24h: 0 },
    schedules: [],
    staff: [],
    attention: [],
  };

  if (office.roster.length === 0) return base;

  let directory: QwenPawAgent[];
  try {
    directory = await listAgents();
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "QwenPaw tidak bisa dihubungi." };
  }

  const byId = new Map(directory.map((a) => [a.id, a]));

  const rows = await Promise.all(
    office.roster.map(async (agentId) => {
      const agent = byId.get(agentId);
      // Ada di roster tapi hilang dari QwenPaw — karyawan yang dihapus di luar
      // Clawmpany. Itu keadaan nyata, jadi dilaporkan, bukan disembunyikan.
      if (!agent) return { missing: agentId } as const;

      const [chats, jobs] = await Promise.all([
        listChats(agentId).catch(() => []),
        listCronJobs(agentId).catch(() => []),
      ]);

      const states = await Promise.all(
        jobs.map(async (job) => ({
          job,
          state: await readCronState(agentId, job.id).catch(() => null),
        })),
      );

      return { agent, chats, states } as const;
    }),
  );

  const staff: StaffMember[] = [];
  const schedules: ScheduleRow[] = [];
  const attention: AttentionItem[] = [];
  let sessions24h = 0;
  let activeAgents24h = 0;

  for (const row of rows) {
    if ("missing" in row) {
      attention.push({
        level: "blocked",
        headline: `Karyawan \`${row.missing}\` tidak ada lagi di QwenPaw.`,
        action: "Hapus dari roster, atau rekrut ulang dengan nama yang sama.",
        agentId: row.missing,
      });
      continue;
    }

    const { agent, chats, states } = row;
    const recent = chats.filter((c) => isRecent(c.updated_at));
    const lastActiveAt =
      chats.map((c) => c.updated_at).sort().at(-1) ?? null;
    const configured = !looksUnconfigured(agent.description || "");
    const enabledJobs = states.filter(({ job }) => job.enabled);

    sessions24h += recent.length;
    if (recent.length > 0) activeAgents24h += 1;

    staff.push({
      id: agent.id,
      name: agent.name,
      role: roleOf(agent),
      model: agent.active_model?.model ?? null,
      configured,
      scheduleCount: enabledJobs.length,
      recentSessions: recent.length,
      lastActiveAt,
    });

    for (const { job, state } of states) {
      schedules.push({
        agentId: agent.id,
        agentName: agent.name,
        jobId: job.id,
        jobName: job.name,
        cron: job.schedule?.cron ?? null,
        enabled: job.enabled,
        nextRunAt: state?.next_run_at ?? null,
        lastRunAt: state?.last_run_at ?? null,
        lastStatus: state?.last_status ?? null,
        lastError: state?.last_error ?? null,
      });

      if (job.enabled && state?.last_status && state.last_status !== "success") {
        attention.push({
          level: "blocked",
          headline: `Jadwal "${job.name}" (${agent.name}) gagal.`,
          action: state.last_error?.slice(0, 160) || "Buka detailnya dan jalankan ulang.",
          agentId: agent.id,
        });
      }
    }

    // Dua bentuk "karyawan yang digaji tapi tidak bekerja", dan keduanya
    // adalah kegagalan produk, bukan kegagalan user — jadi kalimatnya
    // menunjuk ke tindakan, bukan menyalahkan.
    if (!configured) {
      attention.push({
        level: "idle",
        headline: `${agent.name} belum punya identitas.`,
        action: "Isi peran & cara kerjanya — tanpa itu dia tidak akan mengerjakan apa pun.",
        agentId: agent.id,
      });
    } else if (enabledJobs.length === 0) {
      attention.push({
        level: "idle",
        headline: `${agent.name} tidak punya jadwal kerja.`,
        action: "Beri jadwal supaya dia bekerja tanpa kamu buka aplikasi ini.",
        agentId: agent.id,
      });
    }
  }

  // Yang menghambat dulu, baru yang menganggur. Dalam satu tingkat, urutan
  // roster dipertahankan supaya posisinya tidak berpindah-pindah tiap refresh.
  const rank: Record<AttentionLevel, number> = { blocked: 0, idle: 1, info: 2 };
  attention.sort((a, b) => rank[a.level] - rank[b.level]);

  schedules.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return (a.nextRunAt ?? "9999").localeCompare(b.nextRunAt ?? "9999");
  });

  return {
    officeName: office.name,
    empty: false,
    headcount: {
      total: staff.length,
      configured: staff.filter((s) => s.configured).length,
      unconfigured: staff.filter((s) => !s.configured).length,
    },
    activity: { sessions24h, activeAgents24h },
    schedules,
    staff,
    attention,
  };
}
