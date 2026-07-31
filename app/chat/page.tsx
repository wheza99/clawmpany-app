import { OfficeHeader } from "@/components/office/header";
import { Thread } from "@/components/chat/thread";
import { officeDirectory } from "@/lib/directory";
import { authEnabled, currentOffice } from "@/lib/office";
import { CONCIERGE_AGENT_ID } from "@/lib/qwenpaw";

export const dynamic = "force-dynamic";

/**
 * Meja depan kantor.
 *
 * Ini BUKAN pintu masuk aplikasi — layar depan adalah laporan. Yang dibuka di
 * sini adalah percakapan, dan yang menerima pertama kali manajer gedung: dia
 * yang tahu siapa mengurus apa. Begitu jelas urusannya milik karyawan lain,
 * pembicaraan BERPINDAH ke orang itu dan dia yang menjawab — jadi pemilik tidak
 * perlu tahu lebih dulu siapa yang harus ditanya, yang selama ini jadi alasan
 * pertanyaan berhenti di kepala dan tidak pernah ditanyakan.
 *
 * Daftar orang diambil di server: manajer gedung + roster kantor ini saja.
 * /api/chat memeriksa ulang tiap tujuan, jadi daftar ini soal tampilan, bukan
 * izin.
 */
export default async function ChatPage() {
  const office = await currentOffice();
  const colleagues = await officeDirectory(office).catch(() => []);
  const staff = colleagues.filter((c) => c.id !== CONCIERGE_AGENT_ID);

  return (
    <div className="flex h-svh flex-col">
      <OfficeHeader authOn={authEnabled()} />
      <div className="min-h-0 flex-1">
        <Thread
          agentId={CONCIERGE_AGENT_ID}
          colleagues={colleagues}
          greeting={
            staff.length === 0
              ? "Kantormu masih kosong. Ceritakan usahamu — saya usulkan siapa yang paling layak direkrut duluan."
              : `Kantor ${office.name} punya ${staff.length} karyawan: ${staff
                  .map((c) => c.name)
                  .join(", ")}. Tanya apa saja — kalau urusannya milik salah satu dari mereka, saya sambungkan.`
          }
        />
      </div>
    </div>
  );
}
