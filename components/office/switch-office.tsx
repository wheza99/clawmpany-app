"use client";

import { useRouter } from "next/navigation";
import { useOrganizationList } from "@clerk/nextjs";
import { useState } from "react";

/**
 * Pindah ke kantor lain langsung dari baris daftarnya.
 *
 * Pemilih organisasi di header sudah bisa melakukan ini, tapi menuntut orang
 * naik ke pojok layar dan mencari nama yang barusan dia baca di tengah halaman.
 * Kantor yang butuh perhatian harus bisa dibuka dari tempat perhatian itu
 * muncul.
 */
export function SwitchOffice({ orgId, name }: { orgId: string | null; name: string }) {
  const router = useRouter();
  const { isLoaded, setActive } = useOrganizationList();
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!isLoaded || !setActive) return;
    setBusy(true);
    try {
      await setActive({ organization: orgId });
      router.push("/");
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={!isLoaded || busy}
      aria-label={`Buka ${name}`}
      className="text-term-dim hover:text-term-prompt cursor-pointer transition-colors disabled:cursor-wait"
    >
      {busy ? "membuka…" : "buka →"}
    </button>
  );
}
