# Keputusan

Catatan berjalan: apa yang dibangun, kenapa, dan apa berikutnya. Yang paling
baru di atas.

---

## 2026-07-31 · Iterasi 11 — pembicaraan berpindah karyawan, konteksnya ikut

### Celah yang ditutup

Sampai iterasi 10, bicara dengan karyawan tertentu berarti tahu lebih dulu siapa
yang mengurus apa, lalu membuka halamannya. Itu membalik beban: pemilik yang
harus memetakan kantornya sendiri sebelum boleh bertanya. Akibatnya pertanyaan
berhenti di kepala — bentuk friction yang sama dengan halaman kosong, cuma
pindah tempat.

Sekarang cukup bilang siapa yang dicari (atau tidak usah sama sekali):
percakapan BERPINDAH ke orang itu, dan dia yang menjawab di giliran yang sama.

### Fakta yang diverifikasi dulu

1. **QwenPaw MENYIARKAN pemanggilan tool secara terstruktur.** Aliran SSE
   `/api/console/chat` membawa `plugin_call` dan `plugin_call_output` berisi
   `{call_id, name, arguments}`. Komentar lama di `components/chat/thread.tsx`
   ("it has no structured tool-call events") keliru dan sudah diperbaiki.
2. **Tapi tool tidak bisa didaftarkan per-permintaan.** Body chat cuma menerima
   `{input, session_id, user_id, channel}`; daftar tool sebuah agent hanya dari
   tool bawaan + client MCP yang terpasang pada agent itu.
3. **`system_prompt_files` sebuah agent = `["AGENTS.md", "SOUL.md",
   "PROFILE.md"]`** — jadi menulis direktori kantor ke workspace memang
   mungkin, dan itu jadi alternatif serius yang akhirnya ditolak (lihat tabel).

### Keputusan

| Keputusan | Alasan |
|---|---|
| **Alih lewat satu baris penanda `@alih: <id> \| <konteks>`, bukan tool MCP sungguhan** | Fakta 1+2 di atas: `switch_agent` sebagai tool asli menuntut Clawmpany menghosting server MCP sendiri dan memasangnya ke SETIAP agent di setiap roster — dan server itu harus terjangkau dari paw.wheza.id, artinya fiturnya mati saat app dijalankan lokal. Pelajaran iterasi 5 masih berlaku: yang tidak bisa dijalankan lokal tidak akan pernah benar-benar diuji. |
| **Aturan alih menumpang `prime` (iterasi 8), bukan mekanisme kedua** | Giliran pembuka tersembunyi sudah ada dan sudah disusun server. Daftar kolega + aturan penandanya tinggal ikut di situ — nol pesan tambahan, dan instruksinya tetap tidak pernah menyentuh browser. |
| **Direktori dititipkan per sesi, bukan ditulis ke `AGENTS.md`** | Menulis ke workspace berarti menulis ulang N file tiap kali ada yang direkrut atau dipecat, dan tetap basi untuk agent yang dibuat di luar Clawmpany. Instruksi pembuka selalu benar tanpa satu pun tulisan ke workspace. |
| **Yang menerima alih langsung MENJAWAB, bukan cuma menyapa** | Berkas pengalihan berisi tiga hal: kenapa dia dipanggil, transkrip yang sudah berjalan, dan pertanyaan terakhir pemilik. Tanpa yang ketiga, pemilik harus mengetik ulang pertanyaannya — friction yang sama yang mau dihapus, cuma dipindah satu langkah. |
| **Instruksi sesi + berkas pengalihan digabung jadi SATU giliran** | Karyawan yang baru dialihi belum punya sesi. Mengirim dua giliran berarti dua panggilan QwenPaw dan satu sambutan mubazir yang tidak pernah ditampilkan. |
| **Satu sesi QwenPaw PER KARYAWAN, bukan satu sesi bersama** | Kalau semua berbagi satu id sesi, tiap karyawan membaca percakapan yang ditulis orang lain sebagai riwayatnya sendiri. |
| **Maksimal 2 alih per satu giliran pemilik** | Dua karyawan yang sama-sama merasa "ini bukan bidang saya" akan saling melempar sampai kuota habis, dan yang menonton cuma melihat layar berjalan sendiri. |
| **Balasan yang isinya cuma penanda dibuang dari transkrip** | Blok `alih` sudah mengatakan semuanya; gelembung kosong di atasnya cuma menambah baris. |
| **Blok `alih` bernama `lokal` dan tanpa foto, sama seperti slash command** | Ia dihitung di browser, bukan diucapkan agent mana pun — aturan penamaan iterasi 8 dan aturan foto iterasi 10 berlaku apa adanya. |
| **Bisa-diatur ditentukan per PEMBICARA, bukan per layar** | Setelah alih, satu transkrip berisi manajer gedung (yang tidak pernah masuk roster, jadi rute manajemennya 404) dan karyawan roster (yang bisa diatur). Satu boolean untuk seluruh layar akan salah untuk salah satunya. |
| **Baris "kamu bicara dengan siapa" pindah dari halaman ke dalam `Thread`** | Begitu lawan bicaranya bisa berganti, judul statis di halaman jadi bohong. |
| **`/ke <nama>` memotong satu giliran model** | Kalau pemilik sudah menyebut tujuannya lewat perintah, membakar satu panggilan model cuma untuk memutuskan hal yang sudah diputuskan itu menunggu tanpa guna. |
| **Penanda `isRunning` dipegang rantai, bukan tiap giliran** | Kalau tiap giliran mematikannya sendiri, tombol send berkedip kembali di sela dua karyawan — dan sempat menerima pesan yang akan salah alamat. |
| **Server tetap yang memutuskan boleh atau tidak** | Daftar kolega yang dikirim ke browser dan aturan yang dibaca agent disusun dari SATU sumber (`lib/directory.ts`) yang membaca roster yang sama dengan gerbang di `/api/chat`. Agent tidak akan pernah diberi tahu ada kolega yang tidak boleh dituju. |

### Diverifikasi di browser dengan agent produksi

Roster probe (`archylabs`, `sirksa`) dipasang sementara di `SOLO_OFFICE`, lalu
dikembalikan ke `[]`.

- **"saya ingin bicara dengan sirksa"** → Clawmpany membalas `@alih: sirksa | …`,
  blok `alih` muncul (dari Clawmpany → ke Sirksa), baris judul + placeholder
  composer ikut berganti, dan Sirksa menjawab sendiri: *"Halo, Wheza — saya
  Sirksa, QA Engineer di sini…"*
- **`/siapa`** → daftar tiga orang dengan penanda `←` pada yang sedang bicara.
- **`/ke clawmpany`** → alih balik ke sesi yang SUDAH ada. Clawmpany menjawab
  pertanyaan yang tadi diajukan ke Sirksa tanpa pemilik mengetiknya ulang:
  *"Tunggu — ini urusan saya, bukan Sirksa… Cara rekrut di sini: kamu tidak
  perlu mengisi apa-apa."* Itu bukti berkas pengalihan sampai utuh.
- **"saya mau tanya archylabs soal standar floorplan"** (diuji ulang setelah
  digabung dengan `prime`) → Archylabs memperkenalkan diri satu kalimat lalu
  langsung menjawab pertanyaannya.
- `next build` dan `eslint` hijau.

Protokolnya juga diuji langsung ke `paw.wheza.id` dengan aturan yang persis
dihasilkan `handoffRules()`: model menaruh penanda di baris pertama dan menutup
dengan satu kalimat pamit, sesuai instruksi.

### Sisa yang perlu dibereskan

- Sesi probe yang tertinggal di paw.wheza.id: `probe-switch-1`, `probe-switch-2`,
  `probe-alih-a1` (agent `clawmpany`) dan `probe-alih-b1` (agent `tukang`).
- Alih baru aktif di `/chat`. Halaman `/agent/[id]` sengaja tetap satu karyawan
  — itu drill-down ke pekerjaan SATU orang, bukan meja depan.

---

## 2026-07-31 · Iterasi 10 — karyawan diatur dari tempat kamu menyadarinya

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

## 2026-07-31 · Iterasi 9 — karyawannya dibaca dulu, baru dibuat

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
