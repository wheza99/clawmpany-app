"use client";

import { useCallback, useEffect, useState } from "react";

import { TermBlock } from "@/components/terminal/primitives";
import { cn } from "@/lib/utils";

/**
 * Keahlian satu karyawan.
 *
 * Bedanya dengan identitas: PROFILE.md selalu dibaca, keahlian hanya dipanggil
 * saat situasinya cocok. Karena itu kolom yang paling menentukan di sini bukan
 * langkah-langkahnya melainkan **kapan dipakai** — itulah yang dibaca agent
 * untuk memutuskan apakah keahlian ini relevan. Keahlian dengan langkah bagus
 * tapi pemicu kabur tidak akan pernah terpanggil, dan pemiliknya akan
 * menyimpulkan fiturnya rusak.
 */

interface Skill {
  name: string;
  description: string;
  emoji: string;
  enabled: boolean;
  /** Isi SKILL.md TANPA frontmatter — server yang merakit ulang bagian itu. */
  content: string;
  lastUpdated: string | null;
}

interface Draft {
  name: string;
  emoji: string;
  description: string;
  content: string;
}

const EMPTY_DRAFT: Draft = { name: "", emoji: "", description: "", content: "" };

export function SkillsPanel({
  agentId,
  initialSkills,
}: {
  agentId: string;
  /**
   * Dari server component bila ada. Kosong (undefined) berarti panel ini
   * dipasang di tempat yang tidak bisa memuat lebih dulu — dialog manajemen —
   * jadi ia memuat sendiri.
   */
  initialSkills?: Skill[];
}) {
  const selfLoad = initialSkills === undefined;

  const [skills, setSkills] = useState<Skill[]>(initialSkills ?? []);
  const [loading, setLoading] = useState(selfLoad);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const base = `/api/agents/${encodeURIComponent(agentId)}/skills`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(base);
      const data = (await res.json()) as { skills?: Skill[]; error?: string };
      if (!res.ok) throw new Error(data.error || `Gagal memuat (${res.status}).`);
      setSkills(data.skills ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat keahlian.");
    } finally {
      // Dimatikan di sini, bukan di effect: pemuatan pertama dan tiap muat
      // ulang sesudah aksi lewat jalur yang sama, jadi keterangan "Membaca…"
      // tidak punya cara untuk tertinggal menyala.
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    if (!selfLoad) return;
    void (async () => {
      await load();
    })();
  }, [selfLoad, load]);

  async function act(label: string, run: () => Promise<Response>) {
    setBusy(label);
    setError(null);
    try {
      const res = await run();
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Gagal (${res.status}).`);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  function startEdit(skill: Skill) {
    setAdding(false);
    setEditing(skill.name);
    setDraft({
      name: skill.name,
      emoji: skill.emoji,
      description: skill.description,
      content: skill.content,
    });
  }

  function startAdd() {
    setEditing(null);
    setAdding(true);
    setDraft(EMPTY_DRAFT);
  }

  async function save() {
    // `sourceName` adalah nama sebelum disunting. Ia dikirim terpisah supaya
    // ganti nama tetap menjadi satu berkas yang sama — tanpa ini, mengubah nama
    // meninggalkan keahlian lama yang isinya kembar dan ikut terpanggil.
    const source = editing;
    const ok = await act(source ? `save:${source}` : "create", () =>
      source
        ? fetch(base, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceName: source,
              name: draft.name,
              description: draft.description,
              emoji: draft.emoji,
              body: draft.content,
            }),
          })
        : fetch(base, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: draft.name,
              description: draft.description,
              emoji: draft.emoji,
              body: draft.content,
            }),
          }),
    );
    if (ok) {
      setEditing(null);
      setAdding(false);
    }
  }

  const active = skills.filter((s) => s.enabled).length;

  return (
    <TermBlock
      label={`Keahlian · ${active}/${skills.length}`}
      tone={skills.length ? "default" : "dim"}
    >
      {error ? <p className="text-term-warn mb-2 text-xs">{error}</p> : null}

      {loading ? (
        <p className="text-term-dim text-xs">Membaca keahlian…</p>
      ) : skills.length === 0 ? (
        <p className="text-term-dim mb-3 text-xs">
          Belum ada. Keahlian adalah prosedur yang dia panggil sendiri saat
          situasinya cocok — tanpa itu, tiap pekerjaan berulang harus kamu
          jelaskan ulang dari awal.
        </p>
      ) : (
        <ul className="divide-border mb-3 divide-y">
          {skills.map((s) => (
            <li key={s.name} className="py-2 first:pt-0">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className={s.enabled ? "" : "text-term-dim line-through"}>
                  {s.emoji ? `${s.emoji} ` : ""}
                  {s.name}
                </span>
                <span className="ml-auto text-[11px]">
                  {s.enabled ? (
                    <span className="text-term-prompt">menyala</span>
                  ) : (
                    <span className="text-term-dim">mati</span>
                  )}
                </span>
              </div>

              <p className="text-term-dim mt-0.5 text-[11px]">
                {s.description || "Tanpa pemicu — dia tidak akan tahu kapan memakainya."}
              </p>

              {editing === s.name ? (
                <Editor
                  draft={draft}
                  setDraft={setDraft}
                  busy={busy === `save:${s.name}`}
                  onSave={save}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <Mini onClick={() => startEdit(s)}>Ubah</Mini>
                  <Mini
                    busy={busy === `toggle:${s.name}`}
                    onClick={() =>
                      act(`toggle:${s.name}`, () =>
                        fetch(base, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ name: s.name, enabled: !s.enabled }),
                        }),
                      )
                    }
                  >
                    {s.enabled ? "Matikan" : "Nyalakan"}
                  </Mini>
                  <Mini
                    tone="warn"
                    busy={busy === `del:${s.name}`}
                    onClick={() =>
                      act(`del:${s.name}`, () =>
                        fetch(`${base}?name=${encodeURIComponent(s.name)}`, {
                          method: "DELETE",
                        }),
                      )
                    }
                  >
                    Hapus
                  </Mini>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="border-term-rule border-l pl-3">
          <p className="text-term-dim mb-2 text-[10px] tracking-[0.16em] uppercase">
            Keahlian baru
          </p>
          <Editor
            draft={draft}
            setDraft={setDraft}
            busy={busy === "create"}
            onSave={save}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : loading ? null : (
        <Mini onClick={startAdd}>+ Tambah keahlian</Mini>
      )}
    </TermBlock>
  );
}

// ── Penyunting ──────────────────────────────────────────────────

function Editor({
  draft,
  setDraft,
  busy,
  onSave,
  onCancel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <Field label="Nama" className="flex-1">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="mis. laporan-penjualan"
            className="border-border focus:border-term-prompt w-full border bg-transparent px-2 py-1 text-sm outline-none"
          />
        </Field>
        <Field label="Ikon" className="w-16">
          <input
            value={draft.emoji}
            onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
            placeholder="📊"
            className="border-border focus:border-term-prompt w-full border bg-transparent px-2 py-1 text-center text-sm outline-none"
          />
        </Field>
      </div>

      <Field label="Kapan dipakai — ini pemicunya">
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          rows={2}
          placeholder="Dipakai saat menyusun laporan penjualan bulanan, atau saat diminta membandingkan omzet antar bulan."
          className="border-border focus:border-term-prompt w-full resize-y border bg-transparent px-2 py-1 text-sm outline-none"
        />
        <p className="text-term-dim mt-1 text-[10px]">
          Kalimat inilah yang dia baca untuk memutuskan memanggil keahlian ini.
          Sebutkan situasinya, bukan cuma topiknya.
        </p>
      </Field>

      <Field label="Langkah-langkahnya">
        <textarea
          value={draft.content}
          onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          rows={10}
          placeholder={"## Langkah\n\n1. Ambil data penjualan bulan berjalan.\n2. Bandingkan dengan bulan lalu.\n3. Tulis tiga angka yang paling berubah, beserta dugaan sebabnya."}
          className="border-border focus:border-term-prompt w-full resize-y border bg-transparent px-2 py-1 font-mono text-[11px] outline-none"
        />
      </Field>

      <div className="flex gap-2">
        <Mini busy={busy} onClick={onSave}>
          Simpan
        </Mini>
        <Mini tone="warn" onClick={onCancel}>
          Batal
        </Mini>
      </div>
    </div>
  );
}

// ── Bagian kecil ────────────────────────────────────────────────

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="text-term-dim text-[10px] tracking-[0.16em] uppercase">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Mini({
  children,
  onClick,
  busy,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  tone?: "default" | "warn";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "cursor-pointer border px-2 py-0.5 text-[11px] transition-colors",
        tone === "warn"
          ? "border-border text-term-dim hover:border-term-warn hover:text-term-warn"
          : "border-border hover:border-term-prompt hover:text-term-prompt",
        busy && "cursor-wait opacity-60",
      )}
    >
      {busy ? "…" : children}
    </button>
  );
}
