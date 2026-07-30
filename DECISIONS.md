# Keputusan

Catatan berjalan: apa yang dibangun, kenapa, dan apa berikutnya. Yang paling
baru di atas.

---

## 2026-07-31 · Iterasi 6 — semua perusahaan dalam satu layar (`/semua`)

### Kenapa

Pemilik lima usaha tidak akan membuka lima tab tiap pagi untuk tahu ada yang
macet — dia akan berhenti membuka semuanya. Tanpa layar ini, "satu akun banyak
perusahaan" cuma mungkin, bukan berguna.

Layar ini menjawab **satu** pertanyaan: perusahaan mana yang butuh saya hari
ini? Detailnya tetap di halaman masing-masing.

### Keputusan

| Keputusan | Alasan |
|---|---|
| **`buildBrief` terpisah, bukan memakai `buildReport`** | Laporan penuh menembak 3 permintaan per karyawan plus 1 per jadwal. Dikali lima perusahaan, layar ringkasan jadi lebih lambat daripada lima halaman yang digantikannya. Brief melewati peralatan sama sekali dan hanya menanyakan status jadwal yang menyala. |
| **Baris diurutkan berdasar kebutuhan perhatian** | `failing×100 + unconfigured×10 + (punya karyawan tapi tak ada yang terjadwal)×5`. Yang macet naik sendiri; tidak perlu dicari. |
| **Akun pribadi hanya tampil kalau dipakai** | Kalau selalu ditampilkan, pemilik lima perusahaan melihat enam baris dan yang keenam selamanya kosong. |
| **Tombol "buka" ada di barisnya sendiri** | Pemilih organisasi di header bisa melakukan hal yang sama, tapi menuntut orang naik ke pojok layar dan mencari nama yang barusan dia baca di tengah halaman. |
| **Satu panggilan Clerk untuk semua roster** | `membership.organization` sudah membawa `privateMetadata`, jadi tidak ada request tambahan per perusahaan. |

### Diverifikasi di browser

`/`, `/chat`, dan `/semua` semuanya 200, tidak ada error server. (Dua error
console yang muncul berasal dari skrip Clerk sendiri, bukan kode ini — sudah
ada sejak sebelum perubahan ini.)

---

## 2026-07-31 · Iterasi 5 — menjalankan app-nya, dan menemukan bug yang mematikan

### Bug: tanpa `proxy.ts`, SETIAP halaman 500 begitu Clerk aktif

Sampai iterasi 4, seluruh pengujian menyasar lapisan QwenPaw — app-nya sendiri
belum pernah dijalankan. Begitu dijalankan lokal (dengan kunci Clerk terisi),
setiap halaman langsung 500:

> Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware()

`auth()` menuntut middleware Clerk berjalan. Tanpanya bukan cuma login yang
gagal — seluruh situs mati.

**Kenapa tidak ketahuan lebih awal.** `next build` hijau, `eslint` hijau, dan
produksi pun tampak sehat — karena di produksi kunci Clerk BELUM diisi, jadi
`lib/office.ts` pulang duluan sebelum menyentuh `auth()`. Bug ini hanya muncul
pada kombinasi **kunci terisi + proxy tidak ada**, yaitu persis keadaan yang
akan terjadi begitu env Coolify diisi. Artinya: memasang env Clerk tanpa
perbaikan ini akan mematikan situs, bukan menghidupkan login.

**Next 16 mengganti nama konvensinya.** `middleware.ts` deprecated dan menjadi
`proxy.ts` (runtime Node.js, `edge` tidak didukung). Pesan error Clerk sendiri
sudah menyebut `proxy.(ts|js)`. Setelah `proxy.ts` dibuat, output build
menampilkan `ƒ Proxy (Middleware)` — itulah bukti ia terpasang.

### Diverifikasi di browser

- Halaman masuk dan `/chat` merender benar.
- `POST /api/chat` ke manajer gedung: 200, SSE mengalir, selesai dengan usage.
- **Gerbang kepemilikan diuji sungguhan.** Sebagai pengunjung anonim:
  `agentId` `archylabs`/`default`/`budi` → **403**; `/equipment` dan
  `/schedule` untuk agent luar roster → **404** (bukan 403, supaya tidak
  mengonfirmasi bahwa agentnya ada). Tidak ada jalur ke penyewa lain di
  instance bersama itu.

### Pelajaran yang dicatat

Build hijau bukan bukti aplikasi hidup. Untuk perubahan yang menyentuh auth,
jalankan app-nya.

---

## 2026-07-31 · Iterasi 4 — identitas bisa diperbaiki, karyawan bisa dipecat

### Kenapa penyunting identitas, bukan cuma tombol pecat

Mencegah kursi kosong (iterasi 1) tidak menolong yang sudah telanjur. Instance
ini berisi ~40 agent yang direkrut lewat alur lama dan tidak pernah diberi
identitas. Tanpa cara memperbaikinya, satu-satunya jalan adalah memecat lalu
merekrut ulang dari nol — dan orang tidak akan melakukan itu, mereka akan
membiarkannya. Maka halaman karyawan yang identitasnya kosong **membuka
penyuntingnya sendiri**, bukan menunggu diklik.

### Diverifikasi di paw.wheza.id

Siklus hidup penuh dijalankan dengan agent sekali pakai: buat → tulis
`PROFILE.md` (deskripsi agent langsung ikut berubah) → ganti nama → hapus.
Keduanya sudah dibersihkan; tidak ada sisa.

**Kekhawatiran yang ternyata tidak terbukti:** respons `PUT /api/agents/{id}`
mengembalikan `language: "zh"` dan `active_model: null` walau agentnya dibuat
dengan `language: "en"` — tampak seperti PUT mengganti seluruh konfigurasi
(seperti PUT cron). Dibandingkan langsung sebelum/sesudah lewat
`GET /api/agents/{id}`: `language`, `active_model`, `approval_level`, dan
`system_prompt_files` semuanya **bertahan**. Respons PUT itu cuma echo yang
tidak lengkap, bukan state tersimpan. Rename aman.

### Keputusan

| Keputusan | Alasan |
|---|---|
| **Pecat butuh nama diketik ulang** | Menghapus workspace agent beserta seluruh riwayat kerjanya, dan tidak bisa dibatalkan. Dialog "yakin?" yang bisa diklik refleks tidak cukup. |
| **Roster dibersihkan SETELAH agent benar-benar hilang** | Urutan sebaliknya bisa meninggalkan agent yatim: tidak ada di kantor mana pun, tapi masih hidup di instance dan tetap menjalankan jadwalnya. |
| **PROFILE.md kosong ditolak saat menyimpan** | Menjaga janji yang dibuat alur rekrut: tidak ada karyawan tanpa identitas. |
| **Penyunting terbuka sendiri kalau identitas kosong** | Layar yang menyembunyikan satu-satunya perbaikan di balik satu klik akan dilewati. |

---

## 2026-07-31 · Iterasi 3 — jadwal yang bisa disunting, dan hasilnya bisa dilihat

### Bug yang ditemukan dan diperbaiki

Payload cron menyetel `timezone: "Asia/Jakarta"`, tapi enam ekspresi cron di
`lib/roles.ts` ditulis dengan offset UTC. Jadi jadwal berlabel "Laporan pagi
(08:00 WIB)" sebenarnya akan jalan **01:00 WIB**. Semua sudah diselaraskan ke
WIB, dan diverifikasi: job dengan `cron: "0 3 * * *"` melaporkan
`next_run_at: 2026-07-31T03:00:00+07:00`.

### Diverifikasi end-to-end di paw.wheza.id

Rantai penuh dijalankan sungguhan dengan payload yang persis dihasilkan kode
ini — buat job → jalankan sekarang → status jadi `success` → temukan sesi lewat
`session_id` → baca pesan → baca riwayat → hapus. Balasan agent kembali utuh.
Job tesnya sudah dihapus.

### Keputusan

| Keputusan | Alasan |
|---|---|
| **Tombol "Jalankan sekarang"** | Tanpa ini, satu-satunya cara tahu instruksi jadwal sudah benar adalah menunggu sampai besok pagi. Orang yang menunggu semalam untuk tahu dia salah ketik tidak akan memasang jadwal kedua. |
| **Pola siap pakai, bukan kotak cron** | Menulis `0 9 * * 1-5` bukan pekerjaan pemilik usaha. Yang dipilih kalimat ("tiap pagi kerja"); cron-nya urusan aplikasi. Kotak cron bebas tetap ada di balik "Pola sendiri…". |
| **Satu perakit payload untuk create DAN update** | `PUT` mengganti job SEUTUHNYA. Update parsial yang cuma mengirim field berubah akan mengosongkan sisanya. |
| **`session_id` dipertahankan saat update** | Kalau di-generate ulang, panel hasil kehilangan seluruh riwayat run sebelumnya — ia menunjuk sesi lain dan tampak seperti jadwal yang belum pernah jalan. |
| **Data awal panel diambil di server, bukan lewat effect** | Selain menyenangkan lint React 19, ini menghapus satu waterfall di browser dan menghilangkan kedipan "Membaca…" untuk data yang sudah tersedia saat halaman dikirim. |
| **"Jalankan sekarang" tidak menunggu selesai** | Satu run bisa makan menit; menahan koneksi selama itu membuat tab tampak menggantung. |

---

## 2026-07-31 · Iterasi 2 — peralatan (MCP) jadi utilitas gedung

### Fakta yang diverifikasi dulu

Sebelum menulis kode, dua hal diuji langsung ke `paw.wheza.id`:

1. **Konfigurasi MCP di QwenPaw itu per-agent, bukan global se-instance.**
   Client yang dibuat dengan `X-Agent-Id: clawmpany` tidak muncul saat didaftar
   dengan `X-Agent-Id: default`. Ini yang membuat "peralatan per karyawan" bisa
   dimodelkan apa adanya — tanpa lapisan pemetaan sendiri. (Daftar kedua agent
   sempat terlihat identik, tapi itu kebetulan: keduanya hanya punya `tavily_search`.)
2. **`PATCH /api/mcp/toggle/{key}` MEMBALIK nilai, tidak menyetel**, dan tidak
   membaca body. Memanggilnya dengan niat "nyalakan" akan mematikan peralatan
   yang sudah menyala. `setMcpEnabled()` membungkusnya jadi set-idempoten.
3. **Memasang MCP tidak pernah menghubungi servernya.** QwenPaw hanya menulis
   konfigurasi, jadi 200 bukan bukti peralatan itu hidup. Satu-satunya tes
   koneksi sungguhan adalah `GET /api/mcp/tools/{key}` — dan tiga hasilnya
   punya arti berbeda: ada tool = tersambung, kosong = dimatikan, 502 = tidak
   terjangkau.

### Keputusan

| Keputusan | Alasan |
|---|---|
| **Panel peralatan menampilkan status SAMBUNGAN, bukan status konfigurasi** | Karena fakta ke-3 di atas. Panel yang menyamakan keduanya akan memberi centang hijau pada peralatan yang sebenarnya mati. |
| **Alamat peralatan dari env, tidak di-hardcode** | Domain tiap instance berbeda dan sebagian belum tetap. Menebak menghasilkan peralatan yang tampak tersedia lalu gagal saat dipasang. |
| **Peralatan yang belum siap tetap TAMPIL** | Ditandai "belum siap" + nama env yang kurang. Menyembunyikannya berarti menyembunyikan bahwa gedung ini punya utilitas itu. |
| **Pasang ditolak 409 kalau env kosong** | Lebih baik daripada diterima lalu gagal diam-diam. |
| **"Bekerja tanpa peralatan" masuk daftar butuh-keputusan** | Bentuk ketiga dari karyawan yang tidak menghasilkan apa-apa, setelah "tanpa identitas" dan "tanpa jadwal". |

### Katalog awal

`washarp_whatsapp` (WhatsApp — produk sendiri), `tavily_web` (pencarian web),
`pabrik_chats` (arsip percakapan — produk sendiri). Dua dari tiga adalah tool
buatan sendiri: inilah bentuk konkret "Clawmpany jadi kanal distribusi 100
startup MCP-first".

### Env baru di Coolify (opsional, per peralatan)

`CLAWMPANY_MCP_WASHARP_URL` / `_TOKEN`, `CLAWMPANY_MCP_TAVILY_KEY`,
`CLAWMPANY_MCP_PABRIK_URL` / `_TOKEN`.

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
