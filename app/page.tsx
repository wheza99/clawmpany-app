import { Thread } from "@/components/chat/thread";
import { officeDirectory } from "@/lib/directory";
import { authEnabled, currentOffice, viewerName } from "@/lib/office";
import { CONCIERGE_AGENT_ID } from "@/lib/qwenpaw";

export const dynamic = "force-dynamic";

/**
 * Seluruh aplikasi, satu halaman.
 *
 * Dulu ada tiga: laporan kantor di `/`, daftar perusahaan di `/semua`, ruang
 * chat di `/chat`, plus halaman karyawan di `/agent/[id]`. Semuanya kini masuk
 * ke percakapan ini — lihat catatan panjang di components/chat/thread.tsx untuk
 * ke mana masing-masing pergi.
 *
 * Yang menerima adalah manajer gedung: dia yang tahu siapa mengurus apa. Begitu
 * jelas urusannya milik karyawan lain, pembicaraan BERPINDAH ke orang itu dan
 * dia yang menjawab — jadi pemilik tidak perlu tahu duluan siapa yang harus
 * ditanya, yang selama ini jadi alasan pertanyaan berhenti di kepala.
 *
 * TIDAK ADA sapaan otomatis. Layar ini diam sampai kamu mengetik — itu yang
 * membuat baris identitas, satu kalimat penjelas, dan kotak ketik duduk di
 * tengah layar alih-alih berkelebat sepersekian detik.
 *
 * Instruksi sesinya tidak ikut hilang: ia menumpang pada pesan PERTAMA yang
 * benar-benar diketik orang (lib/prompt.ts, disambung /api/chat), jadi manajer
 * gedung tetap tahu keadaan kantor sebelum menjawab kalimat pertama — hanya
 * saja ia menjawab, bukan menyapa.
 *
 * Daftar orangnya disusun di server: manajer gedung + roster kantor ini saja.
 * /api/chat memeriksa ulang setiap tujuan, jadi daftar ini soal tampilan,
 * bukan izin.
 */
export default async function Home() {
  const office = await currentOffice();
  const [viewer, colleagues] = await Promise.all([
    viewerName(),
    officeDirectory(office).catch(() => []),
  ]);

  return (
    <Thread
      authOn={authEnabled()}
      agentId={CONCIERGE_AGENT_ID}
      agentName="clawmpany"
      userName={viewer}
      companyName={office.name}
      colleagues={colleagues}
    />
  );
}
