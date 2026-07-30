# Keputusan

Catatan berjalan: apa yang dibangun, kenapa, dan apa berikutnya. Yang paling
baru di atas.

---

## 2026-07-31 · Iterasi 1 — laporan jadi layar depan

### Kenapa pivot

Masukan seorang VP startup: cara orang memakai agent sehari-hari menuntut
**kecepatan**, sedangkan alur lama (ClawCity — naik bus, masuk kantor, setup
agent) menaruh **upacara sebelum manfaat**. Pemilik Clawmpany sendiri tidak
memakai produknya karena friction itu.

Tapi diagnosanya bukan "3D-nya terlalu berat". Kotak chat minimalis punya
penyakit yang sama dalam bentuk lain: **halaman kosong**. Cepat berarti
nol-ke-hasil-berguna dalam satu aksi, bukan sedikit elemen di layar.

### Bukti keras yang mengarahkan desain

Pemeriksaan instance QwenPaw produksi (`paw.wheza.id`, 2026-07-31): dari ~62
agent, **sekitar 40 masih memakai deskripsi template bawaan**
(`*(pick something you like)*`) — direkrut lalu tidak pernah diberi identitas,
jadi tidak pernah mengerjakan apa pun. Ada juga nama ganda (`udin`, `Rania`)
yang menandakan orang merekrut ulang karena mengira rekrut pertama gagal.

Itu bukan kemalasan pengguna. Itu alur rekrut yang menyerahkan halaman kosong
tepat di saat orang paling butuh dituntun.

### Keputusan

| Keputusan | Alasan |
|---|---|
| **Layar depan = laporan perusahaan** | Chat menskala ke 1 agent; laporan menskala ke 50. Kalau home screen adalah chat, "rekrut sebanyak apa pun" tidak ada gunanya. |
| **Chat = jalan drill-down, bukan pintu masuk** | Nilainya bukan jawaban, melainkan pekerjaan yang sudah selesai saat kamu tidak melihat. |
| **Urutan laporan: butuh-keputusan → angka → daftar** | Satu-satunya bagian yang menuntut manusia ditaruh paling atas. Kalau tidak ada, pemilik tahu itu dalam satu pandangan lalu menutup halaman. |
| **Satu organisasi Clerk = satu perusahaan = satu kantor** | Pemiliknya menjalankan lima usaha (arsitek, software house, marketing, umrah, terapi). Roster disimpan di `privateMetadata` organisasi — tidak ada database kedua yang harus dijaga sinkron. |
| **Roster selalu eksplisit** | Instance QwenPaw dipakai bersama. Kantor hanya berisi id yang tercatat di roster-nya sendiri, jadi tidak ada jalur yang bisa membocorkan karyawan penyewa lain — termasuk saat login mati. |
| **Rekrut = agent yang sudah jadi** | Memilih jabatan langsung menulis `PROFILE.md` + `SOUL.md` + jadwal kerja pertama. Tidak ada langkah "nanti dikonfigurasi" — langkah itulah yang menghasilkan 40 kursi kosong di atas. |
| **Katalog jabatan, bukan form kosong** | Chief of Staff, CS, Marketing, Sales, Keuangan, Operasional, Engineering, + jabatan sendiri. |
| **MCP = utilitas gedung** | Rekrut agent = memberi dia peralatan. Ini kanal distribusi untuk 100 startup MCP-first. Belum terpasang di iterasi ini. |
| **ClawCity tidak dibuang** | `clawmpany.id` = kota 3D, pintu depan/marketing. `app.clawmpany.id` = tempat kerja. Satu database, dua pintu — `offices`/`agents` memang sudah collection yang sama. |

### Yang dibangun

- `lib/qwenpaw.ts` — klien QwenPaw sisi server. Endpoint diverifikasi langsung
  dengan curl, bukan disalin dari dokumentasi (dokumentasinya meleset).
- `lib/office.ts` — kantor + roster dari metadata organisasi Clerk.
- `lib/report.ts` — perakit laporan: headcount, aktivitas 24 jam, jadwal, dan
  daftar "butuh keputusan kamu".
- `lib/roles.ts` — katalog jabatan + penulis `PROFILE.md`/`SOUL.md`.
- `app/page.tsx` — laporan / kantor kosong / halaman masuk.
- `app/agent/[id]/page.tsx` — drill-down: jadwal, bukti kerja, chat.
- `app/chat/page.tsx` — manajer gedung.
- `app/api/hire` — rekrut: buat agent → tulis identitas → pasang jadwal →
  catat di roster. Gagal menulis identitas membatalkan rekrut, supaya tidak
  ada cangkang kosong yang tercipta lagi.
- Agent **Clawmpany** (`clawmpany` di paw.wheza.id) ditulis ulang jadi
  **manajer gedung**: menyambut, menggali kebutuhan usaha, mengusulkan siapa
  yang direkrut, memastikan ada jadwal dan peralatan, mengurus pindahan.

### Yang perlu diset di Coolify

Tanpa ini app tetap jalan tapi kantor tidak bisa dibuka (dan tidak ada data
yang ditampilkan — bukan halaman error, tapi juga bukan kebocoran):

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — **wajib dicentang sebagai Build Variable**
- `CLERK_SECRET_KEY` — env runtime biasa
- `QWENPAW_CONCIERGE_ID` — opsional, default `clawmpany`

### Berikutnya

1. Peralatan (MCP) per karyawan — pasang/lepas dari halaman agent.
2. Sunting jadwal dari UI (sekarang hanya jadwal bawaan saat rekrut).
3. Pecat / keluarkan dari roster.
4. Laporan lintas-perusahaan untuk pemilik banyak usaha.
5. Isi kantor sungguhan untuk kelima usaha, lalu pakai sehari-hari sebagai uji.
