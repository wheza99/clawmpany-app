// ────────────────────────────────────────────────────────────────
// lib/directory.ts — SERVER ONLY. Siapa saja yang ada di ruangan.
//
// Satu sumber kebenaran untuk "dengan siapa saja pembicaraan ini boleh
// berpindah": manajer gedung + roster kantor si pemanggil, dan tidak sebutir
// pun agent milik penyewa lain di instance bersama itu.
//
// Dipakai dua tempat yang HARUS sepakat — aturan alih yang dibaca agent
// (lib/prompt.ts) dan daftar yang dilihat pengguna (app/chat/page.tsx). Kalau
// keduanya menyusun daftarnya sendiri-sendiri, agent bisa mengalihkan ke orang
// yang tidak ada di layar.
// ────────────────────────────────────────────────────────────────
import "server-only";

import type { Colleague } from "@/lib/handoff";
import type { Office } from "@/lib/office";
import { CONCIERGE_AGENT_ID, listAgents, looksUnconfigured } from "@/lib/qwenpaw";

/**
 * Manajer gedung + karyawan kantor ini, urut: manajer dulu, lalu karyawan
 * sesuai urutan roster (urutan rekrut).
 *
 * Agent yang tercatat di roster tapi sudah tidak ada di instance DILEWATI —
 * mengalihkan ke sana hanya menghasilkan 404 di tengah percakapan.
 */
export async function officeDirectory(office: Office): Promise<Colleague[]> {
  const agents = await listAgents().catch(() => []);
  const byId = new Map(agents.map((a) => [a.id, a]));

  const boss = byId.get(CONCIERGE_AGENT_ID);
  const out: Colleague[] = [
    {
      id: CONCIERGE_AGENT_ID,
      name: boss?.name || "Clawmpany",
      title: "building manager — hiring, schedules, equipment",
    },
  ];

  for (const id of office.roster) {
    if (id === CONCIERGE_AGENT_ID) continue;
    const agent = byId.get(id);
    if (!agent) continue;
    out.push({ id, name: agent.name || id, title: roleOf(agent) });
  }

  return out;
}

/** Jabatan dari deskripsi QwenPaw — potongan sebelum " | " ditulis manusia. */
export function roleOf(agent: { description: string }): string {
  const head = (agent.description || "").split(" | ")[0].trim();
  if (!head || head.startsWith("- **Name:**") || looksUnconfigured(head)) {
    return "no role yet";
  }
  return head.length > 60 ? `${head.slice(0, 57)}…` : head;
}
