"use client";

import { createContext, useContext } from "react";

import { TermBlock, TermGutter } from "@/components/terminal/primitives";
import type {
  AttentionItem,
  OfficeReport,
  ScheduleRow,
  StaffMember,
  WorkItem,
} from "@/lib/report";
import { cn } from "@/lib/utils";

/**
 * Laporan kantor, dirender sebagai blok di dalam percakapan.
 *
 * Urutannya bukan selera: yang menuntut keputusan manusia ditaruh paling atas,
 * angka ringkasan di bawahnya, daftar lengkap paling akhir. Pemilik perusahaan
 * memintanya di sela pekerjaan lain — kalau tidak ada yang perlu dia putuskan,
 * dia harus bisa tahu itu dalam satu pandangan lalu melanjutkan mengetik.
 *
 * Setiap nama karyawan dulu tautan ke /agent/[id]. Halaman itu sudah tidak ada:
 * keempat panel pengaturannya kini isi `AgentDialog`, yang terbuka DI ATAS
 * percakapan alih-alih menggantikannya. Jadi yang dibawa nama sekarang bukan
 * href melainkan pemanggil — dan pemanggilnya dititipkan lewat context, bukan
 * prop, supaya tidak ada empat lapis komponen yang meneruskan satu fungsi yang
 * hanya dipakai di dasar pohon.
 */
const OpenAgentContext = createContext<((id: string, name: string) => void) | null>(null);

export function ReportView({
  report,
  onOpenAgent,
}: {
  report: OfficeReport;
  /** Kosong = nama karyawan jadi teks biasa, bukan tombol. */
  onOpenAgent?: (id: string, name: string) => void;
}) {
  const { headcount, activity, attention, staff, schedules } = report;

  return (
    <OpenAgentContext value={onOpenAgent ?? null}>
    <div className="space-y-6">
      {report.error ? (
        <TermBlock label="could not read the office" tone="warn">
          <p className="text-sm">{report.error}</p>
          <p className="text-term-dim mt-1.5 text-xs">
            What follows may be incomplete. Try again in a moment.
          </p>
        </TermBlock>
      ) : null}

      <AttentionPanel items={attention} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Employees"
          value={String(headcount.total)}
          detail={
            headcount.unconfigured > 0
              ? `${headcount.unconfigured} not ready to work`
              : "all have an identity"
          }
          tone={headcount.unconfigured > 0 ? "warn" : "default"}
        />
        <Stat
          label="last 24 hours"
          value={String(activity.sessions24h)}
          detail={
            activity.sessions24h === 0
              ? "no one worked"
              : `sessions · ${activity.activeAgents24h} agents moved`
          }
          tone={activity.sessions24h === 0 ? "warn" : "default"}
        />
        <Stat
          label="active schedules"
          value={String(schedules.filter((s) => s.enabled).length)}
          detail={nextRunLabel(schedules)}
          tone={schedules.some((s) => s.enabled) ? "default" : "warn"}
        />
      </div>

      <WorkPanel items={report.work} />
      <StaffPanel staff={staff} />
      <SchedulePanel rows={schedules} />
    </div>
    </OpenAgentContext>
  );
}

/**
 * Nama karyawan yang bisa diklik untuk membuka pengaturannya — atau teks biasa
 * kalau layar yang memasang laporan ini tidak menyediakan pintunya.
 */
function AgentName({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  const open = useContext(OpenAgentContext);
  if (!open) return <span className={className}>{name}</span>;
  return (
    <button
      type="button"
      onClick={() => open(id, name)}
      title={`Manage ${name}`}
      className={cn(
        "hover:text-term-prompt focus-visible:ring-ring cursor-pointer text-left transition-colors focus-visible:ring-1 focus-visible:outline-none",
        className,
      )}
    >
      {name}
    </button>
  );
}

// ── Butuh keputusan ─────────────────────────────────────────────

function AttentionPanel({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <TermBlock label="needs your decision">
        <p className="text-sm">
          <TermGutter marker="·" className="text-term-dim" />
          Nothing. Every employee has an identity and a schedule, and no
          schedule is failing.
        </p>
      </TermBlock>
    );
  }

  const blocked = items.filter((i) => i.level === "blocked").length;

  return (
    <TermBlock
      label={`needs your decision · ${items.length}`}
      tone={blocked > 0 ? "warn" : "default"}
    >
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={`${item.agentId ?? "x"}-${i}`} className="text-sm">
            <div className="flex">
              <TermGutter
                marker={item.level === "blocked" ? "!" : "·"}
                className={item.level === "blocked" ? "text-term-warn" : "text-term-dim"}
              />
              <span>{item.headline}</span>
            </div>
            <div className="text-term-dim flex text-xs">
              <TermGutter marker="" />
              <span>
                <span className="text-term-prompt">→ </span>
                {item.action}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </TermBlock>
  );
}

// ── Angka ringkasan ─────────────────────────────────────────────

function Stat({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="border-border border p-3">
      <div className="text-term-dim text-[10px] tracking-[0.18em] uppercase">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl leading-none",
          tone === "warn" ? "text-term-warn" : "text-term-prompt",
        )}
      >
        {value}
      </div>
      <div className="text-term-dim mt-1.5 text-[11px]">{detail}</div>
    </div>
  );
}

// ── Hasil kerja ─────────────────────────────────────────────────

/**
 * Apa yang benar-benar dihasilkan karyawan, bukan berapa kali mereka jalan.
 *
 * Angka "14 sesi" tidak menjawab pertanyaan yang membuat orang membuka halaman
 * ini di pagi hari — dia ingin tahu APA yang terjadi semalam. Panel inilah
 * alasan layar depan berupa laporan dan bukan kotak chat; tanpa isinya,
 * "reporting-first" cuma tata letak yang berbeda.
 */
function WorkPanel({ items }: { items: WorkItem[] }) {
  if (items.length === 0) {
    return (
      <TermBlock label="work produced" tone="dim">
        <p className="text-term-dim text-xs">
          None yet. The moment an employee runs its schedule, what it produced
          shows up here — this is the part worth reading each morning.
        </p>
      </TermBlock>
    );
  }

  return (
    <TermBlock label={`work produced · ${items.length}`}>
      <ul className="divide-border divide-y">
        {items.map((w) => (
          <li key={`${w.agentId}:${w.at ?? w.title}`} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <AgentName id={w.agentId} name={w.agentName} className="text-sm" />
              <span className="text-term-dim text-xs">{w.title}</span>
              <span className="text-term-dim ml-auto text-[11px]">
                <span className={w.scheduled ? "text-term-prompt" : "text-term-dim"}>
                  {w.scheduled ? "scheduled" : "asked"}
                </span>
                {w.at ? ` · ${shortTime(w.at)}` : ""}
              </span>
            </div>
            <p className="text-term-dim mt-1 max-h-32 overflow-hidden text-xs whitespace-pre-wrap">
              {w.excerpt.slice(0, 600)}
              {w.excerpt.length > 600 ? "…" : ""}
            </p>
          </li>
        ))}
      </ul>
    </TermBlock>
  );
}

// ── Karyawan ────────────────────────────────────────────────────

function StaffPanel({ staff }: { staff: StaffMember[] }) {
  if (staff.length === 0) return null;

  return (
    <TermBlock label={`employees · ${staff.length}`}>
      <ul className="divide-border divide-y">
        {staff.map((s) => (
          <li key={s.id} className="py-2 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <AgentName id={s.id} name={s.name} className="text-sm" />
              {!s.configured ? (
                <span className="text-term-warn text-[10px] tracking-wider uppercase">
                  empty seat
                </span>
              ) : null}
              <span className="text-term-dim ml-auto text-[11px]">
                {s.scheduleCount > 0 ? `${s.scheduleCount} schedules` : "no schedule"}
                {" · "}
                {s.toolCount > 0 ? `${s.toolCount} tools` : "no tools"}
                {" · "}
                {s.recentSessions > 0 ? `${s.recentSessions} sessions/24h` : "idle"}
              </span>
            </div>
            <div className="text-term-dim mt-0.5 text-xs">{s.role}</div>
          </li>
        ))}
      </ul>
    </TermBlock>
  );
}

// ── Jadwal ──────────────────────────────────────────────────────

function SchedulePanel({ rows }: { rows: ScheduleRow[] }) {
  if (rows.length === 0) {
    return (
      <TermBlock label="work schedule" tone="dim">
        <p className="text-term-dim text-xs">
          No schedules yet. Until there are, an agent only works when you tell
          it to — which means you are still the machine.
        </p>
      </TermBlock>
    );
  }

  return (
    <TermBlock label={`work schedule · ${rows.length}`}>
      <ul className="divide-border divide-y">
        {rows.map((r) => (
          <li key={`${r.agentId}:${r.jobId}`} className="py-2 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className={r.enabled ? "" : "text-term-dim line-through"}>
                {r.jobName}
              </span>
              <span className="text-term-dim text-[11px]">{r.agentName}</span>
              <span className="ml-auto text-[11px]">
                <StatusTag enabled={r.enabled} status={r.lastStatus} />
              </span>
            </div>
            <div className="text-term-dim mt-0.5 text-[11px]">
              {r.cron ? <code>{r.cron}</code> : "no pattern"}
              {r.nextRunAt ? ` · next ${shortTime(r.nextRunAt)}` : ""}
              {r.lastRunAt ? ` · last ${shortTime(r.lastRunAt)}` : " · never run"}
            </div>
            {r.lastError ? (
              <div className="text-term-warn mt-0.5 text-[11px]">{r.lastError.slice(0, 180)}</div>
            ) : null}
          </li>
        ))}
      </ul>
    </TermBlock>
  );
}

function StatusTag({ enabled, status }: { enabled: boolean; status: string | null }) {
  if (!enabled) return <span className="text-term-dim">off</span>;
  if (!status) return <span className="text-term-dim">waiting</span>;
  if (status === "success") return <span className="text-term-prompt">ok</span>;
  return <span className="text-term-warn">{status}</span>;
}

// ── Format ──────────────────────────────────────────────────────

const TZ = "Asia/Jakarta";

function shortTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(t));
}

function nextRunLabel(rows: ScheduleRow[]): string {
  const next = rows
    .filter((r) => r.enabled && r.nextRunAt)
    .map((r) => r.nextRunAt!)
    .sort()
    .at(0);
  if (!next) return "nothing scheduled";
  return `next ${shortTime(next)}`;
}
