import { OfficeHeader } from "@/components/office/header";
import { Thread } from "@/components/chat/thread";
import { authEnabled, viewerName } from "@/lib/office";
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

  return (
    <div className="flex h-svh flex-col">
      <OfficeHeader authOn={authEnabled()} />
      <div className="border-border bg-card/40 border-b px-4 py-2">
        <div className="mx-auto w-full max-w-5xl">
          <p className="text-sm">Manajer gedung</p>
          <p className="text-term-dim text-[11px]">
            Tanya apa saja soal kantormu — siapa yang perlu direkrut, jadwal
            seperti apa yang masuk akal, peralatan apa yang bisa dipasang.
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <Thread
          agentId={CONCIERGE_AGENT_ID}
          agentName="clawmpany"
          userName={viewer}
          prime
        />
      </div>
    </div>
  );
}
