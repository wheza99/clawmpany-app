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
  listMcpServers,
  looksUnconfigured,
  readChat,
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
  /** Peralatan (MCP) yang menyala. Nol = hanya bisa menalar, tidak menyentuh data. */
  toolCount: number;
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

export interface WorkItem {
  agentId: string;
  agentName: string;
  /** Judul sesi tempat pekerjaan ini ditulis. */
  title: string;
  /** Keluaran terakhir agent di sesi itu — apa yang sebenarnya dia hasilkan. */
  excerpt: string;
  at: string | null;
  /** Hasil jadwal (dia bekerja sendiri) atau percakapan (kamu yang menyuruh). */
  scheduled: boolean;
}

export interface OfficeReport {
  officeName: string;
  /** Kantor belum punya karyawan sama sekali. Layar depan jadi onboarding. */
  empty: boolean;
  headcount: { total: number; configured: number; unconfigured: number };
  activity: { sessions24h: number; activeAgents24h: number };
  schedules: ScheduleRow[];
  staff: StaffMember[];
  /** Apa yang benar-benar dihasilkan, terbaru dulu. Inti layar depan. */
  work: WorkItem[];
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

/**
 * Bersihkan penanda markdown dari cuplikan hasil kerja.
 *
 * Cuplikan ditampilkan sebagai teks polos, bukan dirender — merender markdown
 * penuh di layar depan akan mengubah laporan jadi dokumen. Tapi membiarkan
 * penandanya terlihat (`**tebal**`, `## judul`) membuat laporan yang seharusnya
 * rapi terbaca seperti berkas mentah. Jadi penandanya dibuang, isinya tetap.
 */
function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "[kode]")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\s)\*([^*\n]+)\*/g, "$1$2")
    .replace(/^\s*[-*+]\s+/gm, "— ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isRecent(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && Date.now() - t < RECENT_WINDOW_MS;
}

export interface OfficeBrief {
  orgId: string | null;
  name: string;
  headcount: number;
  unconfigured: number;
  /** Karyawan yang punya minimal satu jadwal menyala. */
  working: number;
  sessions24h: number;
  /** Jadwal yang gagal pada run terakhirnya. */
  failing: number;
  error?: string;
}

/**
 * Ringkasan satu kantor untuk layar semua-perusahaan.
 *
 * Sengaja TIDAK memakai `buildReport`. Laporan penuh menembak tiga permintaan
 * per karyawan (sesi, jadwal, peralatan) plus satu per jadwal untuk statusnya —
 * dikalikan lima perusahaan, layar ringkasan jadi lebih lambat daripada lima
 * halaman yang digantikannya. Di sini peralatan dilewati sama sekali, dan
 * status jadwal hanya ditanyakan untuk job yang menyala.
 */
export async function buildBrief(office: Office): Promise<OfficeBrief> {
  const base: OfficeBrief = {
    orgId: office.orgId,
    name: office.name,
    headcount: office.roster.length,
    unconfigured: 0,
    working: 0,
    sessions24h: 0,
    failing: 0,
  };
  if (office.roster.length === 0) return base;

  let directory: QwenPawAgent[];
  try {
    directory = await listAgents();
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "QwenPaw tidak terjangkau." };
  }
  const byId = new Map(directory.map((a) => [a.id, a]));

  const rows = await Promise.all(
    office.roster.map(async (agentId) => {
      const agent = byId.get(agentId);
      if (!agent) return null;
      const [chats, jobs] = await Promise.all([
        listChats(agentId).catch(() => []),
        listCronJobs(agentId).catch(() => []),
      ]);
      const enabled = jobs.filter((j) => j.enabled);
      const states = await Promise.all(
        enabled.map((j) => readCronState(agentId, j.id).catch(() => null)),
      );
      return {
        configured: !looksUnconfigured(agent.description || ""),
        enabledJobs: enabled.length,
        recent: chats.filter((c) => isRecent(c.updated_at)).length,
        failing: states.filter((s) => s?.last_status && s.last_status !== "success").length,
      };
    }),
  );

  for (const row of rows) {
    if (!row) continue;
    if (!row.configured) base.unconfigured += 1;
    if (row.enabledJobs > 0) base.working += 1;
    base.sessions24h += row.recent;
    base.failing += row.failing;
  }
  return base;
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
    work: [],
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

      const [chats, jobs, tools] = await Promise.all([
        listChats(agentId).catch(() => []),
        listCronJobs(agentId).catch(() => []),
        listMcpServers(agentId).catch(() => []),
      ]);

      const states = await Promise.all(
        jobs.map(async (job) => ({
          job,
          state: await readCronState(agentId, job.id).catch(() => null),
        })),
      );

      // Sesi mana yang ditulis oleh jadwal. Diambil dari job yang SUDAH
      // di-fetch di atas, jadi tidak ada request tambahan — dan ini penanda
      // yang tepat, bukan tebakan dari pola nama session_id (jadwal yang
      // dibuat di luar Clawmpany tidak mengikuti pola itu).
      const scheduledSessions = new Set(
        jobs
          .map((j) => j.dispatch?.target?.session_id)
          .filter((s): s is string => Boolean(s)),
      );

      // Isi sesi TERBARU saja yang dibuka. Membuka semuanya berarti satu
      // request per sesi seumur hidup agent — layar depan akan melambat
      // seiring kantor makin produktif, yang persis kebalikan dari yang
      // seharusnya terjadi.
      const newest = [...chats].sort((a, b) =>
        (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
      )[0];

      let work: WorkItem | null = null;
      if (newest) {
        const messages = await readChat(agentId, newest.id).catch(() => []);
        const reply = messages.filter((m) => m.role === "assistant").at(-1);
        if (reply?.text) {
          work = {
            agentId,
            agentName: agent.name,
            title: newest.name || "Tanpa judul",
            excerpt: plainText(reply.text),
            at: newest.updated_at ?? reply.timestamp,
            scheduled: scheduledSessions.has(newest.session_id),
          };
        }
      }

      return { agent, chats, states, tools, work } as const;
    }),
  );

  const staff: StaffMember[] = [];
  const schedules: ScheduleRow[] = [];
  const work: WorkItem[] = [];
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

    const { agent, chats, states, tools, work: item } = row;
    if (item) work.push(item);
    const recent = chats.filter((c) => isRecent(c.updated_at));
    const lastActiveAt =
      chats.map((c) => c.updated_at).sort().at(-1) ?? null;
    const configured = !looksUnconfigured(agent.description || "");
    const enabledJobs = states.filter(({ job }) => job.enabled);
    const activeTools = tools.filter((t) => t.enabled).length;

    sessions24h += recent.length;
    if (recent.length > 0) activeAgents24h += 1;

    staff.push({
      id: agent.id,
      name: agent.name,
      role: roleOf(agent),
      model: agent.active_model?.model ?? null,
      configured,
      scheduleCount: enabledJobs.length,
      toolCount: activeTools,
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
    } else if (activeTools === 0) {
      attention.push({
        level: "idle",
        headline: `${agent.name} bekerja tanpa peralatan.`,
        action:
          "Pasang peralatan supaya dia menyentuh data sungguhan, bukan menalar dari ingatan.",
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

  // Terbaru dulu. Yang paling atas adalah hal terakhir yang terjadi di
  // perusahaan ini — itulah yang orang cari saat membuka halaman.
  work.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

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
    work,
    attention,
  };
}
