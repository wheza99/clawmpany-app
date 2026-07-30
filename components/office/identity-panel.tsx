"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { TermBlock } from "@/components/terminal/primitives";
import { cn } from "@/lib/utils";

/**
 * Identitas karyawan: nama, kontrak kerja (PROFILE.md), cara membawa diri
 * (SOUL.md) — dan pintu keluar.
 *
 * Penyunting ini ada karena mencegah kursi kosong saja tidak cukup. Instance
 * ini sudah telanjur berisi puluhan agent yang direkrut lewat alur lama dan
 * tidak pernah diberi identitas; tanpa cara memperbaikinya, satu-satunya jalan
 * adalah memecat lalu merekrut ulang dari nol — dan orang tidak akan melakukan
 * itu, mereka akan membiarkannya.
 */
export function IdentityPanel({
  agentId,
  name,
  profile,
  soul,
  configured,
}: {
  agentId: string;
  name: string;
  profile: string;
  soul: string;
  configured: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!configured);
  const [draftName, setDraftName] = useState(name);
  const [draftProfile, setDraftProfile] = useState(profile);
  const [draftSoul, setDraftSoul] = useState(soul);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [firing, setFiring] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const base = `/api/agents/${encodeURIComponent(agentId)}`;
  const dirty =
    draftName !== name || draftProfile !== profile || draftSoul !== soul;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName !== name ? draftName : undefined,
          profile: draftProfile !== profile ? draftProfile : undefined,
          soul: draftSoul !== soul ? draftSoul : undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Gagal (${res.status}).`);
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function fire() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${base}?confirm=${encodeURIComponent(confirmName.trim())}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Gagal (${res.status}).`);
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memecat.");
      setBusy(false);
    }
  }

  return (
    <TermBlock
      label={configured ? "Identitas" : "Identitas — belum diisi"}
      tone={configured ? "default" : "warn"}
    >
      {!configured ? (
        <p className="text-term-warn mb-2 text-xs">
          Karyawan ini belum punya identitas, jadi dia tidak akan mengerjakan apa
          pun. Isi di bawah.
        </p>
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-term-dim hover:text-term-prompt cursor-pointer text-xs transition-colors"
        >
          Ubah identitas, ganti nama, atau pecat →
        </button>
      ) : (
        <div className="space-y-3">
          <Field label="Nama">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="border-border focus:border-term-prompt w-full border bg-transparent px-2 py-1 text-sm outline-none"
            />
          </Field>

          <Field label="Kontrak kerja — dia mengerjakan apa, dan melapor bagaimana">
            <textarea
              value={draftProfile}
              onChange={(e) => setDraftProfile(e.target.value)}
              rows={12}
              className="border-border focus:border-term-prompt w-full resize-y border bg-transparent px-2 py-1 font-mono text-[11px] outline-none"
            />
          </Field>

          <Field label="Cara membawa diri — nada dan batasannya">
            <textarea
              value={draftSoul}
              onChange={(e) => setDraftSoul(e.target.value)}
              rows={8}
              className="border-border focus:border-term-prompt w-full resize-y border bg-transparent px-2 py-1 font-mono text-[11px] outline-none"
            />
          </Field>

          {error ? <p className="text-term-warn text-xs">{error}</p> : null}
          {saved && !dirty ? (
            <p className="text-term-prompt text-xs">
              Tersimpan. Berlaku mulai sesi kerjanya yang berikutnya.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || !dirty}
              className={cn(
                "border-term-prompt text-term-prompt cursor-pointer border px-3 py-1 text-xs transition-colors",
                "hover:bg-term-prompt hover:text-background",
                (busy || !dirty) && "cursor-default opacity-50 hover:bg-transparent hover:text-term-prompt",
              )}
            >
              {busy ? "Menyimpan…" : "Simpan"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="border-border text-term-dim hover:text-foreground cursor-pointer border px-3 py-1 text-xs transition-colors"
            >
              Tutup
            </button>

            <button
              type="button"
              onClick={() => setFiring(!firing)}
              className="text-term-dim hover:text-term-warn ml-auto cursor-pointer text-xs transition-colors"
            >
              Pecat {draftName || "karyawan ini"}
            </button>
          </div>

          {firing ? (
            <div className="border-term-warn/50 border p-3">
              <p className="text-term-warn text-xs">
                Ini menghapus {name} beserta seluruh riwayat kerjanya di QwenPaw,
                dan tidak bisa dibatalkan.
              </p>
              <p className="text-term-dim mt-1.5 text-[11px]">
                Ketik <span className="text-foreground">{name}</span> untuk
                mengonfirmasi.
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={name}
                  className="border-border focus:border-term-warn min-w-0 flex-1 border bg-transparent px-2 py-1 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={fire}
                  disabled={busy || confirmName.trim() !== name}
                  className={cn(
                    "border-term-warn text-term-warn shrink-0 cursor-pointer border px-3 py-1 text-xs transition-colors",
                    (busy || confirmName.trim() !== name) &&
                      "cursor-default opacity-40",
                  )}
                >
                  {busy ? "…" : "Pecat"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
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
