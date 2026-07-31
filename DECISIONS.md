# Keputusan

Catatan berjalan: apa yang dibangun, kenapa, dan apa berikutnya. Yang paling
baru di atas.

---

## 2026-07-31 · Iterasi 8 — karyawannya dibaca dulu, baru dibuat

### Celah yang ditutup

Sampai iterasi 7, "Rekrut" langsung membuat agent. Cepat — tapi yang dibeli
orang di layar rekrut bukan kecepatan, melainkan karyawan yang perilakunya bisa
dia percaya, dan perilaku itu baru bisa dilihat SETELAH agentnya hidup. Satu-
satunya cara memperbaiki tebakan yang meleset adalah memecat lalu merekrut
ulang, dan itu persis yang tidak akan dilakukan orang (lihat nama ganda `udin`
dan `Rania` di instance produksi).

Sekarang rekrut dua langkah: **usulan** — nama, deskripsi, dan isi ketiga file
tulang punggung apa adanya, dilipat per file — baru **eksekusi**.

Ini bukan kembalinya friction yang dibuang di iterasi 1. Form kosong menuntut
orang mengarang jawaban; layar ini menyodorkan jawaban yang sudah jadi dan
hanya minta dibaca. Yang satu menunda hasil, yang satu menunda penyesalan.

### Bug yang ditemukan: satu dari tiga file selalu template

`createAgent` menyalin template bawaan QwenPaw (`md_files/{lang}/`) ke workspace
agent baru — SOUL.md, PROFILE.md, **dan AGENTS.md**. Alur rekrut lama hanya
menimpa dua yang pertama, jadi tiap karyawan yang pernah direkrut lewat
Clawmpany punya AGENTS.md generik. Itu file yang menjawab "dia harus berbuat apa
begitu sesi dimulai" — yang paling mahal untuk dibiarkan generik. Sekarang
ketiganya ditulis.

Hal yang sama ternyata berlaku untuk **manajer gedungnya sendiri**: AGENTS.md
agent `clawmpany` di paw.wheza.id masih 1.230 karakter template bawaan
berbahasa Mandarin, belum pernah disentuh — sementara PROFILE.md dan SOUL.md-nya
sudah ditulis tangan sejak iterasi 1. Sekarang ditulis (`concierge/manager.md`),
dan sengaja TIDAK mengulang keduanya: peran dan gaya tinggal di sana, yang di
AGENTS.md cuma cara kerja — urutan tiap sesi, apa yang boleh diputuskan sendiri,
apa yang ditanyakan dulu, dan larangan menyebut data kantor penyewa lain.

### Keputusan

| Keputusan | Alasan |
|---|---|
| **Usulan dikirim utuh ke `/api/hire`, bukan `roleKey` yang disusun ulang di server** | Kalau server menyusun sendiri, yang disetujui dan yang ditulis bisa berbeda tanpa ada yang tahu — dan "sudah saya periksa" berhenti berarti apa-apa. |
| **`readDraft()` dipakai browser DAN server** | Usulan dari chat dikarang model bahasa dan lewat browser sebagai teks biasa. Lolos di sana bukan jaminan; satu fungsi dipanggil dua kali lebih murah daripada dua validator yang bisa melenceng. |
| **`lib/hire-draft.ts` bebas-server** | Katalog menyusun usulannya di browser tanpa satu pun request — jadi tidak ada kedipan "menyiapkan…" untuk data yang sudah ada di halaman. |
| **Tiga file dilipat, bukan digelar** | Tiga file penuh sekaligus adalah dinding teks yang digulir lewati, dan konfirmasi yang digulir lewati sama saja dengan tidak ada konfirmasi. |
| **Jadwal ikut ditampilkan walau tidak ada di JSON** | Diturunkan dari `roleKey`. Menyerahkan pilihan cron ke model berarti server harus memvalidasi ekspresi cron karangan; harganya tidak sepadan. |
| **Usulan cacat ditampilkan, bukan disembunyikan** | Kartu yang diam-diam hilang membuat manajer gedung tampak mengabaikan permintaan. Menyebut apa yang salah membuat "coba lagi" jadi kalimat berikutnya yang wajar. |
| **`"type"` wajib jadi kunci pertama** | Teksnya sampai token demi token. Penanda yang muncul belakangan berarti pemilik sempat melihat JSON setengah jadi sebelum kartunya. |

### Kenapa lewat blok ```json, bukan tool-call

Chat console QwenPaw hanya mengalirkan teks — tidak ada event tool-call (catatan
yang sama sudah ada di `components/chat/thread.tsx` sejak awal). Jadi satu-
satunya jalur data terstruktur dari manajer gedung ke aplikasi ini adalah satu
blok ```json di dalam balasan biasa. Blok itu hanya muncul kalau agentnya tahu
bentuknya: `concierge/manager.md` + `concierge/hiring-protocol.md`, dirakit dan
dipasang oleh `npm run concierge:sync`.

Katalog di halaman depan **tidak** bergantung pada sync itu — ia menyusun
usulannya sendiri dengan perakit yang sama.

**Bug di skripnya sendiri, ketemu saat sync kedua.** QwenPaw membuang baris
kosong di ujung file saat menyimpan, jadi yang dikirim tidak pernah sama persis
dengan yang dibaca kembali (6.147 → 6.146 karakter). Pemeriksaan "sudah
mutakhir" karena itu tidak pernah kena, dan tiap `sync` berikutnya akan menulis
ulang — sekaligus **menimpa `.previous-AGENTS.md` dengan salinan dirinya
sendiri**, menghapus satu-satunya jejak isi asli. Diperbaiki dua lapis:
perbandingan mengabaikan spasi ujung, dan cadangan hanya ditulis kalau isi yang
akan ditimpa bukan keluaran skrip ini.

### Diverifikasi di browser

Route sementara merender keempat keadaan tanpa login: usulan sah (kartu +
ketiga file terbuka berisi teks yang benar-benar akan ditulis), usulan dengan
`roleKey` karangan (ditolak, alasannya disebut), blok yang masih mengalir
(tertahan jadi "menyusun usulan karyawan"), dan katalog (pilih jabatan → kartu
berisi AGENTS/PROFILE/SOUL hasil perakit, nama perusahaan ikut masuk). Tidak ada
error console maupun server. Route probe sudah dihapus dan dipastikan 404;
`/`, `/chat`, `/semua` tetap 200.

### Diverifikasi dengan manajer gedung sungguhan

Setelah sync, `/chat` ditanyai kasus nyata ("toko bahan bangunan, 4 orang,
keluhan numpuk di WhatsApp"). Manajer gedung membalas dengan blok yang sah,
aplikasi menukarnya jadi kartu — **Rina**, Customer Service, deskripsi yang
menyebut WhatsApp — dan kalimat sesudah blok tetap tampil di bawah kartu.
AGENTS.md yang dia tulis benar-benar tentang toko itu (memilah pesan yang bisa
dijawab sendiri vs yang naik ke pemilik, mencatat komplain berikut nama barang
dan tanggal), bukan template.

Sync dijalankan dua kali: yang kedua berhenti di "sudah mutakhir", dan
`.previous-AGENTS.md` masih berisi template Mandarin aslinya.

**Belum diuji:** `POST /api/hire` sampai tuntas — itu membuat agent sungguhan di
instance produksi dan menuntut sesi Clerk yang login.

---

## 2026-07-31 · Iterasi 7 — layar depan menampilkan HASIL, bukan jumlah

### Celah yang ditutup

Sampai iterasi 6, laporan menjawab "berapa kali agent jalan" tapi tidak "apa
yang mereka hasilkan". Pertanyaan kedua itulah alasan layar depan berupa
laporan dan bukan kotak chat — tanpa panel ini, *reporting-first* cuma tata
letak yang berbeda.

### Keputusan

| Keputusan | Alasan |
|---|---|
| **Hanya sesi TERBARU tiap karyawan yang dibuka isinya** | Membuka semuanya berarti satu request per sesi seumur hidup agent. Layar depan akan melambat seiring kantor makin produktif — persis kebalikan dari yang seharusnya terjadi. |
| **Penanda "terjadwal" vs "diminta" dari `dispatch.target.session_id`** | Diambil dari job yang sudah di-fetch, jadi gratis. Dan itu penanda yang TEPAT — menebak dari pola nama `session_id` akan meleset untuk jadwal yang dibuat di luar Clawmpany. |
| **Cuplikan dibersihkan dari penanda markdown, bukan dirender** | Dirender penuh mengubah laporan jadi dokumen; dibiarkan mentah membuat laporan terbaca seperti berkas mentah. Penandanya dibuang, isinya tetap. |
| **Panel hasil di ATAS daftar karyawan** | Yang dicari orang saat membuka halaman ini di pagi hari adalah apa yang terjadi semalam, bukan siapa saja yang dia pekerjakan. |

### Diverifikasi

`ReportView` dirender dengan data produksi nyata (roster `clawmpany` +
`archylabs`) lewat route sementara: dua hasil kerja tampil dengan cuplikan
benar, penanda "diminta" tepat, headcount/aktivitas/butuh-keputusan semuanya
terisi. Route probe sudah dihapus dan dipastikan 404.

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
