import Link from "next/link";

import { OfficeHeader } from "@/components/office/header";
import { SwitchOffice } from "@/components/office/switch-office";
import { TermBlock, TermGutter } from "@/components/terminal/primitives";
import { allOffices, authEnabled, currentOffice } from "@/lib/office";
import { buildBrief, type OfficeBrief } from "@/lib/report";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Semua perusahaan dalam satu layar.
 *
 * Pemilik lima usaha tidak akan membuka lima tab tiap pagi untuk tahu ada yang
 * macet atau tidak — dia akan berhenti membuka semuanya. Layar ini menjawab
 * satu pertanyaan saja: **perusahaan mana yang butuh saya hari ini?** Sisanya
 * ada di halaman masing-masing.
 */
export default async function AllOfficesPage() {
  const authOn = authEnabled();
  const active = await currentOffice();

  if (!authOn || !active.userId) {
    return (
      <Shell authOn={authOn}>
        <h1 className="text-lg">Semua perusahaan</h1>
        <p className="text-term-dim mt-1 text-sm">Masuk dulu untuk melihat kantormu.</p>
      </Shell>
    );
  }

  const offices = await allOffices();
  const briefs = await Promise.all(offices.map(buildBrief));

  // Yang butuh perhatian naik ke atas: jadwal gagal dulu, lalu kursi kosong,
  // lalu kantor yang tidak ada yang bekerja sama sekali.
  const ranked = [...briefs].sort((a, b) => score(b) - score(a));
  const totals = briefs.reduce(
    (t, b) => ({
      headcount: t.headcount + b.headcount,
      sessions: t.sessions + b.sessions24h,
      failing: t.failing + b.failing,
      unconfigured: t.unconfigured + b.unconfigured,
    }),
    { headcount: 0, sessions: 0, failing: 0, unconfigured: 0 },
  );

  return (
    <Shell authOn={authOn}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg">Semua perusahaan</h1>
        <span className="text-term-dim text-[11px]">
          {briefs.length} kantor · {totals.headcount} karyawan · {totals.sessions} sesi/24j
        </span>
      </div>

      {offices.length === 0 ? (
        <TermBlock label="Belum ada perusahaan">
          <p className="text-sm">
            Buat organisasi lewat pemilih di kanan atas — satu organisasi = satu
            perusahaan = satu kantor.
          </p>
          <p className="text-term-dim mt-1.5 text-xs">
            Punya lima usaha? Buat lima, masing-masing dengan karyawannya sendiri.
          </p>
        </TermBlock>
      ) : (
        <>
          <TermBlock
            label="Butuh perhatian"
            tone={totals.failing > 0 ? "warn" : totals.unconfigured > 0 ? "default" : "dim"}
          >
            {totals.failing === 0 && totals.unconfigured === 0 ? (
              <p className="text-sm">
                <TermGutter marker="·" className="text-term-dim" />
                Tidak ada. Tidak ada jadwal yang gagal, dan semua karyawan punya
                identitas.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {totals.failing > 0 ? (
                  <li className="flex">
                    <TermGutter marker="!" className="text-term-warn" />
                    <span>
                      {totals.failing} jadwal gagal di{" "}
                      {ranked.filter((b) => b.failing > 0).map((b) => b.name).join(", ")}.
                    </span>
                  </li>
                ) : null}
                {totals.unconfigured > 0 ? (
                  <li className="flex">
                    <TermGutter marker="·" className="text-term-dim" />
                    <span>
                      {totals.unconfigured} karyawan belum punya identitas — mereka
                      tidak akan mengerjakan apa pun.
                    </span>
                  </li>
                ) : null}
              </ul>
            )}
          </TermBlock>

          <TermBlock label={`Kantor · ${ranked.length}`}>
            <ul className="divide-border divide-y">
              {ranked.map((b) => (
                <OfficeRow key={b.orgId ?? "personal"} brief={b} activeId={active.orgId} />
              ))}
            </ul>
          </TermBlock>
        </>
      )}
    </Shell>
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
        <span className={cn("text-sm", isActive && "text-term-prompt")}>{brief.name}</span>
        {isActive ? (
          <span className="text-term-dim text-[10px] tracking-wider uppercase">dibuka</span>
        ) : null}
        <span className="text-term-dim ml-auto text-[11px]">
          {brief.headcount === 0
            ? "kosong"
            : `${brief.headcount} karyawan · ${brief.working} bekerja terjadwal`}
        </span>
      </div>

      <div className="text-term-dim mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
        {brief.error ? (
          <span className="text-term-warn">{brief.error}</span>
        ) : (
          <>
            <span>{brief.sessions24h} sesi/24j</span>
            {brief.failing > 0 ? (
              <span className="text-term-warn">· {brief.failing} jadwal gagal</span>
            ) : null}
            {brief.unconfigured > 0 ? (
              <span className="text-term-warn">· {brief.unconfigured} kursi kosong</span>
            ) : null}
            {idle && brief.failing === 0 ? (
              <span className="text-term-warn">· tidak ada yang bekerja sendiri</span>
            ) : null}
          </>
        )}

        <span className="ml-auto">
          {isActive ? (
            <Link href="/" className="text-term-prompt hover:underline">
              buka →
            </Link>
          ) : (
            <SwitchOffice orgId={brief.orgId} name={brief.name} />
          )}
        </span>
      </div>
    </li>
  );
}

/** Makin besar makin butuh perhatian. Menentukan urutan baris. */
function score(b: OfficeBrief): number {
  return (
    b.failing * 100 +
    b.unconfigured * 10 +
    (b.headcount > 0 && b.working === 0 ? 5 : 0)
  );
}

function Shell({ authOn, children }: { authOn: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <OfficeHeader authOn={authOn} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6">{children}</main>
      <footer className="border-border mt-auto border-t">
        <div className="text-term-dim mx-auto flex w-full max-w-5xl items-center px-4 py-3 text-[11px]">
          <span>Clawmpany adalah gedungnya, bukan agentnya.</span>
          <Link href="/" className="hover:text-term-prompt ml-auto transition-colors">
            Kantor yang sedang dibuka →
          </Link>
        </div>
      </footer>
    </div>
  );
}
