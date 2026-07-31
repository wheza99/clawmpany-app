"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AgentAvatar } from "@/components/office/agent-avatar";
import { EquipmentPanel } from "@/components/office/equipment-panel";
import { IdentityPanel } from "@/components/office/identity-panel";
import { SchedulePanel } from "@/components/office/schedule-panel";
import { SkillsPanel } from "@/components/office/skills-panel";
import { cn } from "@/lib/utils";

/**
 * Dialog manajemen satu karyawan — dibuka dengan mengklik fotonya di percakapan.
 *
 * KENAPA DIALOG, PADAHAL SUDAH ADA /agent/[id]. Karena keduanya menjawab
 * pertanyaan yang berbeda. Halaman karyawan adalah tempat MEMBACA hasil kerja;
 * dialog ini muncul di saat orang justru sedang membaca jawaban dan berpikir
 * "nadanya terlalu kaku" atau "dia harusnya punya akses WhatsApp". Menyuruh
 * mereka meninggalkan percakapan untuk memperbaikinya berarti kehilangan
 * konteks yang memicu perbaikan itu — dan bersamanya, perbaikannya.
 *
 * Isinya ditiru dari ClawCity `src/agents/setup-dialog.ts` (empat tab: profil,
 * kepribadian, keahlian, peralatan), digabung dengan `schedule-dialog.ts`
 * sehingga jadwal ikut satu pintu. Bedanya, di sini tiap tab dipetakan ke
 * panel yang SUDAH dipakai halaman karyawan, bukan ditulis ulang: satu
 * penyunting per hal, dua tempat memasangnya.
 */

const TABS = [
  { key: "identity", label: "Identity" },
  { key: "skills", label: "Skills" },
  { key: "equipment", label: "Equipment" },
  { key: "schedule", label: "Schedule" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface Identity {
  name: string;
  model: string | null;
  profile: string;
  soul: string;
  agents: string;
  configured: boolean;
}

export function AgentDialog({
  agentId,
  agentName,
  onClose,
}: {
  agentId: string;
  /** Nama yang sudah diketahui pemanggil — dipakai sampai muatan asli tiba. */
  agentName: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<TabKey>("identity");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `showModal()` (bukan atribut `open`) yang memberi perangkap fokus dan latar
  // yang tidak bisa diklik — tanpa satu pun baris untuk mengurusnya.
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  // Identitas dimuat sekali saat dialog dibuka; tab lain memuat sendiri saat
  // dipilih. Dialog ini dipasang ulang tiap kali dibuka (lihat pemanggilnya),
  // jadi tidak ada isi basi yang bertahan antar pembukaan — dan itu memang yang
  // dicari orang saat membukanya: memastikan perubahannya benar-benar mendarat.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}`);
        const data = (await res.json()) as Identity & { error?: string };
        if (!alive) return;
        if (!res.ok) throw new Error(data.error || `Failed (${res.status}).`);
        setIdentity(data);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not read this employee.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [agentId]);

  /**
   * Satu-satunya jalan keluar, dipanggil ✕ / latar / Esc.
   *
   * Ia memberi tahu PEMANGGIL, bukan menutup elemennya sendiri. Yang menutup
   * dialog ini adalah hilangnya ia dari pohon React — pemanggil memasangnya
   * hanya selama `managing` true.
   *
   * SENGAJA tidak lewat `el.close()` + event `close` bawaan, walau itu terlihat
   * lebih rapi. Terverifikasi di Chrome: event itu tidak sampai ke React di
   * sini — baik lewat prop `onClose` maupun addEventListener — sehingga state
   * pemanggil tidak pernah kembali false. Akibatnya bukan kosmetik: elemennya
   * tersembunyi tapi tetap terpasang, dan mengklik fotonya lagi TIDAK membuka
   * apa-apa sampai halamannya dimuat ulang.
   */
  const close = useCallback(() => onClose(), [onClose]);

  const name = identity?.name ?? agentName;

  return (
    <dialog
      ref={ref}
      // Klik pada latar mendarat di elemen <dialog> itu sendiri — isinya ada di
      // dalam <div>, jadi perbandingan target inilah yang membedakan "klik di
      // luar" dari "klik di dalam".
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      // Esc ditangani sendiri, bukan dibiarkan ke perilaku bawaan <dialog>:
      // bawaannya cuma menyembunyikan elemen tanpa memberi tahu React, yang
      // meninggalkan persis keadaan buntu yang dijelaskan di `close` di atas.
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      }}
      aria-label={`Manage ${name}`}
      className={cn(
        "bg-background text-foreground border-border m-auto border p-0",
        "max-h-[86svh] w-[min(46rem,94vw)] overflow-hidden",
      )}
    >
      <div className="flex max-h-[86svh] flex-col">
        <header className="border-border flex items-center gap-2 border-b px-3 py-2">
          <AgentAvatar name={name} />
          <div className="min-w-0">
            <p className="truncate text-sm">{name}</p>
            {/* "memuat…" hanya sah selama benar-benar memuat. Dibiarkan
                sebagai jatuhan untuk `model`, ia akan berkedip selamanya pada
                karyawan yang gagal dibaca — atau yang belum memilih model. */}
            <p className="text-term-dim truncate text-[11px]">
              {identity
                ? (identity.model ?? "no model chosen")
                : error
                  ? "could not be read"
                  : "loading…"}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="text-term-dim hover:text-term-warn ml-auto cursor-pointer px-1 text-sm transition-colors"
          >
            ✕
          </button>
        </header>

        <nav className="border-border flex gap-1 border-b px-2 py-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn(
                "cursor-pointer border px-2 py-0.5 text-[11px] transition-colors",
                tab === t.key
                  ? "border-term-prompt text-term-prompt"
                  : "border-transparent text-term-dim hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {/* Kegagalan di bawah ini milik pemuatan IDENTITAS, jadi ia hanya
              tampil di tabnya. Ditampilkan di semua tab, ia menempel di atas
              panel yang memuat sendiri dengan baik — dan menuduh mereka gagal
              atas sesuatu yang bahkan tidak mereka minta. */}
          {tab === "identity" ? (
            <>
              {error ? <p className="text-term-warn mb-3 text-xs">{error}</p> : null}
              {identity ? (
                // `key` mengikat penyunting ke muatan ini: kalau nanti dimuat
                // ulang, draft-nya ikut disegarkan alih-alih menahan teks lama.
                <IdentityPanel
                  key={`${agentId}:${identity.name}`}
                  agentId={agentId}
                  name={identity.name}
                  profile={identity.profile}
                  soul={identity.soul}
                  agents={identity.agents}
                  configured={identity.configured}
                  defaultOpen
                  onFired={close}
                />
              ) : error ? null : (
                <p className="text-term-dim text-xs">Reading identity…</p>
              )}
            </>
          ) : null}

          {/* Tab yang belum pernah dipilih tidak dipasang, jadi tidak ada
              request untuk hal yang tidak dilihat siapa pun — penting di sini
              karena peralatan menguji koneksi tiap alat yang menyala. */}
          {tab === "skills" ? <SkillsPanel agentId={agentId} /> : null}
          {tab === "equipment" ? <EquipmentPanel agentId={agentId} /> : null}
          {tab === "schedule" ? <SchedulePanel agentId={agentId} /> : null}
        </div>
      </div>
    </dialog>
  );
}
