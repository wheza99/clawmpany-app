"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  OrganizationSwitcher,
  SignInButton,
  UserButton,
  useAuth,
} from "@clerk/nextjs";

import { cn } from "@/lib/utils";

/**
 * Satu-satunya kerangka navigasi aplikasi.
 *
 * Menggantikan baris atas yang dulu ada di setiap halaman. Alasannya bukan
 * selera: baris itu memakan tinggi layar di halaman yang isinya justru laporan
 * — dan di `/chat` ia bertumpuk dengan judul halaman sehingga sepertiga layar
 * ponsel habis sebelum satu baris percakapan pun terbaca. Rel kiri memakan
 * lebar, yang justru berlimpah di layar lebar dan tidak dipakai oleh kolom
 * `max-w-5xl` di tengah.
 *
 * Di layar sempit rel ini menjadi bilah bawah, bukan bilah atas: ibu jari ada
 * di sana, dan tinggi layar tetap utuh untuk isinya.
 *
 * Manajemen akun dan organisasi memakai komponen bawaan Clerk apa adanya —
 * `UserButton` (kelola akun, keluar) dan `OrganizationSwitcher` (pindah
 * perusahaan, kelola, buat baru). Menulis ulang keduanya berarti memelihara
 * salinan alur yang Clerk sudah perbarui sendiri.
 */
export function OfficeSidebar({ authOn }: { authOn: boolean }) {
  const pathname = usePathname();

  const items: NavItem[] = [
    {
      href: "/",
      label: "kantor",
      // Halaman karyawan adalah drill-down dari laporan kantor, jadi rel tetap
      // menyorot "kantor" saat berada di sana — bukan tidak menyorot apa pun.
      active: pathname === "/" || pathname.startsWith("/agent"),
    },
    ...(authOn
      ? [
          {
            href: "/semua",
            label: "semua perusahaan",
            short: "semua",
            active: pathname.startsWith("/semua"),
          },
        ]
      : []),
    {
      href: "/chat",
      label: "manajer gedung",
      short: "manajer",
      active: pathname.startsWith("/chat"),
    },
  ];

  return (
    <nav
      aria-label="Navigasi utama"
      className={cn(
        // Ponsel: bilah bawah setipis mungkin.
        "border-border bg-card/40 flex shrink-0 items-center gap-3 border-t px-3 py-2",
        // Layar lebar: rel kiri setinggi layar. Lebarnya diukur dari isi
        // terlebar yang harus muat — pemilih perusahaan bawaan Clerk (avatar +
        // nama + ikon), bukan dari label navigasinya.
        "md:h-full md:w-56 md:flex-col md:items-stretch md:gap-0 md:border-t-0 md:border-r md:px-3 md:py-4",
      )}
    >
      <Link
        href="/"
        className="text-term-prompt hidden shrink-0 text-sm font-medium tracking-[0.16em] uppercase md:block"
      >
        Clawmpany
      </Link>

      <ul className="flex min-w-0 items-center gap-3 md:mt-6 md:flex-col md:items-stretch md:gap-0.5">
        {items.map((item) => (
          <li key={item.href} className="min-w-0">
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex items-baseline text-[11px] transition-colors md:py-1 md:text-xs",
                item.active
                  ? "text-term-prompt"
                  : "text-term-dim hover:text-foreground",
              )}
            >
              {/* Penanda `❯` cuma muat di rel lebar; di bilah bawah warnalah
                  yang menandai halaman yang sedang dibuka. */}
              <span
                aria-hidden="true"
                className="term-gutter hidden md:inline-block"
              >
                {item.active ? "❯" : " "}
              </span>
              <span className="truncate md:hidden">{item.short ?? item.label}</span>
              <span className="hidden truncate md:inline">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      {/* `min-w-0` supaya nama perusahaan atau nama orang yang panjang
          dipotong Clerk sendiri, bukan melebarkan rel dan mendorong isi
          halaman keluar layar. */}
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2 md:mt-auto md:ml-0 md:flex-col md:items-stretch md:gap-2.5 md:border-term-rule md:border-t md:pt-3.5">
        {authOn ? <AccountControls /> : null}
      </div>
    </nav>
  );
}

interface NavItem {
  href: string;
  label: string;
  /** Versi pendek untuk bilah bawah di ponsel. Kosong = pakai `label`. */
  short?: string;
  active: boolean;
}

/**
 * Kelola organisasi + kelola akun, keduanya komponen Clerk.
 *
 * Kelasnya ditulis sebagai variabel CSS mentah (`var(--border)`) karena string
 * ini dipasang ke elemen di dalam pohon Clerk, di luar jangkauan token warna
 * Tailwind milik aplikasi ini.
 */
function AccountControls() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <span className="text-term-dim text-[11px]" aria-hidden="true">
        …
      </span>
    );
  }

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button className="border-border hover:border-term-prompt hover:text-term-prompt w-full cursor-pointer border px-3 py-1 text-xs transition-colors">
          Masuk
        </button>
      </SignInButton>
    );
  }

  return (
    <>
      <OrganizationSwitcher
        hidePersonal={false}
        afterCreateOrganizationUrl="/"
        afterSelectOrganizationUrl="/"
        afterSelectPersonalUrl="/"
        appearance={{
          elements: {
            rootBox: "flex min-w-0 items-center md:w-full",
            organizationSwitcherTrigger:
              "max-w-full border border-[var(--border)] px-2 py-1 text-xs text-[var(--foreground)] md:w-full md:justify-start",
            // Di bilah bawah hanya avatarnya yang muat; nama perusahaan sudah
            // tertulis besar-besar di judul halaman kantor.
            organizationPreviewTextContainer: "hidden min-w-0 md:flex",
            organizationPreviewMainIdentifier: "truncate",
          },
        }}
      />
      {/* Tujuan setelah logout diatur lewat NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL;
          Clerk v7 tidak lagi menerimanya sebagai prop di sini. */}
      <UserButton
        showName
        appearance={{
          elements: {
            rootBox: "flex min-w-0 items-center md:w-full",
            userButtonBox: "min-w-0 md:w-full",
            userButtonOuterIdentifier:
              "hidden truncate text-xs text-[var(--foreground)] md:block",
          },
        }}
      />
    </>
  );
}
