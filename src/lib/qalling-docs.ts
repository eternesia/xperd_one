/** Konten dokumentasi publik Qalling. Teks umum (tanpa angka harga/kuota) agar tidak cepat usang; angka resmi ada di halaman Harga. */
export interface DocSection {
  id: string;
  title: string;
  summary: string;
  steps?: string[];
  tips?: string[];
}

export const QALLING_DOCS: DocSection[] = [
  {
    id: "mulai",
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
    title: "Lead, kontak, dan pipeline",
    summary: "Ubah percakapan menjadi lead, catat riwayat interaksi, dan pantau tahapan penjualan.",
    steps: [
      "Dari Inbox, ubah percakapan menjadi lead dengan satu klik; nomor telepon dan catatan dapat ditambahkan.",
      "Buka Penjualan → Pipeline untuk memindahkan lead antar tahap.",
      "Catat aktivitas (telepon, pesan, pertemuan) dan jadwalkan Follow-up agar tidak ada prospek terlewat.",
      "Beranda menampilkan follow-up yang terlambat dan yang jatuh tempo hari ini.",
    ],
    tips: ["Tentukan satu penanggung jawab untuk tiap lead supaya daftar follow-up jelas."],
  },
  {
    id: "analitik",
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
    id: "ai",
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
    title: "Referral",
    summary: "Ajak teman memakai Qalling dan dapatkan komisi dalam bentuk saldo.",
    steps: [
      "Buka menu Referral untuk melihat tautan undangan Anda.",
      "Bagikan tautan itu; komisi masuk ke saldo setelah syarat program terpenuhi.",
    ],
  },
  {
    id: "tim",
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
