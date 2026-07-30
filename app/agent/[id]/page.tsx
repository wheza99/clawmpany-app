import Link from "next/link";
import { notFound } from "next/navigation";

import { Thread } from "@/components/chat/thread";
import { EquipmentPanel } from "@/components/office/equipment-panel";
import { OfficeHeader } from "@/components/office/header";
import { TermBlock, TermGutter } from "@/components/terminal/primitives";
import { authEnabled, currentOffice } from "@/lib/office";
import {
  listAgents,
  listChats,
  listCronJobs,
  readChat,
  readCronState,
  readWorkspaceFile,
} from "@/lib/qwenpaw";

export const dynamic = "force-dynamic";

/** Berapa sesi terakhir yang isinya benar-benar dibuka. */
const SESSIONS_SHOWN = 4;

/**
 * Drill-down satu karyawan: dari angka di laporan turun ke pekerjaan aslinya.
 *
 * Yang ditampilkan bukan "profil" melainkan BUKTI KERJA — jadwal apa yang dia
 * punya, kapan terakhir jalan, dan apa yang sebenarnya dia tulis. Halaman yang
 * cuma menampilkan konfigurasi tidak menjawab pertanyaan yang membuat orang
 * mengklik namanya: "dia benar-benar mengerjakan sesuatu, tidak?"
 */
export default async function AgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const office = await currentOffice();

  // Gate kepemilikan. Instance QwenPaw dipakai bersama, jadi id yang tidak ada
  // di roster kantor ini diperlakukan seperti halaman yang tidak ada — bukan
  // "akses ditolak", yang justru mengonfirmasi bahwa agentnya eksis.
  if (!office.roster.includes(id)) notFound();

  const [directory, chats, jobs, profile] = await Promise.all([
    listAgents().catch(() => []),
    listChats(id).catch(() => []),
    listCronJobs(id).catch(() => []),
    readWorkspaceFile(id, "PROFILE.md").catch(() => ""),
  ]);

  const agent = directory.find((a) => a.id === id);
  if (!agent) notFound();

  const recent = [...chats]
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    .slice(0, SESSIONS_SHOWN);

  const [sessions, states] = await Promise.all([
    Promise.all(
      recent.map(async (c) => ({
        session: c,
        messages: (await readChat(id, c.id).catch(() => [])).slice(-2),
      })),
    ),
    Promise.all(
      jobs.map(async (job) => ({ job, state: await readCronState(id, job.id).catch(() => null) })),
    ),
  ]);

  return (
    <div className="flex min-h-svh flex-col">
      <OfficeHeader authOn={authEnabled()} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6">
        <div>
          <Link href="/" className="text-term-dim hover:text-term-prompt text-[11px]">
            ← {office.name}
          </Link>
          <h1 className="mt-1 text-lg">{agent.name}</h1>
          <p className="text-term-dim text-xs">
            {agent.active_model?.model ?? "model belum dipilih"}
            {" · "}
            {jobs.filter((j) => j.enabled).length} jadwal aktif
            {" · "}
            {chats.length} sesi seumur hidup
          </p>
        </div>

        <TermBlock label={`Jadwal kerja · ${states.length}`} tone={states.length ? "default" : "dim"}>
          {states.length === 0 ? (
            <p className="text-term-dim text-xs">
              Belum ada. Tanpa jadwal, dia hanya bekerja saat kamu mengetik di
              bawah — dan itu berarti kamu tetap yang jadi mesinnya.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {states.map(({ job, state }) => (
                <li key={job.id} className="py-2 text-sm first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className={job.enabled ? "" : "text-term-dim line-through"}>
                      {job.name}
                    </span>
                    <code className="text-term-dim text-[11px]">
                      {job.schedule?.cron ?? "—"}
                    </code>
                    <span className="ml-auto text-[11px]">
                      {!job.enabled ? (
                        <span className="text-term-dim">mati</span>
                      ) : state?.last_status === "success" ? (
                        <span className="text-term-prompt">ok</span>
                      ) : state?.last_status ? (
                        <span className="text-term-warn">{state.last_status}</span>
                      ) : (
                        <span className="text-term-dim">belum pernah jalan</span>
                      )}
                    </span>
                  </div>
                  {state?.last_error ? (
                    <p className="text-term-warn mt-0.5 text-[11px]">
                      {state.last_error.slice(0, 200)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </TermBlock>

        <EquipmentPanel agentId={id} />

        <TermBlock label="Pekerjaan terakhir">
          {sessions.length === 0 ? (
            <p className="text-term-dim text-xs">Belum ada satu pun sesi kerja.</p>
          ) : (
            <ul className="space-y-3">
              {sessions.map(({ session, messages }) => (
                <li key={session.id}>
                  <div className="flex items-baseline gap-2">
                    <TermGutter marker="▸" className="text-term-prompt" />
                    <span className="text-sm">{session.name || "Tanpa judul"}</span>
                    <span className="text-term-dim ml-auto text-[11px]">
                      {session.updated_at?.slice(0, 16).replace("T", " ") ?? ""}
                    </span>
                  </div>
                  {messages.length === 0 ? (
                    <p className="text-term-dim ml-[1.25em] text-xs">(kosong)</p>
                  ) : (
                    <p className="text-term-dim ml-[1.25em] line-clamp-3 text-xs whitespace-pre-wrap">
                      {messages.at(-1)?.text.slice(0, 400)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </TermBlock>

        {profile ? (
          <TermBlock label="Kontrak kerja (PROFILE.md)" tone="dim">
            <pre className="text-term-dim overflow-x-auto text-[11px] whitespace-pre-wrap">
              {profile.slice(0, 2000)}
            </pre>
          </TermBlock>
        ) : null}

        <TermBlock label={`Bicara dengan ${agent.name}`}>
          <div className="h-[26rem]">
            <Thread
              agentId={id}
              greeting={`Kamu sedang bicara dengan ${agent.name}. Pertanyaan di sini masuk ke sesinya sendiri.`}
            />
          </div>
        </TermBlock>
      </main>
    </div>
  );
}
