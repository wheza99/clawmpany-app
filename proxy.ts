import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Next 16 mengganti nama konvensi `middleware` jadi `proxy` (perilakunya sama;
 * Proxy kini default ke runtime Node.js). File ini WAJIB ada begitu Clerk
 * dipakai: tanpa `clerkMiddleware()` yang berjalan, `auth()` melempar dan
 * SETIAP halaman jadi 500 — bukan sekadar gagal login.
 *
 * Kegagalan itu tidak terlihat dari `next build` maupun eslint (keduanya hijau
 * tanpa file ini) dan juga tidak terlihat saat kunci Clerk kosong, karena
 * lib/office.ts pulang duluan sebelum menyentuh `auth()`. Ia baru muncul pada
 * kombinasi "kunci terisi + proxy tidak ada" — persis keadaan produksi begitu
 * env-nya diisi. Karena itu file ini dianggap bagian dari konfigurasi Clerk,
 * bukan tambahan opsional.
 *
 * Perlindungan rute TIDAK dilakukan di sini melainkan per-halaman (rekomendasi
 * Clerk v7): lihat lib/office.ts, yang mengembalikan kantor kosong untuk
 * pengunjung anonim, dan gerbang roster di tiap route API.
 */
const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

// Tanpa kunci, clerkMiddleware() akan melempar saat request. Melewatkannya
// menjaga janji yang sama dengan app/layout.tsx: login yang belum dikonfigurasi
// berarti "belum ada kantor yang bisa dibuka", bukan situs yang mati.
export default clerkConfigured ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Lewati internal Next.js dan semua file statis, kecuali bila muncul di
    // search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Selalu jalan untuk route API.
    "/(api|trpc)(.*)",
  ],
};
