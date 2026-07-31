"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { TermBlock, TermButton, TermRow } from "@/components/terminal/primitives";
import { BACKBONE_FILES, type BackboneFile, type HireDraft } from "@/lib/hire-draft";
import { findRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * Usulan karyawan, dibuka sebelum dia ada.
 *
 * Kartu ini adalah satu-satunya tempat isi AGENTS.md / PROFILE.md / SOUL.md
 * bisa dibaca SEBELUM agentnya hidup. Karena itu ketiganya ditampilkan apa
 * adanya — teks yang akan ditulis, bukan ringkasannya. Ringkasan akan membuat
 * layar ini lebih enak dipandang dan sekaligus membatalkan gunanya: yang
 * dikonfirmasi orang adalah perilaku karyawannya, dan perilaku itu tinggal di
 * kalimat-kalimat yang diringkas hilang.
 *
 * Dilipat, bukan digelar, karena tiga file penuh sekaligus adalah dinding teks
 * yang orang gulir lewati — dan konfirmasi yang digulir lewati sama saja
 * dengan tidak ada konfirmasi.
 */
export function HireDraftCard({
  draft,
  onCancel,
  onHired,
  label = "Usulan karyawan",
}: {
  draft: HireDraft;
  /** Kalau ada, tombol Batal muncul. */
  onCancel?: () => void;
  onHired?: (agentId: string) => void;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hired, setHired] = useState<{ agentId: string; warning: string | null } | null>(
    null,
  );

  const role = findRole(draft.roleKey);
  const schedule = role?.suggestedSchedule?.label ?? "belum ada — atur setelah direkrut";

  function toggle(key: string) {
    setOpen((current) => (current === key ? null : key));
  }

  async function hire() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Yang dikirim adalah usulan yang barusan dibaca, bukan kunci jabatan
        // yang nanti disusun ulang di server. Kalau server menyusun sendiri,
        // yang disetujui dan yang ditulis bisa berbeda tanpa ada yang tahu.
        body: JSON.stringify(draft),
      });
      const data = (await res.json()) as {
        error?: string;
        agentId?: string;
        scheduleWarning?: string | null;
      };
      if (!res.ok || !data.agentId) {
        throw new Error(data.error || `Gagal merekrut (${res.status}).`);
      }
      setHired({ agentId: data.agentId, warning: data.scheduleWarning ?? null });
      onHired?.(data.agentId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal merekrut.");
    } finally {
      setBusy(false);
    }
  }

  if (hired) {
    return (
      <TermBlock label="Direkrut" className="my-2">
        <p className="text-sm">
          {draft.name} sudah masuk kantor dan langsung memakai identitas yang
          barusan kamu setujui.
        </p>
        {hired.warning ? (
          <p className="text-term-warn mt-1.5 text-xs">
            Jadwal kerja pertamanya gagal dipasang: {hired.warning} — pasang dari
            halaman {draft.name}.
          </p>
        ) : null}
        <Link
          href={`/agent/${encodeURIComponent(hired.agentId)}`}
          className="text-term-prompt mt-2 inline-block text-xs hover:underline"
        >
          Buka halaman {draft.name} →
        </Link>
      </TermBlock>
    );
  }

  return (
    <TermBlock label={label} className="my-2">
      <div className="space-y-0.5">
        <TermRow label="nama">{draft.name}</TermRow>
        <TermRow label="jabatan">{role?.title ?? draft.roleKey}</TermRow>
        <TermRow label="jadwal">{schedule}</TermRow>
      </div>

      <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
        {draft.description}
      </p>

      <div className="border-term-rule divide-term-rule mt-3 divide-y border-t">
        {BACKBONE_FILES.map((file) => (
          <FileFold
            key={file}
            file={file}
            body={draft.files[file]}
            open={open === file}
            onToggle={() => toggle(file)}
          />
        ))}
        <Fold
          title="json mentah"
          hint="bentuk yang dikirim ke server"
          open={open === "json"}
          onToggle={() => toggle("json")}
        >
          <Source text={JSON.stringify(draft, null, 2)} />
        </Fold>
      </div>

      {error ? <p className="text-term-warn mt-2 text-xs">{error}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TermButton variant="primary" onClick={hire} disabled={busy}>
          {busy ? "Merekrut…" : `Rekrut ${draft.name}`}
        </TermButton>
        {onCancel ? (
          <TermButton onClick={onCancel} disabled={busy}>
            Batal
          </TermButton>
        ) : null}
        <span className="text-term-dim text-[11px]">
          Belum ada yang dibuat sampai kamu menekan Rekrut.
        </span>
      </div>
    </TermBlock>
  );
}

/** Satu file tulang punggung + kalimat kenapa file itu ada. */
function FileFold({
  file,
  body,
  open,
  onToggle,
}: {
  file: BackboneFile;
  body: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Fold title={file} hint={FILE_HINT[file]} open={open} onToggle={onToggle}>
      <Source text={body} />
    </Fold>
  );
}

const FILE_HINT: Record<BackboneFile, string> = {
  "AGENTS.md": "apa yang dia kerjakan, dan urutannya tiap sesi",
  "PROFILE.md": "siapa dirinya dan cara dia melapor",
  "SOUL.md": "cara dia membawa diri",
};

function Fold({
  title,
  hint,
  open,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full cursor-pointer items-baseline gap-1.5 text-left"
      >
        <span
          aria-hidden="true"
          className={cn("term-gutter", open ? "text-term-prompt" : "text-term-dim")}
        >
          {open ? "▾" : "▸"}
        </span>
        <span className="group-hover:text-term-prompt text-xs transition-colors">
          {title}
        </span>
        <span className="text-term-dim truncate text-[11px]">— {hint}</span>
      </button>
      {open ? (
        <div className="animate-fade-in mt-1.5 ml-[1.25em]">{children}</div>
      ) : null}
    </div>
  );
}

function Source({ text }: { text: string }) {
  return (
    <pre className="border-term-rule bg-muted/40 max-h-72 overflow-auto border p-2.5 text-[11px] leading-relaxed whitespace-pre-wrap">
      {text}
    </pre>
  );
}
