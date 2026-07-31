import { OfficeHeader } from "@/components/office/header";
import { Thread } from "@/components/chat/thread";
import { officeDirectory } from "@/lib/directory";
import { authEnabled, currentOffice, viewerName } from "@/lib/office";
import { CONCIERGE_AGENT_ID } from "@/lib/qwenpaw";

export const dynamic = "force-dynamic";

/**
 * Meja depan kantor.
 *
 * Ini BUKAN pintu masuk aplikasi — layar depan adalah laporan. Yang menerima
 * lebih dulu di sini manajer gedung: dia yang tahu siapa mengurus apa. Begitu
 * jelas urusannya milik karyawan lain, pembicaraan BERPINDAH ke orang itu dan
 * dia yang menjawab — jadi pemilik tidak perlu tahu duluan siapa yang harus
 * ditanya, yang selama ini jadi alasan pertanyaan berhenti di kepala.
 *
 * Sambutannya TIDAK ditulis di sini. Dulu halaman ini merakit satu kalimat
 * statis dari jumlah roster; sekarang manajer gedungnya sendiri yang membuka
 * percakapan (`prime`), dibekali keadaan kantor oleh server — jadi kalimat
 * pertama yang dibaca orang sudah menyebut siapa yang belum punya identitas
 * atau jadwal, bukan "ada yang bisa saya bantu?".
 *
 * Daftar orangnya disusun di server: manajer gedung + roster kantor ini saja.
 * /api/chat memeriksa ulang setiap tujuan, jadi daftar ini soal tampilan,
 * bukan izin. Baris "kamu sedang bicara dengan siapa" pindah ke dalam Thread —
 * begitu lawan bicaranya bisa berganti, judul statis di halaman jadi bohong.
 */
export default async function ChatPage() {
  const office = await currentOffice();
  const [viewer, colleagues] = await Promise.all([
    viewerName(),
    officeDirectory(office).catch(() => []),
  ]);

  return (
    <div className="flex h-svh flex-col">
      <OfficeHeader authOn={authEnabled()} />
      <div className="min-h-0 flex-1">
        <Thread
          agentId={CONCIERGE_AGENT_ID}
          agentName="clawmpany"
          userName={viewer}
          colleagues={colleagues}
          prime
          // Tanpa `manageable`: manajer gedung milik gedung, bukan karyawan
          // kantor ini — ia tidak pernah masuk roster, jadi semua rute
          // manajemennya menjawab 404. Foto yang bisa diklik untuknya cuma
          // jalan buntu yang terbaca sebagai kerusakan. Karyawan yang menerima
          // alih di layar ini TETAP bisa diatur: mereka datang dari roster,
          // dan `Thread` membedakan keduanya sendiri.
        />
      </div>
    </div>
  );
}
