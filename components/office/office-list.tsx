"use client";

import { SwitchOffice } from "@/components/office/switch-office";
import { TermBlock, TermGutter } from "@/components/terminal/primitives";
import type { OfficeBrief } from "@/lib/report";
import { cn } from "@/lib/utils";

/**
 * Semua perusahaan dalam satu blok.
 *
 * Menjawab satu pertanyaan saja: **perusahaan mana yang butuh saya hari ini?**
 * Sisanya ada di kantor masing-masing, satu klik "buka" dari sini.
 *
 * Urutannya datang dari server (/api/offices) dan tidak diutak-atik di sini —
 * "butuh perhatian" adalah aturan produk, dan aturan yang punya dua salinan
 * cepat atau lambat akan berbeda pendapat.
 */
export function OfficeList({
  offices,
  activeOrgId,
}: {
  offices: OfficeBrief[];
  activeOrgId: string | null;
}) {
  if (offices.length === 0) {
    return (
      <TermBlock label="no companies yet">
        <p className="text-sm">
          Create one from the company switcher at the top left — one
          organisation = one company = one office.
        </p>
        <p className="text-term-dim mt-1.5 text-xs">
          Run five businesses? Create five, each with its own employees.
        </p>
      </TermBlock>
    );
  }

  const totals = offices.reduce(
    (t, b) => ({
      headcount: t.headcount + b.headcount,
      sessions: t.sessions + b.sessions24h,
      failing: t.failing + b.failing,
      unconfigured: t.unconfigured + b.unconfigured,
    }),
    { headcount: 0, sessions: 0, failing: 0, unconfigured: 0 },
  );

  return (
    <div className="space-y-6">
      <TermBlock
        label="needs attention"
        tone={
          totals.failing > 0 ? "warn" : totals.unconfigured > 0 ? "default" : "dim"
        }
      >
        {totals.failing === 0 && totals.unconfigured === 0 ? (
          <p className="text-sm">
            <TermGutter marker="·" className="text-term-dim" />
            Nothing. No schedule is failing, and every employee has an
            identity.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {totals.failing > 0 ? (
              <li className="flex">
                <TermGutter marker="!" className="text-term-warn" />
                <span>
                  {totals.failing} failing schedules at{" "}
                  {offices
                    .filter((b) => b.failing > 0)
                    .map((b) => b.name)
                    .join(", ")}
                  .
                </span>
              </li>
            ) : null}
            {totals.unconfigured > 0 ? (
              <li className="flex">
                <TermGutter marker="·" className="text-term-dim" />
                <span>
                  {totals.unconfigured} employees have no identity — they will
                  not do any work.
                </span>
              </li>
            ) : null}
          </ul>
        )}
      </TermBlock>

      <TermBlock
        label={`offices · ${offices.length} · ${totals.headcount} employees · ${totals.sessions} sessions/24h`}
      >
        <ul className="divide-border divide-y">
          {offices.map((b) => (
            <OfficeRow key={b.orgId ?? "personal"} brief={b} activeId={activeOrgId} />
          ))}
        </ul>
      </TermBlock>
    </div>
  );
}

function OfficeRow({
  brief,
  activeId,
}: {
  brief: OfficeBrief;
  activeId: string | null;
}) {
  const isActive = brief.orgId === activeId;
  const idle = brief.headcount > 0 && brief.working === 0;

  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn("text-sm", isActive && "text-term-prompt")}>
          {brief.name}
        </span>
        {isActive ? (
          <span className="text-term-dim text-[10px] tracking-wider uppercase">
            open
          </span>
        ) : null}
        <span className="text-term-dim ml-auto text-[11px]">
          {brief.headcount === 0
            ? "empty"
            : `${brief.headcount} employees · ${brief.working} on a schedule`}
        </span>
      </div>

      <div className="text-term-dim mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
        {brief.error ? (
          <span className="text-term-warn">{brief.error}</span>
        ) : (
          <>
            <span>{brief.sessions24h} sessions/24h</span>
            {brief.failing > 0 ? (
              <span className="text-term-warn">· {brief.failing} failing schedules</span>
            ) : null}
            {brief.unconfigured > 0 ? (
              <span className="text-term-warn">· {brief.unconfigured} empty seats</span>
            ) : null}
            {idle && brief.failing === 0 ? (
              <span className="text-term-warn">· nobody works on their own</span>
            ) : null}
          </>
        )}

        <span className="ml-auto">
          {isActive ? (
            <span className="text-term-dim">this office</span>
          ) : (
            <SwitchOffice orgId={brief.orgId} name={brief.name} />
          )}
        </span>
      </div>
    </li>
  );
}
