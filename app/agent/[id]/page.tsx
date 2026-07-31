import Link from "next/link";
import { notFound } from "next/navigation";

import { Thread } from "@/components/chat/thread";
import { EquipmentPanel } from "@/components/office/equipment-panel";
import { IdentityPanel } from "@/components/office/identity-panel";
import { SchedulePanel } from "@/components/office/schedule-panel";
import { SkillsPanel } from "@/components/office/skills-panel";
import { OfficeHeader } from "@/components/office/header";
import { TermBlock, TermGutter } from "@/components/terminal/primitives";
import { authEnabled, currentOffice, viewerName } from "@/lib/office";
import { offers } from "@/lib/utilities";
import {
  listAgents,
  listChats,
  listCronJobs,
  listMcpServers,
  listSkills,
  looksUnconfigured,
  probeMcpTools,
  readCronState,
  readInstruction,
  readChat,
  readWorkspaceFile,
  skillBody,
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
  const [office, viewer] = await Promise.all([currentOffice(), viewerName()]);

  // Gate kepemilikan. Instance QwenPaw dipakai bersama, jadi id yang tidak ada
  // di roster kantor ini diperlakukan seperti halaman yang tidak ada — bukan
  // "akses ditolak", yang justru mengonfirmasi bahwa agentnya eksis.
  if (!office.roster.includes(id)) notFound();

  const [directory, chats, jobs, profile, soul, agentsFile] = await Promise.all([
    listAgents().catch(() => []),
    listChats(id).catch(() => []),
    listCronJobs(id).catch(() => []),
    readWorkspaceFile(id, "PROFILE.md").catch(() => ""),
    readWorkspaceFile(id, "SOUL.md").catch(() => ""),
    readWorkspaceFile(id, "AGENTS.md").catch(() => ""),
  ]);

  const agent = directory.find((a) => a.id === id);
  if (!agent) notFound();

  const recent = [...chats]
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    .slice(0, SESSIONS_SHOWN);

  // Semua yang ditampilkan panel interaktif diambil DI SINI, bukan lewat
  // effect di browser: satu waterfall lebih sedikit, dan panelnya sudah berisi
  // sejak render pertama. Setelah itu panel memuat ulang sendiri tiap kali
  // penggunanya mengubah sesuatu.
  const [sessions, jobRows, tools, skills] = await Promise.all([
    Promise.all(
      recent.map(async (c) => ({
        session: c,
        messages: (await readChat(id, c.id).catch(() => [])).slice(-2),
      })),
    ),
    Promise.all(
      jobs.map(async (job) => ({
        id: job.id,
        name: job.name,
        enabled: job.enabled,
        cron: job.schedule?.cron ?? null,
        timezone: job.schedule?.timezone ?? null,
        instruction: readInstruction(job),
        state: await readCronState(id, job.id).catch(() => null),
      })),
    ),
    listMcpServers(id).catch(() => []),
    // `content` dikirim tanpa frontmatter — sama seperti yang dikembalikan
    // /api/agents/[id]/skills, supaya panelnya tidak perlu tahu dari jalur mana
    // isinya datang.
    listSkills(id)
      .then((list) => list.map((s) => ({ ...s, content: skillBody(s.content) })))
      .catch(() => []),
  ]);

  // Tes koneksi hanya untuk peralatan yang menyala — yang dimatikan sudah pasti
  // tidak menjawab, jadi menanyakannya cuma menambah detik pada waktu muat.
  const equipment = await Promise.all(
    tools.map(async (t) => ({
      key: t.key,
      name: t.name,
      description: t.description,
      enabled: t.enabled,
      transport: t.transport,
      probe: t.enabled ? await probeMcpTools(id, t.key) : null,
    })),
  );

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

        <SchedulePanel agentId={id} initialJobs={jobRows} />

        <EquipmentPanel
          agentId={id}
          initialInstalled={equipment}
          initialCatalog={offers()}
        />

        <SkillsPanel agentId={id} initialSkills={skills} />

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

        <IdentityPanel
          agentId={id}
          name={agent.name}
          profile={profile}
          soul={soul}
          agents={agentsFile}
          configured={!looksUnconfigured(agent.description || "")}
        />

        {/* Sengaja TANPA `prime`: halaman ini dibuka untuk MEMERIKSA karyawan,
            dan kebanyakan kunjungan berakhir tanpa satu pesan pun. Membuka sesi
            otomatis di sini berarti satu panggilan QwenPaw setiap kali seseorang
            mengklik sebuah nama — biaya yang tidak dibayar oleh apa pun yang
            dibaca di layar. Identitas karyawannya pun sudah ada di PROFILE.md
            miliknya sendiri, jadi tidak ada yang perlu di-brief. */}
        <TermBlock label={`Bicara dengan ${agent.name}`}>
          <div className="h-[26rem]">
            <Thread
              agentId={id}
              agentName={agent.name}
              userName={viewer}
              manageable
              greeting={`Kamu sedang bicara dengan ${agent.name}. Pertanyaan di sini masuk ke sesinya sendiri. Klik fotonya di atas jawaban untuk mengaturnya.`}
            />
          </div>
        </TermBlock>
      </main>
    </div>
  );
}
