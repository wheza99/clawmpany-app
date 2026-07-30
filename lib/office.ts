// ────────────────────────────────────────────────────────────────
// lib/office.ts — SERVER ONLY. Siapa yang bekerja di kantor mana.
//
// Satu organisasi Clerk = satu perusahaan = satu kantor. Roster karyawannya
// (daftar id agent QwenPaw) disimpan di `privateMetadata` organisasi itu, jadi
// tidak ada database kedua yang harus dipelihara sinkron dengan Clerk.
//
// ROSTER ITU EKSPLISIT, DAN ITU DISENGAJA. Report tidak pernah menampilkan
// "semua agent di instance" — instance QwenPaw ini dipakai bersama (ada agent
// milik orang lain di sana), jadi mendaftar semuanya akan membocorkan karyawan
// orang. Kantor hanya berisi agent yang id-nya tercatat di roster-nya sendiri.
// ────────────────────────────────────────────────────────────────
import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";

const ROSTER_KEY = "clawmpanyRoster";

/**
 * Clerk hanya menyala kalau KEDUA kunci ada. Tanpa itu app tetap jalan tanpa
 * login — mode solo: kantor kosong dengan manajer gedung saja. Yang TIDAK
 * pernah terjadi adalah app membuka daftar agent orang lain karena login mati.
 */
export function authEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
}

export interface Office {
  /** id organisasi Clerk, atau null untuk akun pribadi / mode solo. */
  orgId: string | null;
  /** Nama perusahaan yang tampil di header report. */
  name: string;
  /** id agent QwenPaw yang bekerja di kantor ini. */
  roster: string[];
  /** Siapa yang sedang melihat. null = belum login. */
  userId: string | null;
  /** Kantor ini bisa ditulis (rekrut/pecat) — butuh login. */
  writable: boolean;
}

const SOLO_OFFICE: Office = {
  orgId: null,
  name: "Clawmpany",
  roster: [],
  userId: null,
  writable: false,
};

function readRoster(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = (metadata as Record<string, unknown>)[ROSTER_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.length > 0);
}

/**
 * Kantor yang sedang dilihat. Organisasi aktif Clerk yang menentukan — jadi
 * berpindah perusahaan adalah satu klik di OrganizationSwitcher, bukan navigasi
 * ke URL lain.
 */
export async function currentOffice(): Promise<Office> {
  if (!authEnabled()) return SOLO_OFFICE;

  const { userId, orgId, orgSlug } = await auth();
  if (!userId) return SOLO_OFFICE;

  // Akun pribadi (belum bikin organisasi): roster menempel ke user, supaya
  // orang bisa merekrut agent pertamanya SEBELUM disuruh bikin perusahaan.
  const client = await clerkClient();
  if (!orgId) {
    const user = await client.users.getUser(userId);
    return {
      orgId: null,
      name: personalName(user.firstName, user.username),
      roster: readRoster(user.privateMetadata),
      userId,
      writable: true,
    };
  }

  const org = await client.organizations.getOrganization({ organizationId: orgId });
  return {
    orgId,
    name: org.name || orgSlug || "Kantor",
    roster: readRoster(org.privateMetadata),
    userId,
    writable: true,
  };
}

function personalName(firstName: string | null, username: string | null): string {
  const who = firstName || username;
  return who ? `Kantor ${who}` : "Kantor Pribadi";
}

/**
 * Semua kantor yang dimiliki orang ini — satu baris per perusahaan.
 *
 * Pemilik lima usaha tidak ingin membuka lima tab untuk tahu ada yang macet
 * atau tidak. Ini yang membuat "satu akun, banyak perusahaan" berguna alih-alih
 * cuma mungkin.
 *
 * Satu panggilan sudah cukup: `membership.organization` membawa objek
 * organisasi lengkap beserta `privateMetadata`, jadi rosternya ikut terbaca
 * tanpa satu request tambahan per perusahaan.
 */
export async function allOffices(): Promise<Office[]> {
  if (!authEnabled()) return [];
  const { userId } = await auth();
  if (!userId) return [];

  const client = await clerkClient();
  const [user, memberships] = await Promise.all([
    client.users.getUser(userId),
    client.users.getOrganizationMembershipList({ userId, limit: 100 }),
  ]);

  const personal: Office = {
    orgId: null,
    name: personalName(user.firstName, user.username),
    roster: readRoster(user.privateMetadata),
    userId,
    writable: true,
  };

  const orgs: Office[] = memberships.data.map((m) => ({
    orgId: m.organization.id,
    name: m.organization.name,
    roster: readRoster(m.organization.privateMetadata),
    userId,
    writable: true,
  }));

  // Akun pribadi hanya ikut tampil kalau benar-benar dipakai. Menampilkannya
  // selalu berarti pemilik lima perusahaan melihat enam baris, dan yang keenam
  // selamanya kosong.
  return personal.roster.length > 0 ? [personal, ...orgs] : orgs;
}

/**
 * Tulis ulang roster. Dipakai saat rekrut & pecat. Membaca-lalu-menulis
 * seluruh array (bukan patch parsial) karena Clerk mengganti metadata per
 * kunci — menulis sebagian akan menghapus sisanya.
 */
export async function saveRoster(office: Office, roster: string[]): Promise<void> {
  if (!office.writable || !office.userId) {
    throw new Error("Kantor ini hanya bisa dibaca — masuk dulu.");
  }
  const unique = [...new Set(roster)];
  const client = await clerkClient();
  if (office.orgId) {
    await client.organizations.updateOrganizationMetadata(office.orgId, {
      privateMetadata: { [ROSTER_KEY]: unique },
    });
  } else {
    await client.users.updateUserMetadata(office.userId, {
      privateMetadata: { [ROSTER_KEY]: unique },
    });
  }
}
