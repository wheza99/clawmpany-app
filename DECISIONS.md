# Keputusan

Catatan berjalan: apa yang dibangun, kenapa, dan apa berikutnya. Yang paling
baru di atas.

---

## 2026-07-31 · Iterasi 9 — karyawan diatur dari tempat kamu menyadarinya

### Celah yang ditutup

Manajemen karyawan sudah lengkap sejak iterasi 4, tapi seluruhnya hidup di
`/agent/[id]`. Padahal saat yang membuat orang ingin mengubah sesuatu justru
saat membaca jawaban: "nadanya terlalu kaku", "dia harusnya bisa buka
WhatsApp". Menyuruh mereka meninggalkan percakapan untuk memperbaikinya berarti
kehilangan konteks yang memicu perbaikan itu — dan bersamanya, perbaikannya.

Sekarang tiap balasan membawa nama + foto karyawannya, dan fotonya adalah pintu
ke dialog manajemen: identitas, keahlian, peralatan, jadwal. Ditiru dari
ClawCity `src/agents/setup-dialog.ts` + `schedule-dialog.ts`, digabung jadi satu
pintu.

### Keputusan

| Keputusan | Alasan |
|---|---|
| **Tab memetakan ke panel yang SUDAH ada, bukan ditulis ulang** | `SchedulePanel`/`EquipmentPanel` cukup diberi kemampuan memuat sendiri saat data awal tidak diberikan. Satu penyunting per hal, dua tempat memasangnya — kalau ditulis ulang, dua tempat itu akan berbeda perilaku dalam sebulan. |
| **Dialog dipasang ulang tiap dibuka; tab memuat saat dipilih** | Dialog manajemen yang menampilkan keadaan basi lebih berbahaya daripada satu request tambahan — orang membukanya justru untuk memastikan perubahannya mendarat. Tab yang tak pernah dibuka tidak minta apa-apa; penting karena tab peralatan menguji koneksi tiap alat yang menyala. |
| **Foto profil = kotak berisi inisial** | QwenPaw tidak menyimpan gambar untuk agent dan app ini tidak punya database kedua (rosternya saja menumpang di metadata Clerk). Placeholder yang menunggu fitur unggah yang belum ada lebih buruk daripada wajah yang jujur — dan inisial justru konsisten dengan antarmuka yang seluruhnya monospace. |
| **Manajer gedung dapat nama + foto, tapi TIDAK bisa diklik** | Ia sengaja tidak pernah masuk roster mana pun, jadi semua rute manajemennya menjawab 404. Foto yang bisa diklik di sana cuma jalan buntu yang terbaca sebagai kerusakan. |
| **Blok perintah (`/help`, `/dark`) tidak diberi nama karyawan** | Itu keluaran shell yang jalan di browser, bukan ucapan si karyawan. Memberinya wajah membuat dia seolah mengaku melakukan hal yang tidak pernah sampai kepadanya. |
| **Tidak ada kolom "deskripsi" tersendiri** | `description` milik agent di QwenPaw adalah hasil BACAAN berkas persona, bukan field yang bisa ditulis (`PUT /api/agents/{id}` hanya menerima nama). Kolomnya akan menjanjikan sesuatu yang tak pernah tersimpan; yang benar-benar mengubahnya adalah PROFILE.md. |

### Bug yang ditemukan dan diperbaiki

- **Dialog tidak bisa dibuka ulang setelah ditutup.** Event `close` bawaan
  `<dialog>` tidak sampai ke React di sini — baik lewat prop `onClose` maupun
  `addEventListener`. Akibatnya state pemanggil tidak pernah kembali `false`:
  elemennya tersembunyi tapi tetap terpasang, dan mengklik foto lagi tidak
  membuka apa-apa sampai halaman dimuat ulang. Sekarang ✕ / latar / Esc
  semuanya memanggil `onClose` lewat handler React biasa, dan Esc di-`preventDefault`
  supaya perilaku bawaan tidak menyelinap masuk lagi.
- **Kegagalan memuat identitas bocor ke semua tab**, menempel di atas panel yang
  memuat sendiri dengan baik dan menabrak label bingkainya. Sekarang hanya
  tampil di tabnya sendiri.
- **Header menampilkan "memuat…" selamanya** untuk karyawan yang gagal dibaca.

### Diverifikasi

- **Keahlian (baru) diuji end-to-end di paw.wheza.id** pada agent sekali-pakai
  yang dibuat dan dihapus lagi: create → list → disable → enable → ganti nama
  lewat `source_name` → delete, semuanya 200, emoji + deskripsi terbaca benar.
  Payload-nya dirakit dengan Node memakai fungsi yang sama seperti produksi —
  bukan tiruan. Percobaan pertama memakai Python gagal 400: `json.dumps`
  meng-escape emoji jadi pasangan surrogate `📊`, dan YAML menolaknya
  sebagai escape Unicode tidak sah. `JSON.stringify` di JS menulis emojinya apa
  adanya — itulah yang diterima, dan itulah sebabnya uji harus memakai runtime
  yang sama dengan produksinya.
- **Dialog dijalankan di browser**: buka → tutup (✕ / Esc / latar) → buka lagi,
  ketiganya benar; pergantian tab, tema terang & gelap, dan jalur 404 (agent di
  luar roster) menampilkan kalimat yang jujur, bukan panel kosong.

---

## 2026-07-31 · Iterasi 8 — chat yang menjelaskan dirinya sendiri

### Tiga keluhan, satu akar

Semua bermuara pada hal yang sama: **transkrip tidak memberi tahu apa pun soal
keadaannya sendiri.** Kursor berkedip tidak bisa dibedakan dari aplikasi yang
menggantung; gelembung tanpa nama tidak bisa dibedakan antar-karyawan; dan
halaman kosong menuntut orang menebak apa yang boleh ditanyakan.

### Keputusan

| Keputusan | Alasan |
|---|---|
| **Tahap giliran dibaca dari aliran SSE, bukan ditebak dari waktu** | `lib/paw.ts` sudah tahu bedanya blok `reasoning` dan `message`. Empat tahap — menghubungi → menunggu → berpikir → menulis — jadi fakta, bukan animasi yang berpura-pura tahu. |
| **Spinner braille + detik berjalan** | Spinner membuktikan aplikasinya hidup; angka detiknya yang membuat penantian bisa dinilai — 4 detik wajar, 70 detik alasan menekan stop. |
| **Bingkai spinner digerakkan JS, bukan CSS** | Yang berubah adalah ISI karakter; `content` di keyframe belum bisa diandalkan lintas browser, dan memutar elemen dengan `transform` melanggar aturan "tidak ada lengkungan di mana pun". |
| **Cuplikan pikiran tampil selagi menalar, tombol `thinking` setelahnya** | Saat belum ada satu kata pun, baris terakhir reasoning adalah satu-satunya bukti ada yang bergerak. Begitu jawaban mengalir, ia berhenti berguna. |
| **Nama di setiap gelembung: satu kata untuk manusia, nama + id untuk agent** | Kantor berisi 20 karyawan menghasilkan 20 transkrip yang terlihat persis sama. Nama panggilan diambil dari Clerk lewat `viewerName()` — sengaja TIDAK ditaruh di `Office`, karena perakit laporan tidak butuh nama siapa pun dan tidak perlu membayar panggilan Clerk tambahan. |
| **Balasan slash command diberi nama `lokal`, bukan nama agent** | Ia dihitung di browser dan tidak pernah menyentuh paw.wheza.id. Menamainya dengan nama agent adalah kebohongan kecil yang merusak arti semua nama lain. |
| **Sesi dibuka satu giliran tersembunyi (`prime`), bukan sapaan statis** | QwenPaw `/api/console/chat` tidak punya slot *system message* — satu bentuk pesan saja. Jadi framing dilakukan seperti yang memang mungkin: giliran pertama yang tidak pernah ditampilkan, dan yang tampil hanya jawabannya. |
| **Instruksi sesi disusun SERVER (`lib/prompt.ts`), tidak dikirim sebagai prop** | Isinya aset produk yang tidak perlu ada di HTML tiap halaman, dan fakta kantor di dalamnya tidak boleh bisa ditukar dari devtools — alasan yang sama dengan token yang tidak pernah menyeberang. |
| **Manajer gedung dibekali keadaan kantor; karyawan tidak** | Sambutan yang menyebut "satu orang belum punya identitas" berguna; menyuapi karyawan identitasnya sendiri yang sudah ada di `PROFILE.md` cuma menambah token. |
| **Halaman `/agent/[id]` TIDAK auto-prime** | Halaman itu dibuka untuk MEMERIKSA, dan kebanyakan kunjungan berakhir tanpa satu pesan pun. Auto-prime di sana = satu panggilan QwenPaw tiap kali seseorang mengklik nama. |
| **Gagal menyusun instruksi tidak menggagalkan pembukaan** | Sambutan yang lebih tumpul jauh lebih baik daripada layar chat yang dibuka dengan pesan error. |

### Bug yang ikut ketahuan

`autoGrow` di composer menulis `height = "160"` tanpa satuan — nilai tidak sah,
jadi browser mengabaikannya dan kotak ketik tidak pernah tumbuh. Menambahkan
`px` justru memperlihatkan masalah kedua: pengukuran pertama terjadi sebelum
layout selesai, dan `scrollHeight` saat itu mengembalikan tinggi kolom (752px),
cukup untuk mengunci composer setinggi 160px seumur halaman. Perbaikannya:
kotak kosong tidak pernah diberi tinggi eksplisit — selama kosong, `rows=1` +
`min-h-8` yang menentukan.

### Diverifikasi

Dijalankan sungguhan terhadap paw.wheza.id: sesi dibuka sendiri oleh manajer
gedung ("Kantormu sekarang kosong — belum ada satu pun karyawan…"), instruksi
sesinya tidak muncul di transkrip, nama tampil di tiap gelembung, indikator
berjalan lewat keempat tahapnya, `/new` membuka sesi baru dengan sambutan baru,
`/help` bernama `lokal`. Diperiksa di gelap & terang, desktop & 375px. Tidak ada
error di konsol maupun di log server.

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
