"use client";

import Link from "next/link";
import { OrganizationSwitcher, SignInButton, UserButton, useAuth } from "@clerk/nextjs";

/**
 * Baris paling atas: nama produk, pemilih perusahaan, akun.
 *
 * Pemilih perusahaan adalah OrganizationSwitcher bawaan Clerk — satu organisasi
 * = satu perusahaan = satu kantor, jadi berpindah antar perusahaan tidak pernah
 * jadi navigasi ke URL lain, cukup satu dropdown yang selalu di tempat yang sama.
 */
export function OfficeHeader({ authOn }: { authOn: boolean }) {
  return (
    <header className="border-border bg-background sticky top-0 z-20 border-b">
      <div className="mx-auto flex h-12 w-full max-w-5xl items-center gap-3 px-4">
        <Link
          href="/"
          className="text-term-prompt shrink-0 text-sm font-medium tracking-[0.16em] uppercase"
        >
          Clawmpany
        </Link>
        <span className="text-term-dim hidden text-[11px] sm:inline">
          kantor untuk AI agent
        </span>
        <div className="ml-auto flex items-center gap-2">
          {authOn ? <AuthControls /> : null}
        </div>
      </div>
    </header>
  );
}

function AuthControls() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <span className="text-term-dim text-[11px]">…</span>;

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button className="border-border hover:border-term-prompt hover:text-term-prompt cursor-pointer border px-3 py-1 text-xs transition-colors">
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
            rootBox: "flex items-center",
            organizationSwitcherTrigger:
              "border border-[var(--border)] px-2 py-1 text-xs text-[var(--foreground)]",
          },
        }}
      />
      {/* Tujuan setelah logout diatur lewat NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL;
          Clerk v7 tidak lagi menerimanya sebagai prop di sini. */}
      <UserButton />
    </>
  );
}
