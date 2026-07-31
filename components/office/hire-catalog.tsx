"use client";

import { useState } from "react";

import { HireDraftCard } from "@/components/office/hire-draft-card";
import { TermBlock, TermButton, TermGutter } from "@/components/terminal/primitives";
import { buildDraft, type HireDraft } from "@/lib/hire-draft";
import type { RoleTemplate } from "@/lib/roles";

/**
 * Katalog rekrut.
 *
 * Alur rekrut yang lama menyerahkan form kosong, dan hasilnya terlihat di
 * instance QwenPaw: puluhan agent yang deskripsinya masih placeholder template
 * dan tidak pernah mengerjakan apa pun. Jadi di sini memilih jabatan SUDAH
 * berarti agentnya jadi — ketiga file tulang punggungnya ditulis di saat yang
 * sama, beserta jadwal kerja pertamanya. Tidak ada langkah "nanti
 * dikonfigurasi".
 *
 * Yang ada satu langkah sebelum itu: usulannya ditampilkan lebih dulu, lengkap
 * dengan isi ketiga file. Itu BUKAN kembalinya friction yang dibuang — form
 * kosong menuntut orang mengarang jawaban, sedangkan layar ini menyodorkan
 * jawaban yang sudah jadi dan hanya minta dibaca. Bedanya: yang satu menunda
 * hasil, yang satu menunda penyesalan.
 */
export function HireCatalog({
  roles,
  company,
  compact = false,
}: {
  roles: RoleTemplate[];
  /** Nama perusahaan — ikut tertulis di ketiga file karyawannya. */
  company: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [extra, setExtra] = useState("");
  const [draft, setDraft] = useState<HireDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = roles.find((r) => r.key === open) ?? null;

  function choose(role: RoleTemplate) {
    setOpen(role.key);
    setName(role.suggestedName);
    setExtra("");
    setDraft(null);
    setError(null);
  }

  function close() {
    setOpen(null);
    setDraft(null);
    setError(null);
  }

  /** Susun usulannya. Tidak ada request: perakit yang sama dipakai server. */
  function propose() {
    if (!selected) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give them a name first.");
      return;
    }
    setError(null);
    setDraft(buildDraft({ role: selected, name: trimmed, company, extra }));
  }

  return (
    <TermBlock label={compact ? "hire an employee" : "pick your first employee"}>
      {!compact ? (
        <p className="text-term-dim mb-3 text-xs">
          Pick a role. You see the whole employee first — what they do, how they
          report, and their first schedule — before anything is created.
        </p>
      ) : null}

      <ul className="divide-border divide-y">
        {roles.map((role) => (
          <li key={role.key} className="py-2 first:pt-0 last:pb-0">
            <button
              type="button"
              onClick={() => (open === role.key ? close() : choose(role))}
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
                {draft ? (
                  // Usulan menggantikan formulirnya, bukan menumpuk di bawahnya:
                  // dua kotak isian yang masih terbuka di atas kartu konfirmasi
                  // membuat orang bertanya-tanya yang mana yang berlaku.
                  <HireDraftCard
                    draft={draft}
                    label={`Calon ${role.title}`}
                    onCancel={() => setDraft(null)}
                  />
                ) : (
                  <>
                    <ul className="text-term-dim space-y-0.5 text-xs">
                      {role.duties.map((d) => (
                        <li key={d}>— {d}</li>
                      ))}
                    </ul>

                    {role.suggestedSchedule ? (
                      <p className="text-term-dim mt-2 text-xs">
                        <span className="text-term-prompt">schedule: </span>
                        {role.suggestedSchedule.label}
                      </p>
                    ) : (
                      <p className="text-term-dim mt-2 text-xs">
                        <span className="text-term-warn">schedule: </span>
                        none yet — set it yourself after hiring
                      </p>
                    )}

                    <div className="mt-3 space-y-2">
                      <Field label="What to call them">
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
                          placeholder="Anything specific about your company they need to know."
                          className="border-border focus:border-term-prompt w-full resize-none border bg-transparent px-2 py-1 text-sm outline-none"
                        />
                      </Field>
                    </div>

                    {error ? (
                      <p className="text-term-warn mt-2 text-xs">{error}</p>
                    ) : null}

                    <div className="mt-3">
                      <TermButton variant="primary" onClick={propose}>
                        Review {name.trim() || "the candidate"} first
                      </TermButton>
                    </div>
                  </>
                )}
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
