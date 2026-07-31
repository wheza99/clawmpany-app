import { Thread } from "@/components/chat/thread";
import { currentOffice } from "@/lib/office";
import { CONCIERGE_AGENT_ID } from "@/lib/qwenpaw";

export const dynamic = "force-dynamic";

/**
 * Manajer gedung.
 *
 * Ini BUKAN pintu masuk aplikasi — layar depan adalah laporan. Halaman ini
 * untuk pertanyaan tentang gedungnya: siapa yang bisa direkrut, bagaimana
 * memberi jadwal, peralatan apa yang tersedia. Lawan bicaranya agent yang
 * mengelola gedung, bukan karyawan kantor mana pun.
 */
export default async function ChatPage() {
  const office = await currentOffice();

  // Tanpa judul halaman sendiri: rel navigasi sudah menyorot "manajer gedung",
  // dan sapaan pembuka di bawah ini sudah menjelaskan apa yang bisa ditanyakan.
  // Dua penjelasan untuk satu layar cuma memakan tinggi yang seharusnya jadi
  // percakapan.
  return (
    <div className="flex h-full flex-col">
      <Thread
        agentId={CONCIERGE_AGENT_ID}
        greeting={
          office.roster.length === 0
            ? "Kantormu masih kosong. Ceritakan usahamu — saya usulkan siapa yang paling layak direkrut duluan."
            : `Kantor ${office.name} punya ${office.roster.length} karyawan. Tanya apa saja — siapa yang perlu direkrut, jadwal seperti apa yang masuk akal, peralatan apa yang bisa dipasang.`
        }
      />
    </div>
  );
}
