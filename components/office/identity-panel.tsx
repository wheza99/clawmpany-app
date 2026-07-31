"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { TermBlock } from "@/components/terminal/primitives";
import { cn } from "@/lib/utils";

/**
 * Identitas karyawan: nama, kontrak kerja (PROFILE.md), cara membawa diri
 * (SOUL.md), kapabilitas (AGENTS.md) — dan pintu keluar.
 *
 * Penyunting ini ada karena mencegah kursi kosong saja tidak cukup. Instance
 * ini sudah telanjur berisi puluhan agent yang direkrut lewat alur lama dan
 * tidak pernah diberi identitas; tanpa cara memperbaikinya, satu-satunya jalan
 * adalah memecat lalu merekrut ulang dari nol — dan orang tidak akan melakukan
 * itu, mereka akan membiarkannya.
 *
 * TIDAK ADA kolom "deskripsi" tersendiri, dan itu disengaja. `description`
 * milik agent di QwenPaw adalah hasil BACAAN berkas-berkas ini, bukan field
 * yang bisa ditulis (`PUT /api/agents/{id}` hanya menerima nama). Menyediakan
 * kolomnya akan menjanjikan sesuatu yang tidak akan pernah tersimpan —
 * mengubah PROFILE.md di bawah inilah yang benar-benar mengubah deskripsinya.
 */
export function IdentityPanel({
  agentId,
  name,
  profile,
  soul,
  agents,
  configured,
  defaultOpen,
  onFired,
}: {
  agentId: string;
  name: string;
  profile: string;
  soul: string;
  agents: string;
  configured: boolean;
  /** Dialog manajemen membukanya langsung — di sana tidak ada apa pun lain. */
  defaultOpen?: boolean;
  /** Dipanggil sesaat sebelum pindah halaman, supaya dialog bisa menutup diri. */
  onFired?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen || !configured);
  const [draftName, setDraftName] = useState(name);
  const [draftProfile, setDraftProfile] = useState(profile);
  const [draftSoul, setDraftSoul] = useState(soul);
  const [draftAgents, setDraftAgents] = useState(agents);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [firing, setFiring] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const base = `/api/agents/${encodeURIComponent(agentId)}`;
  const dirty =
    draftName !== name ||
    draftProfile !== profile ||
    draftSoul !== soul ||
    draftAgents !== agents;

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
          agents: draftAgents !== agents ? draftAgents : undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Failed (${res.status}).`);
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
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
      if (!res.ok) throw new Error(data.error || `Failed (${res.status}).`);
      // Dialog ditutup DULU: kalau tidak, ia tetap menutupi layar sementara
      // halaman di belakangnya sudah pindah ke kantor.
      onFired?.();
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fire.");
      setBusy(false);
    }
  }

  return (
    <TermBlock
      label={configured ? "identity" : "identity — not filled in"}
      tone={configured ? "default" : "warn"}
    >
      {!configured ? (
        <p className="text-term-warn mb-2 text-xs">
          This employee has no identity yet, so they will not do any
          pun. Isi di bawah.
        </p>
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-term-dim hover:text-term-prompt cursor-pointer text-xs transition-colors"
        >
          Edit identity, rename, or fire →
        </button>
      ) : (
        <div className="space-y-3">
          <Field label="Name">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="border-border focus:border-term-prompt w-full border bg-transparent px-2 py-1 text-sm outline-none"
            />
          </Field>

          <Field label="Job contract — what they do, and how they report">
            <textarea
              value={draftProfile}
              onChange={(e) => setDraftProfile(e.target.value)}
              rows={12}
              className="border-border focus:border-term-prompt w-full resize-y border bg-transparent px-2 py-1 font-mono text-[11px] outline-none"
            />
          </Field>

          <Field label="How they carry themselves — tone and limits">
            <textarea
              value={draftSoul}
              onChange={(e) => setDraftSoul(e.target.value)}
              rows={8}
              className="border-border focus:border-term-prompt w-full resize-y border bg-transparent px-2 py-1 font-mono text-[11px] outline-none"
            />
          </Field>

          <Field label="Capabilities — working rules that always apply">
            <textarea
              value={draftAgents}
              onChange={(e) => setDraftAgents(e.target.value)}
              rows={8}
              className="border-border focus:border-term-prompt w-full resize-y border bg-transparent px-2 py-1 font-mono text-[11px] outline-none"
            />
            <p className="text-term-dim mt-1 text-[10px]">
              Different from a skill: this is always read, a skill only
              dipanggil saat pemicunya cocok.
            </p>
          </Field>

          {error ? <p className="text-term-warn text-xs">{error}</p> : null}
          {saved && !dirty ? (
            <p className="text-term-prompt text-xs">
              Saved. It takes effect from their next working session.
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
              {busy ? "Saving…" : "Save"}
            </button>
            {/* Di dialog manajemen penyunting ini SATU-SATUNYA isi tabnya, jadi
                menciutkannya cuma menyisakan tautan yang membuka kembali hal
                yang sama. Tombolnya hanya masuk akal di halaman karyawan. */}
            {defaultOpen ? null : (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border-border text-term-dim hover:text-foreground cursor-pointer border px-3 py-1 text-xs transition-colors"
              >
                Tutup
              </button>
            )}

            <button
              type="button"
              onClick={() => setFiring(!firing)}
              className="text-term-dim hover:text-term-warn ml-auto cursor-pointer text-xs transition-colors"
            >
              Fire {draftName || "this employee"}
            </button>
          </div>

          {firing ? (
            <div className="border-term-warn/50 border p-3">
              <p className="text-term-warn text-xs">
                This deletes {name} and every trace of their work in QwenPaw,
                and cannot be undone.
              </p>
              <p className="text-term-dim mt-1.5 text-[11px]">
                Type <span className="text-foreground">{name}</span> to
                confirm.
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
