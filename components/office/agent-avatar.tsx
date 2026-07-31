import { cn } from "@/lib/utils";

/**
 * Foto profil karyawan — sebuah kotak berisi inisialnya.
 *
 * QwenPaw tidak menyimpan gambar untuk agent, dan app ini tidak punya database
 * kedua untuk menampungnya (lihat lib/office.ts: rosternya saja menumpang di
 * metadata Clerk). Jadi alih-alih menggantung placeholder yang menunggu fitur
 * unggah yang belum ada, wajahnya adalah hurufnya — dan itu justru konsisten
 * dengan sisa antarmuka, yang seluruhnya monospace tanpa satu pun gambar.
 *
 * Yang penting dari elemen ini bukan wajahnya melainkan bahwa ia BISA DIKLIK
 * (lihat components/chat/thread.tsx): inilah pintu ke dialog manajemen.
 */
export function AgentAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "border-border text-term-prompt inline-flex size-5 shrink-0 items-center justify-center border",
        "text-[11px] leading-none font-medium select-none transition-colors",
        className,
      )}
    >
      {initial(name)}
    </span>
  );
}

/**
 * Huruf pertama yang BUKAN spasi. `charAt(0)` saja akan menampilkan kotak
 * kosong untuk nama yang tidak sengaja diawali spasi — dan kotak kosong
 * terbaca sebagai kerusakan, bukan sebagai nama yang perlu dirapikan.
 */
function initial(name: string): string {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}
