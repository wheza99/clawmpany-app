"use client";

import { useCallback, useEffect, useState } from "react";

import { TermBlock, TermGutter } from "@/components/terminal/primitives";
import type { UtilityOffer } from "@/lib/utilities";
import { cn } from "@/lib/utils";

/**
 * Peralatan satu karyawan.
 *
 * Yang ditampilkan bukan status konfigurasi melainkan status SAMBUNGAN.
 * Memasang peralatan di QwenPaw tidak pernah menghubungi servernya, jadi
 * "terpasang" dan "berfungsi" adalah dua hal berbeda — dan panel yang
 * menyamakannya akan menunjukkan centang hijau pada peralatan yang sebenarnya
 * mati. Karena itu tiap baris membawa hasil tes koneksi sungguhan.
 */

interface Probe {
  ok: boolean;
  tools: string[];
  message?: string;
}

interface Installed {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  transport: string;
  probe: Probe | null;
}

export function EquipmentPanel({
  agentId,
  initialInstalled,
  initialCatalog,
}: {
  agentId: string;
  /**
   * Kosong (undefined) = panel memuat sendiri. Itu jalur dialog manajemen,
   * yang dibuka dari chat dan karena itu tidak punya server component yang
   * bisa memuat lebih dulu. Pemuatan sendiri di sini terasa (tiap peralatan
   * yang menyala diuji koneksinya sungguhan), jadi barisnya diberi keterangan
   * alih-alih dibiarkan kosong.
   */
  initialInstalled?: Installed[];
  initialCatalog?: UtilityOffer[];
}) {
  // Bila ada, data awal dari server component: satu waterfall lebih sedikit,
  // dan panel sudah berisi sejak render pertama.
  const selfLoad = initialInstalled === undefined;

  const [installed, setInstalled] = useState<Installed[]>(initialInstalled ?? []);
  const [catalog, setCatalog] = useState<UtilityOffer[]>(initialCatalog ?? []);
  const [loading, setLoading] = useState(selfLoad);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const base = `/api/agents/${encodeURIComponent(agentId)}/equipment`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(base);
      const data = (await res.json()) as {
        installed?: Installed[];
        catalog?: UtilityOffer[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `Gagal memuat (${res.status}).`);
      setInstalled(data.installed ?? []);
      setCatalog(data.catalog ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat peralatan.");
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

  async function act(
    label: string,
    run: () => Promise<Response>,
  ): Promise<void> {
    setBusy(label);
    setError(null);
    try {
      const res = await run();
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Gagal (${res.status}).`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setBusy(null);
    }
  }

  const installedKeys = new Set(installed.map((s) => s.key));
  const available = catalog.filter((u) => !installedKeys.has(u.key));

  return (
    <TermBlock label={`Peralatan · ${installed.length}`} tone={installed.length ? "default" : "dim"}>
      {error ? <p className="text-term-warn mb-2 text-xs">{error}</p> : null}

      {loading ? (
        <p className="text-term-dim text-xs">
          Membaca peralatan dan menguji sambungannya…
        </p>
      ) : installed.length === 0 ? (
        <p className="text-term-dim mb-3 text-xs">
          Belum ada. Tanpa peralatan, dia hanya bisa menalar dari apa yang kamu
          ketik — tidak bisa menyentuh data sungguhan.
        </p>
      ) : (
        <ul className="divide-border mb-3 divide-y">
          {installed.map((s) => (
            <li key={s.key} className="py-2 first:pt-0">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className={s.enabled ? "" : "text-term-dim"}>{s.name || s.key}</span>
                <span className="text-term-dim text-[10px] tracking-wider uppercase">
                  {s.transport}
                </span>
                <span className="ml-auto text-[11px]">
                  <ProbeTag enabled={s.enabled} probe={s.probe} />
                </span>
              </div>

              {s.probe?.message ? (
                <p className="text-term-warn mt-0.5 text-[11px]">{s.probe.message}</p>
              ) : null}

              {s.probe?.ok ? (
                <p className="text-term-dim mt-0.5 text-[11px]">
                  {s.probe.tools.length} tool: {s.probe.tools.slice(0, 6).join(", ")}
                  {s.probe.tools.length > 6 ? "…" : ""}
                </p>
              ) : null}

              <div className="mt-1.5 flex gap-2">
                <MiniButton
                  busy={busy === `toggle:${s.key}`}
                  onClick={() =>
                    act(`toggle:${s.key}`, () =>
                      fetch(base, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ key: s.key, enabled: !s.enabled }),
                      }),
                    )
                  }
                >
                  {s.enabled ? "Matikan" : "Nyalakan"}
                </MiniButton>
                <MiniButton
                  tone="warn"
                  busy={busy === `remove:${s.key}`}
                  onClick={() =>
                    act(`remove:${s.key}`, () =>
                      fetch(`${base}?key=${encodeURIComponent(s.key)}`, { method: "DELETE" }),
                    )
                  }
                >
                  Lepas
                </MiniButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 ? (
        <>
          <div className="text-term-dim mb-1.5 text-[10px] tracking-[0.18em] uppercase">
            Tersedia di gedung
          </div>
          <ul className="divide-border divide-y">
            {available.map((u) => (
              <li key={u.key} className="py-2 first:pt-0 last:pb-0">
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === u.key ? null : u.key)}
                  className="group w-full cursor-pointer text-left"
                >
                  <div className="flex items-baseline">
                    <TermGutter
                      marker={expanded === u.key ? "▾" : "▸"}
                      className={u.ready ? "text-term-prompt" : "text-term-dim"}
                    />
                    <span className="group-hover:text-term-prompt text-sm transition-colors">
                      {u.name}
                    </span>
                    {!u.ready ? (
                      <span className="text-term-warn ml-2 text-[10px] tracking-wider uppercase">
                        belum siap
                      </span>
                    ) : null}
                  </div>
                  <div className="text-term-dim flex text-xs">
                    <TermGutter marker="" />
                    <span>{u.summary}</span>
                  </div>
                </button>

                {expanded === u.key ? (
                  <div className="border-term-rule mt-2 ml-[1.25em] border-l pl-3">
                    <ul className="text-term-dim space-y-0.5 text-xs">
                      {u.examples.map((ex) => (
                        <li key={ex}>— {ex}</li>
                      ))}
                    </ul>

                    {u.caution ? (
                      <p className="text-term-warn mt-2 text-[11px]">{u.caution}</p>
                    ) : null}

                    {u.ready ? (
                      <MiniButton
                        className="mt-2"
                        busy={busy === `install:${u.key}`}
                        onClick={() =>
                          act(`install:${u.key}`, () =>
                            fetch(base, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ utilityKey: u.key }),
                            }),
                          )
                        }
                      >
                        Pasang
                      </MiniButton>
                    ) : (
                      <p className="text-term-dim mt-2 text-[11px]">
                        Server belum punya{" "}
                        {u.missing.map((m) => (
                          <code key={m} className="text-term-warn">
                            {m}{" "}
                          </code>
                        ))}
                        — isi dulu di Coolify.
                      </p>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </TermBlock>
  );
}

function ProbeTag({ enabled, probe }: { enabled: boolean; probe: Probe | null }) {
  if (!enabled) return <span className="text-term-dim">dimatikan</span>;
  if (!probe) return <span className="text-term-dim">—</span>;
  if (probe.ok) return <span className="text-term-prompt">tersambung</span>;
  return <span className="text-term-warn">tidak tersambung</span>;
}

function MiniButton({
  children,
  onClick,
  busy,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  tone?: "default" | "warn";
  className?: string;
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
        className,
      )}
    >
      {busy ? "…" : children}
    </button>
  );
}
