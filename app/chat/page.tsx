import { Thread } from "@/components/chat/thread";
import { viewerName } from "@/lib/office";
import { CONCIERGE_AGENT_ID } from "@/lib/qwenpaw";

export const dynamic = "force-dynamic";

/**
 * Manajer gedung.
 *
 * Ini BUKAN pintu masuk aplikasi — layar depan adalah laporan. Halaman ini
 * untuk pertanyaan tentang gedungnya: siapa yang bisa direkrut, bagaimana
 * memberi jadwal, peralatan apa yang tersedia. Lawan bicaranya agent yang
 * mengelola gedung, bukan karyawan kantor mana pun.
 *
 * Sambutannya TIDAK ditulis di sini. Dulu halaman ini merakit satu kalimat
 * statis dari jumlah roster; sekarang manajer gedungnya sendiri yang membuka
 * percakapan (`prime`), dibekali keadaan kantor oleh server — jadi kalimat
 * pertama yang dibaca orang sudah menyebut siapa yang belum punya identitas
 * atau jadwal, bukan "ada yang bisa saya bantu?".
 */
export default async function ChatPage() {
  const viewer = await viewerName();

  // Tanpa judul halaman sendiri: rel navigasi sudah menyorot "manajer gedung",
  // dan kalimat pembuka dari agent-nya sendiri sudah menjelaskan apa yang bisa
  // ditanyakan. Dua penjelasan untuk satu layar cuma memakan tinggi yang
  // seharusnya jadi percakapan.
  return (
    <div className="flex h-full flex-col">
      <Thread
        agentId={CONCIERGE_AGENT_ID}
        agentName="clawmpany"
        userName={viewer}
        prime
      />
    </div>
  );
}
