/** Konten dokumentasi publik Qalling. Teks umum (tanpa angka harga/kuota) agar tidak cepat usang; angka resmi ada di halaman Harga. */
export type DocArea = "guide" | "developer" | "api";
export type DocGroup =
  "Mulai" | "Fitur" | "Platform" | "Pakai dengan AI" | "Lainnya" | "Developer" | "API Reference";
/** Kelompok sidebar per area dokumentasi. */
export const AREA_GROUPS: Record<DocArea, DocGroup[]> = {
  guide: ["Mulai", "Fitur", "Platform", "Pakai dengan AI", "Lainnya"],
  developer: ["Developer"],
  api: ["API Reference"],
};
export const DOC_GROUPS: DocGroup[] = Object.values(AREA_GROUPS).flat();
export interface DocCode {
  title?: string;
  lang: string;
  body: string;
}

export interface DocSection {
  id: string;
  /** Area dokumentasi; kosong = panduan pengguna. */
  area?: DocArea;
  group: DocGroup;
  code?: DocCode[];
  /** Tabel opsional (mis. perbandingan platform). */
  table?: { head: string[]; rows: string[][] };
  title: string;
  summary: string;
  steps?: string[];
  tips?: string[];
}

export const QALLING_DOCS: DocSection[] = [
  {
    id: "mulai",
    group: "Mulai",
    title: "Memulai",
    summary:
      "Qalling adalah CRM media sosial: jadwalkan postingan, balas komentar dan pesan, kelola lead, dan lihat laporan dalam satu dasbor.",
    steps: [
      "Daftar atau masuk di halaman Masuk memakai Google atau kode yang dikirim ke email Anda (tanpa kata sandi).",
      "Pilih atau buat workspace. Satu workspace biasanya mewakili satu bisnis atau satu klien agensi.",
      "Hubungkan akun media sosial (lihat bagian Menghubungkan akun).",
      "Buat postingan pertama dari menu Konten → Penjadwal Posting.",
    ],
    tips: [
      "Mulai dari satu akun dan satu postingan uji agar alurnya terasa dulu sebelum menjadwalkan banyak konten.",
    ],
  },
  {
    id: "akun",
    group: "Mulai",
    title: "Menghubungkan akun media sosial",
    summary:
      "Akun Instagram, Facebook, Threads, TikTok, LinkedIn, YouTube, Pinterest, X, Telegram, dan Discord dapat dikelola dari satu tempat, sesuai paket Anda.",
    steps: [
      "Buka Dasbor Sosial lalu pilih Hubungkan akun.",
      "Ikuti proses izin dari platform yang bersangkutan, lalu kembali ke Qalling.",
      "Pastikan akun tampil berstatus terhubung. Jika status berubah menjadi perlu sambung ulang, hubungkan kembali.",
    ],
    tips: [
      "Instagram membutuhkan akun bisnis/kreator. Facebook yang dihubungkan adalah Halaman (Page), bukan profil pribadi.",
      "Jumlah akun mengikuti paket; tambahan akun tersedia sebagai add-on di Tagihan & Saldo.",
    ],
  },
  {
    id: "media",
    group: "Fitur",
    title: "Pustaka Media",
    summary: "Simpan foto dan video di Konten → Media, lalu pakai ulang di banyak postingan.",
    steps: [
      "Buka Konten → Media, lalu seret berkas ke area unggah atau klik untuk memilih.",
      "Atur folder agar mudah dicari. Berkas dapat diganti nama, dipindah, dan dihapus.",
      "Saat membuat postingan, pilih media dari pustaka (hingga 10 lampiran untuk carousel).",
    ],
    tips: [
      "Batas ukuran foto dan video ditetapkan oleh pengelola layanan dan ditampilkan di area unggah.",
      "Foto besar dikompres otomatis tanpa mengubah rasio gambar; animasi (GIF/WebP animasi) dibiarkan utuh.",
      "Kuota penyimpanan mengikuti paket. Bila hampir penuh, hapus berkas yang tidak terpakai atau tingkatkan paket.",
    ],
  },
  {
    id: "posting",
    group: "Fitur",
    title: "Membuat dan menjadwalkan postingan",
    summary:
      "Tulis caption, pilih akun tujuan, lampirkan media, lalu simpan sebagai draf, jadwalkan, atau terbitkan sekarang.",
    steps: [
      "Buka Konten → Penjadwal Posting dan pilih Buat posting.",
      "Pilih satu atau beberapa akun tujuan, isi judul internal dan caption.",
      "Lampirkan media dari pustaka. Beberapa gambar membentuk carousel; satu video menjadi reel/video sesuai platform.",
      "Pilih waktu terbit. Zona waktu yang dipakai adalah WIB (Asia/Jakarta).",
      "Simpan sebagai draf untuk ditinjau, atau jadwalkan agar terbit otomatis.",
    ],
    tips: [
      "Komentar pertama (mis. hashtag atau tautan) dapat diposting otomatis setelah postingan terbit di platform yang mendukung.",
      "Beberapa platform punya opsi khusus, misalnya poll Threads, kolaborator Instagram, visibilitas LinkedIn, privasi TikTok/YouTube, dan board Pinterest.",
      "Postingan yang gagal terbit menampilkan alasannya; perbaiki lalu coba lagi dari daftar posting.",
    ],
  },
  {
    id: "kalender",
    group: "Fitur",
    title: "Kalender Konten",
    summary: "Lihat semua postingan per bulan. Klik tanggal untuk melihat detailnya.",
    steps: [
      "Buka Konten → Kalender dan pilih bulan atau klien.",
      "Klik sebuah tanggal yang berisi postingan untuk membuka jendela detail.",
      "Jika ada beberapa postingan pada tanggal itu, pilih dari daftar dropdown untuk melihat caption, media, akun tujuan, status, dan tautan postingannya.",
    ],
  },
  {
    id: "ide",
    group: "Fitur",
    title: "Ide dan Kampanye",
    summary: "Kumpulkan ide konten, kelompokkan dalam kampanye, lalu ubah menjadi postingan.",
    steps: [
      "Simpan ide di Konten → Ide, lengkap dengan catatan dan status.",
      "Kelompokkan konten terkait dalam Kampanye untuk memantau progresnya.",
      "Ubah ide yang siap menjadi postingan dari Penjadwal Posting.",
    ],
  },
  {
    id: "inbox",
    group: "Fitur",
    title: "Inbox, komentar, dan otomasi",
    summary:
      "Balas pesan langsung (DM) dan komentar dari satu inbox, serta otomatiskan balasan yang berulang.",
    steps: [
      "Buka Percakapan → Inbox untuk membaca dan membalas DM; tandai percakapan sebagai terbuka, ditunda, atau selesai.",
      "Buka Percakapan → Komentar untuk membalas atau menyukai komentar pada postingan Anda.",
      "Di Otomasi, buat aturan: bila komentar mengandung kata kunci tertentu, kirim balasan komentar dan/atau DM otomatis.",
      "Gunakan Template untuk balasan yang sering dipakai.",
    ],
    tips: [
      "Mulai dari kata kunci yang spesifik agar otomasi tidak membalas komentar yang tidak relevan.",
      "Pantau hasil otomasi beberapa hari pertama dan sesuaikan teksnya.",
    ],
  },
  {
    id: "crm",
    group: "Fitur",
    title: "Lead, kontak, dan pipeline",
    summary: "Ubah percakapan menjadi lead, catat riwayat interaksi, dan pantau tahapan penjualan.",
    steps: [
      "Buka Penjualan → Kontak: orang yang mengirim DM otomatis menjadi kontak. Tambahkan kontak manual, beri tag dan catatan, dan lihat riwayat DM, prospek, dan follow-up dalam satu garis waktu.",
      "Dari Inbox atau halaman Kontak, ubah percakapan/kontak menjadi prospek (lead) dengan satu klik; nomor telepon dan catatan dapat ditambahkan.",
      "Buka Penjualan → Pipeline untuk memindahkan lead antar tahap.",
      "Catat aktivitas (telepon, pesan, pertemuan) dan jadwalkan Follow-up agar tidak ada prospek terlewat.",
      "Beranda menampilkan follow-up yang terlambat dan yang jatuh tempo hari ini.",
      "Di form prospek, pilih Konten sumber (postingan atau kampanye yang membawa prospek itu). Buka Penjualan → Atribusi Konten untuk melihat konten mana yang menghasilkan prospek, closing, dan nilai penjualan.",
    ],
    tips: [
      "Tentukan satu penanggung jawab untuk tiap lead supaya daftar follow-up jelas.",
      "Isi Konten sumber sejak prospek dibuat; makin lengkap, makin akurat laporan atribusinya.",
    ],
  },
  {
    id: "agency",
    group: "Fitur",
    title: "Paket Agency: persetujuan klien & laporan white-label",
    summary:
      "Fitur untuk agensi: klien menyetujui konten lewat link, laporan memakai merek agensi Anda, dan semua perubahan tim tercatat.",
    steps: [
      "Buka Klien & Laporan → Studio Agency → Persetujuan. Pilih draft atau postingan terjadwal, isi nama klien dan pesan singkat, lalu buat link persetujuan. Postingan ditahan sebagai draft.",
      "Kirim link ke klien. Klien membuka halaman pratinjau tanpa login, lalu memilih Setujui atau Minta revisi (catatan wajib). Anda menerima email dan statusnya tampil di daftar.",
      "Bila disetujui dan jadwalnya masih di masa depan, postingan otomatis kembali terjadwal. Bila jadwalnya sudah lewat, jadwalkan ulang secara manual.",
      "Di tab Laporan klien, buat link laporan dengan nama agensi, logo, dan warna Anda. Pilih seluruh akun (termasuk prospek dan closing) atau satu klien. Link selalu menampilkan angka terbaru dan bisa dicabut kapan saja.",
      "Tab Log aktivitas menampilkan siapa mengubah postingan, prospek, anggota tim, dan persetujuan. Hanya owner dan admin yang dapat membukanya.",
    ],
    tips: [
      "Peran anggota tim (admin, staf, hanya lihat, atau peran kustom) diatur di Tim & Anggota.",
      "Fitur ini tersedia di paket Agency; di paket lain tab-nya tampil terkunci.",
    ],
  },
  {
    id: "analitik",
    group: "Fitur",
    title: "Analitik dan jam terbaik",
    summary:
      "Lihat performa akun dan postingan, serta waktu terbaik untuk memposting, pada platform yang menyediakan datanya.",
    steps: [
      "Buka Dasbor Sosial untuk ringkasan akun dan pertumbuhan pengikut.",
      "Lihat performa tiap postingan (jangkauan, interaksi) bila tersedia dari platform.",
      "Gunakan rekomendasi jam terbaik saat memilih waktu jadwal.",
    ],
    tips: [
      "Tidak semua platform membuka data statistik; platform tersebut ditandai tidak tersedia.",
    ],
  },
  {
    id: "laporan",
    group: "Fitur",
    title: "Klien dan laporan",
    summary: "Kelompokkan akun per klien dan buat laporan untuk dibagikan.",
    steps: [
      "Tambahkan klien di Klien & Laporan, lalu kelompokkan akun media sosialnya.",
      "Buka Laporan untuk melihat ringkasan dan mengunduhnya (PDF/Excel).",
      "Filter kalender berdasarkan klien untuk melihat jadwal masing-masing.",
    ],
    tips: [
      "Ringkasan mingguan postingan juga dikirim ke email pemilik akun setiap Senin; dapat dimatikan di Tagihan & Saldo.",
    ],
  },
  {
    id: "platform",
    group: "Platform",
    title: "Ringkasan platform",
    summary:
      "Qalling mendukung banyak platform. Kemampuan tiap platform berbeda; tabel ini merangkum yang umum. Detail ada di halaman masing-masing.",
    table: {
      head: ["Platform", "Posting", "Komentar & statistik"],
      rows: [
        ["Instagram", "Foto, carousel, reel, story", "Tersedia"],
        ["Facebook (Halaman)", "Teks, foto, video/reel", "Tersedia"],
        ["Threads", "Teks, foto, video, poll, utas", "Sesuai platform"],
        ["TikTok", "Video atau foto", "Sesuai platform"],
        ["YouTube", "Satu video (Shorts otomatis bila memenuhi syarat)", "Sesuai platform"],
        ["LinkedIn", "Teks, gambar, dokumen carousel, video", "Tidak tersedia"],
        ["X", "Teks, foto, video", "Sesuai platform"],
        ["Pinterest", "Satu foto per Pin ke sebuah board", "Tidak tersedia"],
        ["Telegram", "Teks, album media ke channel/grup", "Tidak tersedia"],
        ["Discord", "Teks dan berkas ke channel server", "Tidak tersedia"],
      ],
    },
    tips: [
      "Ketersediaan fitur juga bergantung pada paket Anda dan izin yang diberikan platform.",
      "Opsi khusus per platform (poll, kolaborator, privasi, dan sebagainya) diatur lewat asisten AI atau penjadwal sesuai fiturnya.",
    ],
  },
  {
    id: "instagram",
    group: "Platform",
    title: "Instagram",
    summary: "Posting feed, carousel, reel, dan story ke akun bisnis atau kreator.",
    steps: [
      "Foto tunggal, carousel (beberapa gambar), atau satu video (menjadi reel).",
      "Story: tepat satu gambar atau video tanpa caption.",
      "Kolaborator: undang hingga tiga akun sebagai ko-penulis (Collab post); mereka menerima undangan di aplikasi Instagram.",
      "Trial reel: tampilkan reel ke non-pengikut dulu; akun harus memenuhi syarat dari Instagram.",
      "Komentar pertama (hashtag atau tautan) diposting otomatis setelah terbit; maksimal 30 hashtag.",
    ],
    tips: ["Instagram selalu membutuhkan minimal satu gambar atau video."],
  },
  {
    id: "facebook",
    group: "Platform",
    title: "Facebook (Halaman)",
    summary: "Posting ke Halaman Facebook, bukan profil pribadi.",
    steps: [
      "Teks dengan kartu tautan, foto, atau satu video.",
      "Satu video dapat terbit sebagai reel (vertikal) atau video biasa.",
      "Komentar pertama didukung.",
    ],
    tips: ["Video Facebook diposting sendiri, tidak digabung dengan foto."],
  },
  {
    id: "threads",
    group: "Platform",
    title: "Threads",
    summary: "Posting teks, media, utas, dan poll.",
    steps: [
      "Teks hingga 500 karakter per bagian; teks yang lebih panjang dipecah menjadi utas (balasan berlanjut).",
      "Poll berisi 2–4 pilihan (maksimal 25 karakter per pilihan).",
      "Tag topik, kartu tautan, dan pengaturan siapa yang boleh membalas tersedia.",
    ],
    tips: ["Poll, kartu tautan, dan lampiran teks panjang hanya untuk posting tanpa media."],
  },
  {
    id: "tiktok",
    group: "Platform",
    title: "TikTok",
    summary: "Posting satu video atau 1–35 foto.",
    steps: [
      "Pilih mode: langsung terbit, atau kirim sebagai draf ke inbox TikTok untuk diselesaikan di aplikasi.",
      "Privasi (publik, teman, pengikut, hanya saya) dipilih oleh Anda; izin komentar, duet, dan stitch diatur terpisah.",
      "Cover video dapat dipilih dari bingkai tertentu.",
    ],
    tips: ["Komentar pertama maksimal 150 karakter dan hanya untuk akun dan mode tertentu."],
  },
  {
    id: "youtube",
    group: "Platform",
    title: "YouTube",
    summary: "Unggah satu video ke channel.",
    steps: [
      "Judul (1–100 karakter) wajib. Deskripsi diambil dari caption.",
      "Anda harus menyatakan apakah video dibuat untuk anak-anak; ini tidak boleh diasumsikan.",
      "Pilih privasi: publik, tidak publik, atau privat. Tag dan kategori opsional.",
    ],
    tips: ["Video vertikal atau persegi hingga 3 menit otomatis menjadi Shorts."],
  },
  {
    id: "linkedin",
    group: "Platform",
    title: "LinkedIn",
    summary: "Posting ke profil pribadi LinkedIn.",
    steps: [
      "Teks hingga 3000 karakter, satu gambar, 2–20 gambar, atau satu video MP4.",
      "Visibilitas: publik atau hanya koneksi.",
      "Beberapa gambar dapat diposting sebagai dokumen carousel (PDF) dengan judul.",
    ],
    tips: ["Komentar dan statistik LinkedIn tidak tersedia di Qalling."],
  },
  {
    id: "x",
    group: "Platform",
    title: "X",
    summary: "Posting teks, foto, atau video ke akun X.",
    steps: [
      'Tandai "dibuat dengan AI" untuk posting dengan foto atau video bila relevan.',
      "Periksa biaya per posting di halaman Harga atau ke pengelola layanan sebelum memposting.",
    ],
  },
  {
    id: "pinterest",
    group: "Platform",
    title: "Pinterest",
    summary: "Posting satu foto sebagai Pin ke sebuah board.",
    steps: [
      "Pilih board tujuan; ini wajib.",
      "Judul (maks 100 karakter) dan tautan tujuan opsional; caption menjadi deskripsi (maks 800 karakter).",
    ],
    tips: ["Pin video belum tersedia. Komentar dan statistik tidak tersedia."],
  },
  {
    id: "telegram",
    group: "Platform",
    title: "Telegram",
    summary: "Posting ke channel atau grup tempat bot ditambahkan.",
    steps: [
      "Teks hingga 4096 karakter, atau 1024 karakter bila disertai media; hingga 10 media sebagai album.",
      "Opsi senyap dan larangan teruskan/simpan tersedia.",
    ],
    tips: ["Bot ditambahkan ke channel atau grup dari dasbor, bukan dari Telegram."],
  },
  {
    id: "discord",
    group: "Platform",
    title: "Discord",
    summary: "Posting ke channel server.",
    steps: [
      "Teks hingga 2000 karakter dan hingga 10 berkas (maks 20 MB per berkas).",
      "Sebutan seperti @everyone tidak pernah memberi notifikasi ke siapa pun.",
    ],
  },
  {
    id: "dev-intro",
    area: "developer",
    group: "Developer",
    title: "Pengantar",
    summary:
      "Qalling menyediakan server MCP (Model Context Protocol) agar asisten AI atau skrip Anda dapat membaca dan mengelola akun Qalling: postingan, media, inbox, komentar, otomasi, analitik, lead, dan kontak.",
    steps: [
      "Endpoint: POST https://qalling.id/mcp (JSON-RPC 2.0 lewat HTTP, respons JSON).",
      "Metode yang didukung: initialize, ping, tools/list, dan tools/call.",
      "Setiap tool tunduk pada paket workspace (fitur mcp_api) dan hak akses pengguna yang memberi izin.",
      "Daftar lengkap tool, parameter, dan contoh ada di tab API Reference.",
    ],
    tips: [
      "Untuk ChatGPT atau Claude, cukup tambahkan Qalling sebagai konektor dan setujui akses; Anda tidak perlu menulis kode.",
      "Teks dari pelanggan (komentar, DM, catatan) dikembalikan sebagai data tidak tepercaya; jangan jadikan instruksi.",
    ],
  },
  {
    id: "dev-auth",
    area: "developer",
    group: "Developer",
    title: "Autentikasi",
    summary: "Kirim token pada header Authorization: Bearer. Ada dua cara mendapatkan token.",
    steps: [
      "Token pribadi: buat di aplikasi pada menu Integrasi AI & MCP, beri nama, lalu salin. Token hanya tampil sekali; cabut kapan saja dari halaman yang sama.",
      "OAuth: klien MCP yang mendukung OAuth (mis. ChatGPT dan Claude) otomatis menemukan metadata di /.well-known dan mengarahkan pengguna ke layar persetujuan Qalling.",
      "Permintaan tanpa token menghasilkan HTTP 401 dengan header WWW-Authenticate yang menunjuk ke metadata OAuth.",
    ],
    code: [
      {
        title: "Header",
        lang: "http",
        body: "POST /mcp HTTP/1.1\nHost: qalling.id\nAuthorization: Bearer <token>\nContent-Type: application/json",
      },
    ],
    tips: [
      "Perlakukan token seperti kata sandi. Jangan menyimpannya di repositori atau skrip publik.",
    ],
  },
  {
    id: "dev-quickstart",
    area: "developer",
    group: "Developer",
    title: "Mulai cepat",
    summary: "Contoh memanggil server MCP dengan curl.",
    steps: [
      "Panggil initialize untuk memastikan token valid.",
      "Panggil tools/list untuk melihat tool yang tersedia bagi akun Anda.",
      "Panggil list_workspaces untuk mendapatkan workspace_id, lalu panggil tool lain dengan id tersebut.",
    ],
    code: [
      {
        title: "Initialize",
        lang: "bash",
        body: 'curl -s https://qalling.id/mcp \\\n  -H "Authorization: Bearer $QALLING_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"demo","version":"1"}}}\'',
      },
      {
        title: "Memanggil tool",
        lang: "bash",
        body: 'curl -s https://qalling.id/mcp \\\n  -H "Authorization: Bearer $QALLING_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_workspaces","arguments":{}}}\'',
      },
    ],
  },
  {
    id: "dev-posting",
    area: "developer",
    group: "Developer",
    title: "Alur posting",
    summary: "Urutan yang disarankan untuk membuat dan menerbitkan postingan lewat tool.",
    steps: [
      "Ambil akun tujuan dengan qalling_list_social_accounts dan aturan platform dengan qalling_get_platform_rules.",
      "Unggah media dengan qalling_upload_media (url atau file_base64) atau pilih dari qalling_list_media.",
      "Buat draf dengan qalling_create_post (publish_mode=draft). Untuk menjadwalkan, gunakan publish_mode=scheduled dan scheduled_at ISO 8601 berzona waktu di masa depan.",
      "Opsi per platform (poll Threads, kolaborator Instagram, privasi TikTok/YouTube, dan sebagainya) dikirim lewat platform_options.",
      "Untuk menerbitkan segera: panggil qalling_publish_post_now dengan confirm=false, tampilkan isi dan akun ke pengguna, lalu confirm=true setelah disetujui.",
      "Pantau hasil lewat qalling_list_posts atau qalling_get_post; penerbitan berjalan pada siklus penjadwal berikutnya, bukan sinkron.",
    ],
    code: [
      {
        title: "Posting terjadwal dengan poll Threads",
        lang: "json",
        body: '{\n  "name": "qalling_create_post",\n  "arguments": {\n    "workspace_id": "<uuid>",\n    "account_ids": ["<uuid akun Threads>"],\n    "title": "Poll Jumat",\n    "caption": "Tim kopi atau teh?",\n    "publish_mode": "scheduled",\n    "scheduled_at": "2026-11-13T19:30:00+07:00",\n    "platform_options": { "threads": { "poll": { "options": ["Kopi", "Teh"] } } }\n  }\n}',
      },
    ],
    tips: [
      "Jangan mengirim ulang postingan berstatus tidak pasti (processing/unknown); baca statusnya dulu.",
    ],
  },
  {
    id: "dev-safety",
    area: "developer",
    group: "Developer",
    title: "Aksi yang menjangkau pelanggan",
    summary:
      "Tool yang mengirim sesuatu ke pelanggan atau publik memakai pola konfirmasi dua langkah agar tidak ada pesan terkirim tanpa persetujuan.",
    steps: [
      "Panggil tool dengan confirm=false. Hasilnya berupa pratinjau persis isi dan penerima.",
      "Tampilkan pratinjau kepada pengguna dan minta persetujuan eksplisit.",
      "Panggil ulang dengan confirm=true. Server memakai perbandingan-dan-set agar tidak terkirim ganda.",
    ],
    tips: [
      "Berlaku untuk qalling_publish_post_now, qalling_send_dm, qalling_reply_to_comment, dan qalling_retry_post.",
      "Otomasi baru dibuat dalam keadaan nonaktif; aktifkan hanya setelah persetujuan.",
      "Tool CRM (lead, aktivitas, kontak) tidak pernah menghubungi pelanggan.",
    ],
  },
  {
    id: "dev-errors",
    area: "developer",
    group: "Developer",
    title: "Error dan batasan",
    summary: "Cara membaca kegagalan dan batasan yang perlu diketahui.",
    steps: [
      "Kegagalan tool dikembalikan dengan isError=true dan pesan di content; kegagalan protokol memakai kode error JSON-RPC.",
      "401: token hilang, salah, atau dicabut. 403/akses ditolak: peran Anda tidak boleh mengubah workspace atau fitur tidak ada di paket.",
      "Kuota paket (jumlah akun, posting bulanan, penyimpanan media) ditegakkan juga pada tool.",
      "Media dari media_urls hanya dari CDN yang diizinkan; untuk host lain unggah dulu lalu pakai media_ids.",
    ],
    tips: [
      "Penerbitan terjadwal membutuhkan penjadwal yang berjalan; status akhir dibaca dari qalling_get_post.",
    ],
  },
  {
    id: "api-reference",
    area: "api",
    group: "API Reference",
    title: "Daftar tool MCP",
    summary:
      "Seluruh tool yang tersedia beserta parameternya. Daftar ini dibuat langsung dari definisi server sehingga selalu sesuai versi terbaru.",
  },
  {
    id: "ai",
    group: "Pakai dengan AI",
    title: "Kelola Qalling lewat ChatGPT atau Claude",
    summary:
      "Hubungkan asisten AI ke Qalling agar dapat membuat draf, menjadwalkan, membaca komentar, dan mengelola lead lewat percakapan.",
    steps: [
      "Buka menu AI di aplikasi dan ikuti petunjuk menghubungkan ChatGPT atau Claude.",
      "Setujui izin akses pada layar persetujuan yang muncul.",
      "Minta asisten melakukan tugas, misalnya membuat draf posting atau merangkum komentar yang belum dibalas.",
    ],
    tips: [
      "Aksi yang menjangkau pelanggan (menerbitkan sekarang, mengirim DM, membalas komentar) selalu meminta persetujuan Anda lebih dulu.",
      "Anda dapat memutus akses kapan saja dari pengaturan AI.",
    ],
  },
  {
    id: "tagihan",
    group: "Lainnya",
    title: "Tagihan, saldo, dan perpanjangan",
    summary:
      "Isi saldo, perpanjang langganan dari saldo, dan unduh bukti pembayaran di Tagihan & Saldo.",
    steps: [
      "Klik Top up pada saldo di bagian atas untuk mengisi saldo.",
      "Aktifkan perpanjangan otomatis agar langganan dipotong dari saldo saat jatuh tempo.",
      "Unduh PDF bukti pembayaran dari tab Riwayat tagihan.",
    ],
    tips: [
      "Anda menerima email pengingat saat masa trial akan habis, saat saldo tidak cukup untuk perpanjangan, dan bukti pembayaran setelah top up atau perpanjangan.",
      "Pengingat trial, bukti pembayaran, dan ringkasan mingguan dapat dimatikan di Tagihan & Saldo. Peringatan saldo kurang tetap dikirim karena memengaruhi layanan.",
    ],
  },
  {
    id: "referral",
    group: "Lainnya",
    title: "Referral",
    summary: "Ajak teman memakai Qalling dan dapatkan komisi dalam bentuk saldo.",
    steps: [
      "Buka menu Referral untuk melihat tautan undangan Anda.",
      "Bagikan tautan itu. Tautan membuka beranda Qalling, jadi teman Anda bisa membaca fitur dulu sebelum mendaftar. Kode referral tersimpan di perangkatnya selama 30 hari dan otomatis terpakai saat ia mendaftar.",
      "Komisi masuk ke saldo setelah syarat program terpenuhi.",
    ],
  },
  {
    id: "tim",
    group: "Lainnya",
    title: "Tim dan keamanan",
    summary: "Undang anggota tim dan atur akses sesuai peran.",
    steps: [
      "Buka Tim & Anggota untuk mengundang anggota lewat email.",
      "Atur peran agar setiap anggota hanya melihat bagian yang dibutuhkan.",
      "Login memakai kode sekali pakai atau Google, sehingga tidak ada kata sandi yang perlu diingat.",
    ],
  },
  {
    id: "faq",
    group: "Lainnya",
    title: "Pertanyaan umum",
    summary: "Jawaban singkat untuk kendala yang paling sering muncul.",
    tips: [
      "Unggah media gagal: pastikan ukuran file tidak melebihi batas yang tertera di area unggah, lalu coba lagi. Unggahan dikirim bertahap sehingga file berukuran besar tetap dapat masuk.",
      "Postingan gagal terbit: buka detailnya di Kalender atau daftar posting untuk melihat alasannya. Penyebab umum: akun perlu disambung ulang atau media tidak sesuai aturan platform.",
      "Akun menampilkan perlu sambung ulang: hubungkan kembali dari Dasbor Sosial.",
      "Tidak menerima email kode masuk: periksa folder spam dan pastikan alamat email benar.",
      "Butuh bantuan lain: hubungi kami lewat halaman Kontak.",
    ],
  },
];
