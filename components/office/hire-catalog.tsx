"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { TermBlock, TermGutter } from "@/components/terminal/primitives";
import type { RoleTemplate } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * Katalog rekrut.
 *
 * Alur rekrut yang lama menyerahkan form kosong, dan hasilnya terlihat di
 * instance QwenPaw: puluhan agent yang deskripsinya masih placeholder template
 * dan tidak pernah mengerjakan apa pun. Jadi di sini memilih jabatan SUDAH
 * berarti agentnya jadi — PROFILE.md dan SOUL.md ditulis di saat yang sama,
 * beserta jadwal kerja pertamanya. Tidak ada langkah "nanti dikonfigurasi".
 */
export function HireCatalog({
  roles,
  compact = false,
}: {
  roles: RoleTemplate[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = roles.find((r) => r.key === open) ?? null;

  function choose(role: RoleTemplate) {
    setOpen(role.key);
    setName(role.suggestedName);
    setExtra("");
    setError(null);
  }

  async function hire() {
    if (!selected) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Beri dia nama dulu.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleKey: selected.key, name: trimmed, extra }),
      });
      const data = (await res.json()) as { error?: string; agentId?: string };
      if (!res.ok) throw new Error(data.error || `Gagal merekrut (${res.status}).`);
      setOpen(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal merekrut.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TermBlock label={compact ? "Rekrut karyawan" : "Pilih karyawan pertama"}>
      {!compact ? (
        <p className="text-term-dim mb-3 text-xs">
          Pilih satu jabatan. Agentnya langsung jadi — peran, cara melapor, dan
          jadwal kerja pertamanya ikut terpasang, jadi dia bekerja tanpa kamu
          menyetel apa pun lagi.
        </p>
      ) : null}

      <ul className="divide-border divide-y">
        {roles.map((role) => (
          <li key={role.key} className="py-2 first:pt-0 last:pb-0">
            <button
              type="button"
              onClick={() => (open === role.key ? setOpen(null) : choose(role))}
              className="group w-full cursor-pointer text-left"
            >
              <div className="flex items-baseline">
                <TermGutter
                  marker={open === role.key ? "▾" : "▸"}
                  className="text-term-prompt"
                />
                <span className="group-hover:text-term-prompt text-sm transition-colors">
                  {role.title}
                </span>
              </div>
              <div className="text-term-dim flex text-xs">
                <TermGutter marker="" />
                <span>{role.summary}</span>
              </div>
            </button>

            {open === role.key ? (
              <div className="border-term-rule mt-2 ml-[1.25em] border-l pl-3">
                <ul className="text-term-dim space-y-0.5 text-xs">
                  {role.duties.map((d) => (
                    <li key={d}>— {d}</li>
                  ))}
                </ul>

                {role.suggestedSchedule ? (
                  <p className="text-term-dim mt-2 text-xs">
                    <span className="text-term-prompt">jadwal: </span>
                    {role.suggestedSchedule.label}
                  </p>
                ) : (
                  <p className="text-term-dim mt-2 text-xs">
                    <span className="text-term-warn">jadwal: </span>
                    belum ada — atur sendiri setelah direkrut
                  </p>
                )}

                <div className="mt-3 space-y-2">
                  <Field label="Nama panggilan">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="mis. Rina"
                      className="border-border focus:border-term-prompt w-full border bg-transparent px-2 py-1 text-sm outline-none"
                    />
                  </Field>
                  <Field label="Catatan khusus (opsional)">
                    <textarea
                      value={extra}
                      onChange={(e) => setExtra(e.target.value)}
                      rows={2}
                      placeholder="Hal spesifik tentang perusahaanmu yang dia perlu tahu."
                      className="border-border focus:border-term-prompt w-full resize-none border bg-transparent px-2 py-1 text-sm outline-none"
                    />
                  </Field>
                </div>

                {error ? <p className="text-term-warn mt-2 text-xs">{error}</p> : null}

                <button
                  type="button"
                  onClick={hire}
                  disabled={busy}
                  className={cn(
                    "border-term-prompt text-term-prompt mt-3 cursor-pointer border px-3 py-1 text-xs transition-colors",
                    "hover:bg-term-prompt hover:text-background",
                    busy && "cursor-wait opacity-60",
                  )}
                >
                  {busy ? "Merekrut…" : `Rekrut ${name.trim() || "dia"}`}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </TermBlock>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-term-dim text-[10px] tracking-[0.16em] uppercase">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
