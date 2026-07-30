import Link from "next/link";

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
 * Layar depan Clawmpany.
 *
 * Urutannya bukan selera: yang menuntut keputusan manusia ditaruh paling atas,
 * angka ringkasan di bawahnya, daftar lengkap paling akhir. Pemilik perusahaan
 * membuka ini di sela pekerjaan lain — kalau tidak ada yang perlu dia putuskan,
 * dia harus bisa tahu itu dalam satu pandangan lalu menutupnya lagi.
 */
export function ReportView({ report }: { report: OfficeReport }) {
  const { headcount, activity, attention, staff, schedules } = report;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg">{report.officeName}</h1>
        <span className="text-term-dim text-[11px]">{today()}</span>
      </div>

      {report.error ? (
        <TermBlock label="Tidak bisa membaca kantor" tone="warn">
          <p className="text-sm">{report.error}</p>
          <p className="text-term-dim mt-1.5 text-xs">
            Data di bawah mungkin tidak lengkap. Coba muat ulang sebentar lagi.
          </p>
        </TermBlock>
      ) : null}

      <AttentionPanel items={attention} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Karyawan"
          value={String(headcount.total)}
          detail={
            headcount.unconfigured > 0
              ? `${headcount.unconfigured} belum siap kerja`
              : "semua sudah punya identitas"
          }
          tone={headcount.unconfigured > 0 ? "warn" : "default"}
        />
        <Stat
          label="24 jam terakhir"
          value={String(activity.sessions24h)}
          detail={
            activity.sessions24h === 0
              ? "tidak ada yang bekerja"
              : `sesi · ${activity.activeAgents24h} agent bergerak`
          }
          tone={activity.sessions24h === 0 ? "warn" : "default"}
        />
        <Stat
          label="Jadwal aktif"
          value={String(schedules.filter((s) => s.enabled).length)}
          detail={nextRunLabel(schedules)}
          tone={schedules.some((s) => s.enabled) ? "default" : "warn"}
        />
      </div>

      <WorkPanel items={report.work} />
      <StaffPanel staff={staff} />
      <SchedulePanel rows={schedules} />
    </div>
  );
}

// ── Butuh keputusan ─────────────────────────────────────────────

function AttentionPanel({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <TermBlock label="Butuh keputusan kamu">
        <p className="text-sm">
          <TermGutter marker="·" className="text-term-dim" />
          Tidak ada. Semua karyawan punya identitas dan jadwal, dan tidak ada
          jadwal yang gagal.
        </p>
      </TermBlock>
    );
  }

  const blocked = items.filter((i) => i.level === "blocked").length;

  return (
    <TermBlock
      label={`Butuh keputusan kamu · ${items.length}`}
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
      <TermBlock label="Hasil kerja" tone="dim">
        <p className="text-term-dim text-xs">
          Belum ada satu pun. Begitu karyawan menjalankan jadwalnya, hasilnya
          muncul di sini — dan inilah halaman yang perlu kamu buka tiap pagi.
        </p>
      </TermBlock>
    );
  }

  return (
    <TermBlock label={`Hasil kerja · ${items.length}`}>
      <ul className="divide-border divide-y">
        {items.map((w) => (
          <li key={`${w.agentId}:${w.at ?? w.title}`} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <Link
                href={`/agent/${encodeURIComponent(w.agentId)}`}
                className="hover:text-term-prompt text-sm transition-colors"
              >
                {w.agentName}
              </Link>
              <span className="text-term-dim text-xs">{w.title}</span>
              <span className="text-term-dim ml-auto text-[11px]">
                <span className={w.scheduled ? "text-term-prompt" : "text-term-dim"}>
                  {w.scheduled ? "terjadwal" : "diminta"}
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
    <TermBlock label={`Karyawan · ${staff.length}`}>
      <ul className="divide-border divide-y">
        {staff.map((s) => (
          <li key={s.id} className="py-2 first:pt-0 last:pb-0">
            <Link href={`/agent/${encodeURIComponent(s.id)}`} className="group block">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="group-hover:text-term-prompt text-sm transition-colors">
                  {s.name}
                </span>
                {!s.configured ? (
                  <span className="text-term-warn text-[10px] tracking-wider uppercase">
                    kursi kosong
                  </span>
                ) : null}
                <span className="text-term-dim ml-auto text-[11px]">
                  {s.scheduleCount > 0 ? `${s.scheduleCount} jadwal` : "tanpa jadwal"}
                  {" · "}
                  {s.toolCount > 0 ? `${s.toolCount} alat` : "tanpa alat"}
                  {" · "}
                  {s.recentSessions > 0 ? `${s.recentSessions} sesi/24j` : "diam"}
                </span>
              </div>
              <div className="text-term-dim mt-0.5 text-xs">{s.role}</div>
            </Link>
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
      <TermBlock label="Jadwal kerja" tone="dim">
        <p className="text-term-dim text-xs">
          Belum ada jadwal. Selama belum ada, agent hanya bekerja saat kamu
          menyuruhnya — dan itu berarti kamu tetap yang jadi mesinnya.
        </p>
      </TermBlock>
    );
  }

  return (
    <TermBlock label={`Jadwal kerja · ${rows.length}`}>
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
              {r.cron ? <code>{r.cron}</code> : "tanpa pola"}
              {r.nextRunAt ? ` · berikutnya ${shortTime(r.nextRunAt)}` : ""}
              {r.lastRunAt ? ` · terakhir ${shortTime(r.lastRunAt)}` : " · belum pernah jalan"}
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
  if (!enabled) return <span className="text-term-dim">mati</span>;
  if (!status) return <span className="text-term-dim">menunggu</span>;
  if (status === "success") return <span className="text-term-prompt">ok</span>;
  return <span className="text-term-warn">{status}</span>;
}

// ── Format ──────────────────────────────────────────────────────

const TZ = "Asia/Jakarta";

function today(): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(new Date());
}

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
  if (!next) return "tidak ada yang terjadwal";
  return `berikutnya ${shortTime(next)}`;
}
