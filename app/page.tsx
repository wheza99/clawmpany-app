import Link from "next/link";

import { OfficeHeader } from "@/components/office/header";
import { HireCatalog } from "@/components/office/hire-catalog";
import { ReportView } from "@/components/office/report-view";
import { TermBlock, TermGutter } from "@/components/terminal/primitives";
import { authEnabled, currentOffice, type Office } from "@/lib/office";
import { buildReport } from "@/lib/report";
import { ROLE_CATALOG } from "@/lib/roles";

// Laporan selalu dibaca hidup: angka kemarin yang tampil seperti angka hari
// ini lebih buruk daripada halaman yang lambat sedikit.
export const dynamic = "force-dynamic";

export default async function Home() {
  const authOn = authEnabled();
  const office = await currentOffice();
  const signedIn = Boolean(office.userId);

  return (
    <div className="flex min-h-svh flex-col">
      <OfficeHeader authOn={authOn} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {!authOn ? (
          <SetupNeeded />
        ) : !signedIn ? (
          <SignedOut />
        ) : office.roster.length === 0 ? (
          <EmptyOffice officeName={office.name} />
        ) : (
          <Occupied office={office} />
        )}
      </main>
      <Footer signedIn={signedIn} />
    </div>
  );
}

async function Occupied({ office }: { office: Office }) {
  const report = await buildReport(office);

  return (
    <div className="space-y-6">
      <ReportView report={report} />
      <HireCatalog roles={ROLE_CATALOG} company={office.name} compact />
    </div>
  );
}

/**
 * Kantor kosong bukan halaman error — ini justru saat paling menentukan.
 * Orang baru saja masuk dan belum punya siapa-siapa, jadi layar ini tidak
 * boleh berisi kursor kedip: ia harus menunjukkan siapa saja yang bisa
 * direkrut dan apa yang akan mereka kerjakan.
 */
function EmptyOffice({ officeName }: { officeName: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg">{officeName}</h1>
        <p className="text-term-dim mt-1 text-xs">Kantornya sudah berdiri. Isinya belum ada.</p>
      </div>

      <TermBlock label="Cara kerjanya">
        <ul className="space-y-1.5 text-sm">
          {[
            "Rekrut karyawan — pilih jabatan, dia langsung punya peran dan jadwal.",
            "Dia bekerja sesuai jadwalnya, termasuk saat kamu tidak membuka aplikasi ini.",
            "Kamu buka halaman ini untuk membaca hasilnya, bukan untuk menyuruh.",
          ].map((line, i) => (
            <li key={i} className="flex">
              <TermGutter marker={`${i + 1}`} className="text-term-prompt" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </TermBlock>

      <HireCatalog roles={ROLE_CATALOG} company={officeName} />
    </div>
  );
}

function SignedOut() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg">Clawmpany</h1>
        <p className="text-term-dim mt-1 text-sm">
          Kantor untuk AI agent. Kamu yang punya gedungnya.
        </p>
      </div>

      <TermBlock label="Yang kamu dapat">
        <ul className="space-y-2 text-sm">
          {[
            ["Rekrut sebanyak yang kamu mau", "Chief of staff, CS, marketing, keuangan, operasional — atau jabatan yang kamu tulis sendiri."],
            ["Mereka bekerja terjadwal", "Bukan menunggu diajak ngobrol. Laporan pagi tetap terbit walau kamu tidak buka aplikasi ini."],
            ["Satu gedung per perusahaan", "Punya lima usaha? Lima kantor, lima roster, satu akun."],
          ].map(([title, body]) => (
            <li key={title} className="flex">
              <TermGutter marker="▸" className="text-term-prompt" />
              <span>
                <span className="block">{title}</span>
                <span className="text-term-dim block text-xs">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </TermBlock>

      <p className="text-term-dim text-xs">
        Masuk lewat tombol di kanan atas untuk membuka kantormu.
      </p>
    </div>
  );
}

/**
 * Clerk belum dikonfigurasi di server. Ditulis apa adanya — halaman yang
 * berpura-pura baik-baik saja lebih mahal daripada satu paragraf jujur.
 */
function SetupNeeded() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg">Clawmpany</h1>
      <TermBlock label="Belum siap dipakai" tone="warn">
        <p className="text-sm">Login belum aktif, jadi kantor belum bisa dibuka.</p>
        <p className="text-term-dim mt-1.5 text-xs">
          Server ini butuh <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> (sebagai
          build variable) dan <code>CLERK_SECRET_KEY</code>. Selama keduanya kosong,
          tidak ada data kantor yang ditampilkan — termasuk milik orang lain.
        </p>
      </TermBlock>
    </div>
  );
}

function Footer({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="border-border mt-auto border-t">
      <div className="text-term-dim mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[11px]">
        <span>Clawmpany adalah gedungnya, bukan agentnya.</span>
        <Link href="/chat" className="hover:text-term-prompt ml-auto transition-colors">
          {signedIn ? "Tanya manajer gedung →" : "Tanya dulu →"}
        </Link>
      </div>
    </footer>
  );
}
