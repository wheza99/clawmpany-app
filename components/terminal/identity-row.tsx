"use client";

import { OrganizationSwitcher, useClerk, useUser } from "@clerk/nextjs";
import { CircleUser } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { TermBlock, TermButton, TermRow } from "@/components/terminal/primitives";
import { APP_VERSION } from "@/lib/version";

/**
 * Di mana kamu, dan siapa kamu — dua hal yang harus bisa dilihat tanpa bertanya
 * lebih dulu ke chatbot yang justru milikmu.
 *
 * Ini SATU-SATUNYA kerangka yang tersisa di aplikasi. Tidak ada rel navigasi,
 * tidak ada menu, tidak ada halaman kedua: semua yang dulu jadi halaman kini
 * datang sebagai blok di dalam transkrip (lihat components/chat/thread.tsx).
 * Yang tidak bisa ikut ke sana cuma dua ini — keluar dari sebuah akun, dan tahu
 * perusahaan mana yang sedang dibuka.
 *
 * Baris ini dirender dua kali sepanjang hidup satu percakapan dan tidak pernah
 * bersamaan: di tengah layar selagi transkrip kosong, lalu di pita atas begitu
 * ada percakapan di bawahnya. Tempatnya sama, jadi tidak pernah ada bilah baru
 * yang muncul — ia cuma berhenti ikut menggulung.
 */
export function IdentityRow({ authOn }: { authOn: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      {authOn ? <OrgIdentity /> : <ProductName />}
      {authOn ? <UserMenu /> : null}
    </div>
  );
}

/**
 * Apa yang disebut header ini sebagai tempat ini.
 *
 * Belum masuk, yang ada cuma produknya, jadi yang dicetak produknya. Sudah
 * masuk, satu perusahaan ADALAH satu organisasi Clerk — maka slot yang sama
 * berubah jadi pemilih organisasi milik Clerk sendiri, dan nama di header
 * berhenti jadi nama alat dan mulai jadi nama kantor yang sedang kamu buka.
 * Berpindah perusahaan jadi gerakan yang sama dengan berpindah organisasi,
 * yang memang satu-satunya tempat keadaan itu benar-benar disimpan.
 */
function OrgIdentity() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded || !isSignedIn) return <ProductName />;

  return (
    <OrganizationSwitcher
      hidePersonal={false}
      afterCreateOrganizationUrl="/"
      afterSelectOrganizationUrl="/"
      afterSelectPersonalUrl="/"
      /*
       * Markup milik Clerk, ditarik ke arah terminal: sudut siku, satu warna
       * aksen yang dipunyai antarmuka ini, dan ukuran yang sama dengan ikon
       * akun di seberangnya.
       *
       * SETIAP deklarasi yang bertabrakan dengan milik Clerk diberi `!`. Clerk
       * memasang gaya buatannya sendiri pada elemen-elemen ini, dan gaya itu
       * mengalahkan kelas utilitas biasa — tanpa tanda seru, pemicunya tampil
       * dengan abu-abu dan ukuran milik Clerk, dan semua kelas di bawah ini
       * terbaca seperti kode mati.
       */
      appearance={{
        elements: {
          rootBox: "flex min-w-0 items-center",
          organizationSwitcherTrigger:
            "text-term-prompt! hover:bg-transparent! max-w-[16rem]! gap-1.5! rounded-none! px-0! py-0! text-sm! font-medium! tracking-tight! focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none",
          organizationPreviewAvatarBox: "size-4! rounded-none!",
          organizationSwitcherTriggerIcon: "text-term-dim!",
          organizationPreviewMainIdentifier: "truncate! text-sm!",
        },
      }}
    />
  );
}

function ProductName() {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="text-term-prompt text-sm font-medium tracking-tight">
        clawmpany
      </span>
      <span className="text-term-dim text-[11px]">v{APP_VERSION}</span>
    </div>
  );
}

/**
 * Siapa kamu, dan bagaimana berhenti jadi dia.
 *
 * Semua hal lain di produk ini dicapai dengan memintanya — perintah garis miring
 * di kotak ketik, atau kalimat biasa ke manajer gedung. Keluar dari akun adalah
 * pengecualiannya: orang yang ingin meninggalkan sebuah akun tidak seharusnya
 * lebih dulu menemukan bahwa jalan keluarnya adalah mengetik kalimat kepada
 * benda yang sedang ia tinggalkan.
 */
function UserMenu() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut, openSignIn, openUserProfile } = useClerk();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Dua cara sebuah permukaan sementara diharapkan menutup. Dipasang di
  // dokumen, bukan di panelnya, supaya klik di mana pun — termasuk di kotak
  // ketik di bawah — menutupnya tanpa ikut menelan klik itu.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const account = user?.primaryEmailAddress?.emailAddress ?? user?.id ?? null;

  // Kartu Clerk adalah modal buatannya sendiri, jadi menu yang meluncurkannya
  // tidak punya alasan untuk tetap duduk di belakangnya.
  const openCard = (show: () => void) => {
    setOpen(false);
    show();
  };

  return (
    // `z-30` supaya panelnya juga menang di layar kosong, tempat baris ini
    // duduk di dalam kolom yang menggulung — di sana lawannya kotak ketik yang
    // `sticky`, dan sticky pun membuat stacking context sendiri.
    <div ref={rootRef} className="relative z-30 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-term-dim hover:text-term-prompt focus-visible:ring-ring -m-1 block cursor-pointer p-1 transition-colors focus-visible:ring-1 focus-visible:outline-none"
        aria-expanded={open}
        aria-controls={open ? "user-menu-panel" : undefined}
        aria-label="Account"
      >
        <CircleUser aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>

      {open ? (
        // Ke bawah dan rata kanan: pemicunya ada di pojok kanan atas kolom,
        // jadi itu satu-satunya arah yang punya ruang. `select-text` membatalkan
        // `select-none` milik pita — alamat akun adalah satu-satunya hal di sini
        // yang mungkin ingin disalin orang.
        <div
          id="user-menu-panel"
          role="group"
          aria-label="Account"
          className="animate-fade-in absolute top-full right-0 z-10 mt-2 w-72 select-text"
        >
          <TermBlock label="session" tone="dim" className="bg-background">
            {!isLoaded ? (
              <span className="text-term-dim term-caret text-xs">reading</span>
            ) : isSignedIn ? (
              <>
                <TermRow label="account">
                  <span className="wrap-break-word">{account ?? "unknown"}</span>
                </TermRow>
                <div className="mt-3 flex flex-wrap gap-2">
                  <TermButton onClick={() => openCard(openUserProfile)}>
                    ▸ manage account
                  </TermButton>
                  <TermButton
                    onClick={() => {
                      setOpen(false);
                      void signOut();
                    }}
                  >
                    ▸ sign out
                  </TermButton>
                </div>
              </>
            ) : (
              <>
                <p className="text-muted-foreground mb-3 text-xs leading-relaxed">
                  You are browsing as a guest. The building manager still
                  answers, but there is no office to fill yet — sign in and you
                  can hire employees and read what they produce.
                </p>
                <TermButton variant="primary" onClick={() => openCard(openSignIn)}>
                  ▸ sign in
                </TermButton>
              </>
            )}
          </TermBlock>
        </div>
      ) : null}
    </div>
  );
}
