"use client";

import { useCallback, useEffect, useState } from "react";

import { TermBlock, TermGutter } from "@/components/terminal/primitives";
import { cn } from "@/lib/utils";

/**
 * Jadwal kerja satu karyawan.
 *
 * Dua hal di panel ini yang menentukan apakah orang akan benar-benar memasang
 * jadwal kedua:
 *
 *  1. **Pola siap pakai.** Menuliskan `0 9 * * 1-5` bukan pekerjaan pemilik
 *     usaha. Yang dipilih adalah kalimat ("tiap pagi kerja"), cron-nya urusan
 *     kami.
 *  2. **Jalankan sekarang.** Tanpa itu, satu-satunya cara tahu instruksinya
 *     benar adalah menunggu sampai besok pagi — dan orang yang menunggu semalam
 *     untuk tahu dia salah ketik tidak akan mencoba lagi.
 */

/** Semua pola ditafsirkan di Asia/Jakarta — lihat cronPayload di lib/qwenpaw.ts. */
const PRESETS: Array<{ label: string; cron: string }> = [
  { label: "Tiap pagi, 08:00", cron: "0 8 * * *" },
  { label: "Tiap pagi kerja, 09:00 (Sen–Jum)", cron: "0 9 * * 1-5" },
  { label: "Tiap sore kerja, 17:00 (Sen–Jum)", cron: "0 17 * * 1-5" },
  { label: "Tiap Senin pagi, 09:00", cron: "0 9 * * 1" },
  { label: "Tiap Jumat sore, 16:00", cron: "0 16 * * 5" },
  { label: "Tiap awal bulan, 09:00", cron: "0 9 1 * *" },
  { label: "Tiap jam", cron: "0 * * * *" },
];

interface JobState {
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
}

interface Job {
  id: string;
  name: string;
  enabled: boolean;
  cron: string | null;
  timezone: string | null;
  instruction: string;
  state: JobState | null;
}

interface Draft {
  name: string;
  cron: string;
  instruction: string;
}

const EMPTY_DRAFT: Draft = { name: "", cron: PRESETS[1].cron, instruction: "" };

export function SchedulePanel({
  agentId,
  initialJobs,
}: {
  agentId: string;
  initialJobs: Job[];
}) {
  // Data awal datang dari server component, bukan dari effect. Selain
  // menghilangkan satu waterfall di browser, ini juga membuat panel punya isi
  // sejak render pertama — tidak ada kedipan "Membaca…" untuk data yang
  // sebenarnya sudah tersedia saat halaman dikirim.
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [openResult, setOpenResult] = useState<string | null>(null);

  const base = `/api/agents/${encodeURIComponent(agentId)}/schedule`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(base);
      const data = (await res.json()) as { jobs?: Job[]; error?: string };
      if (!res.ok) throw new Error(data.error || `Gagal memuat (${res.status}).`);
      setJobs(data.jobs ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat jadwal.");
    }
  }, [base]);

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

  function startEdit(job: Job) {
    setAdding(false);
    setEditing(job.id);
    setDraft({ name: job.name, cron: job.cron ?? PRESETS[1].cron, instruction: job.instruction });
  }

  function startAdd() {
    setEditing(null);
    setAdding(true);
    setDraft(EMPTY_DRAFT);
  }

  async function save() {
    const ok = await act(editing ? `save:${editing}` : "create", () =>
      editing
        ? fetch(base, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId: editing, ...draft }),
          })
        : fetch(base, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draft),
          }),
    );
    if (ok) {
      setEditing(null);
      setAdding(false);
    }
  }

  return (
    <TermBlock label={`Jadwal kerja · ${jobs.length}`} tone={jobs.length ? "default" : "dim"}>
      {error ? <p className="text-term-warn mb-2 text-xs">{error}</p> : null}

      {jobs.length === 0 ? (
        <p className="text-term-dim mb-3 text-xs">
          Belum ada. Tanpa jadwal, dia hanya bekerja saat kamu mengetik — dan itu
          berarti kamu tetap yang jadi mesinnya.
        </p>
      ) : (
        <ul className="divide-border mb-3 divide-y">
          {jobs.map((job) => (
            <li key={job.id} className="py-2 first:pt-0">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className={job.enabled ? "" : "text-term-dim line-through"}>
                  {job.name}
                </span>
                <span className="ml-auto text-[11px]">
                  <StatusTag enabled={job.enabled} state={job.state} />
                </span>
              </div>

              <div className="text-term-dim mt-0.5 text-[11px]">
                {humanCron(job.cron)}
                {job.state?.next_run_at ? ` · berikutnya ${when(job.state.next_run_at)}` : ""}
                {job.state?.last_run_at
                  ? ` · terakhir ${when(job.state.last_run_at)}`
                  : " · belum pernah jalan"}
              </div>

              {job.state?.last_error ? (
                <p className="text-term-warn mt-0.5 text-[11px]">
                  {job.state.last_error.slice(0, 200)}
                </p>
              ) : null}

              {editing === job.id ? (
                <Editor
                  draft={draft}
                  setDraft={setDraft}
                  busy={busy === `save:${job.id}`}
                  onSave={save}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <Mini
                    busy={busy === `run:${job.id}`}
                    onClick={async () => {
                      await act(`run:${job.id}`, () =>
                        fetch(`${base}/${encodeURIComponent(job.id)}`, { method: "POST" }),
                      );
                      setOpenResult(job.id);
                    }}
                  >
                    Jalankan sekarang
                  </Mini>
                  <Mini
                    onClick={() => setOpenResult(openResult === job.id ? null : job.id)}
                  >
                    {openResult === job.id ? "Tutup hasil" : "Lihat hasil"}
                  </Mini>
                  <Mini onClick={() => startEdit(job)}>Ubah</Mini>
                  <Mini
                    busy={busy === `toggle:${job.id}`}
                    onClick={() =>
                      act(`toggle:${job.id}`, () =>
                        fetch(base, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ jobId: job.id, enabled: !job.enabled }),
                        }),
                      )
                    }
                  >
                    {job.enabled ? "Matikan" : "Nyalakan"}
                  </Mini>
                  <Mini
                    tone="warn"
                    busy={busy === `del:${job.id}`}
                    onClick={() =>
                      act(`del:${job.id}`, () =>
                        fetch(`${base}?jobId=${encodeURIComponent(job.id)}`, {
                          method: "DELETE",
                        }),
                      )
                    }
                  >
                    Hapus
                  </Mini>
                </div>
              )}

              {openResult === job.id ? <JobResult agentId={agentId} jobId={job.id} /> : null}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="border-term-rule border-l pl-3">
          <p className="text-term-dim mb-2 text-[10px] tracking-[0.16em] uppercase">
            Jadwal baru
          </p>
          <Editor
            draft={draft}
            setDraft={setDraft}
            busy={busy === "create"}
            onSave={save}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <Mini onClick={startAdd}>+ Tambah jadwal</Mini>
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
  const known = PRESETS.some((p) => p.cron === draft.cron);

  return (
    <div className="mt-2 space-y-2">
      <Field label="Nama jadwal">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="mis. Laporan pagi"
          className="border-border focus:border-term-prompt w-full border bg-transparent px-2 py-1 text-sm outline-none"
        />
      </Field>

      <Field label="Kapan">
        <select
          value={known ? draft.cron : "__custom"}
          onChange={(e) =>
            setDraft({
              ...draft,
              cron: e.target.value === "__custom" ? draft.cron : e.target.value,
            })
          }
          className="border-border focus:border-term-prompt w-full border bg-transparent px-2 py-1 text-sm outline-none"
        >
          {PRESETS.map((p) => (
            <option key={p.cron} value={p.cron} className="bg-background">
              {p.label}
            </option>
          ))}
          <option value="__custom" className="bg-background">
            Pola sendiri…
          </option>
        </select>
        {!known ? (
          <input
            value={draft.cron}
            onChange={(e) => setDraft({ ...draft, cron: e.target.value })}
            placeholder="0 9 * * 1-5"
            className="border-border focus:border-term-prompt mt-1 w-full border bg-transparent px-2 py-1 font-mono text-sm outline-none"
          />
        ) : null}
        <p className="text-term-dim mt-1 text-[10px]">Waktu Indonesia Barat (WIB).</p>
      </Field>

      <Field label="Instruksi">
        <textarea
          value={draft.instruction}
          onChange={(e) => setDraft({ ...draft, instruction: e.target.value })}
          rows={4}
          placeholder="Apa yang harus dia kerjakan, dan bentuk laporannya seperti apa."
          className="border-border focus:border-term-prompt w-full resize-y border bg-transparent px-2 py-1 text-sm outline-none"
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

// ── Hasil kerja ─────────────────────────────────────────────────

interface Result {
  sessionName: string;
  messages: Array<{ role: string; text: string; timestamp: string | null }>;
  note?: string;
  history: Array<{ run_at: string; status: string; error: string | null }>;
}

function JobResult({ agentId, jobId }: { agentId: string; jobId: string }) {
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/agents/${encodeURIComponent(agentId)}/schedule/${encodeURIComponent(jobId)}`,
        );
        const body = (await res.json()) as Result & { error?: string };
        if (!alive) return;
        if (!res.ok) throw new Error(body.error || `Gagal (${res.status}).`);
        setData(body);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Gagal membaca hasil.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [agentId, jobId]);

  if (error) return <p className="text-term-warn mt-2 text-[11px]">{error}</p>;
  if (!data) return <p className="text-term-dim mt-2 text-[11px]">Membaca hasil…</p>;

  const last = data.messages.filter((m) => m.role === "assistant").at(-1);

  return (
    <div className="border-term-rule mt-2 border-l pl-3">
      {data.note ? <p className="text-term-dim text-[11px]">{data.note}</p> : null}

      {last ? (
        <>
          <p className="text-term-dim text-[10px] tracking-[0.16em] uppercase">
            Hasil terakhir
          </p>
          <pre className="text-foreground mt-1 max-h-64 overflow-y-auto text-[11px] whitespace-pre-wrap">
            {last.text.slice(0, 4000)}
          </pre>
        </>
      ) : null}

      {data.history.length > 0 ? (
        <>
          <p className="text-term-dim mt-2 text-[10px] tracking-[0.16em] uppercase">
            Riwayat
          </p>
          <ul className="mt-1 space-y-0.5">
            {data.history.map((h, i) => (
              <li key={`${h.run_at}-${i}`} className="text-[11px]">
                <TermGutter
                  marker={h.status === "success" ? "·" : "!"}
                  className={h.status === "success" ? "text-term-dim" : "text-term-warn"}
                />
                <span className="text-term-dim">{when(h.run_at)}</span>
                <span className={cn("ml-2", h.status === "success" ? "text-term-prompt" : "text-term-warn")}>
                  {h.status}
                </span>
                {h.error ? <span className="text-term-warn ml-2">{h.error.slice(0, 80)}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

// ── Bagian kecil ────────────────────────────────────────────────

function StatusTag({ enabled, state }: { enabled: boolean; state: JobState | null }) {
  if (!enabled) return <span className="text-term-dim">mati</span>;
  if (!state?.last_status) return <span className="text-term-dim">menunggu</span>;
  if (state.last_status === "success") return <span className="text-term-prompt">ok</span>;
  return <span className="text-term-warn">{state.last_status}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-term-dim text-[10px] tracking-[0.16em] uppercase">{label}</span>
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

/** Cron yang dikenal dibaca sebagai kalimat; sisanya ditampilkan apa adanya. */
function humanCron(cron: string | null): string {
  if (!cron) return "tanpa pola";
  const hit = PRESETS.find((p) => p.cron === cron);
  return hit ? hit.label : cron;
}

function when(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(t));
}
