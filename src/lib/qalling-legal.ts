/** Teks hukum umum Qalling (ID/EN). Templat standar layanan SaaS; sebaiknya ditinjau penasihat hukum sebelum dipakai resmi. */
export type LegalSection = { h: string; p: string[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };
export type LegalKey = "terms" | "privacy" | "aup";
export const LEGAL_UPDATED = "2026-11-07";
export const LEGAL_PATH: Record<LegalKey, string> = {
  terms: "/qalling/syarat",
  privacy: "/qalling/privasi",
  aup: "/qalling/penggunaan",
};
const EMAIL = "halo@qalling.id";

export const LEGAL: Record<LegalKey, { id: LegalDoc; en: LegalDoc }> = {
  terms: {
    id: {
      title: "Syarat dan Ketentuan Layanan",
      intro:
        'Dokumen ini mengatur penggunaan Qalling, layanan pengelolaan media sosial, percakapan, dan prospek yang dioperasikan oleh XPERD ("kami"). Dengan mendaftar atau menggunakan Qalling, Anda ("Pengguna") menyatakan telah membaca, memahami, dan menyetujui ketentuan berikut.',
      sections: [
        {
          h: "1. Definisi",
          p: [
            '"Layanan" adalah aplikasi Qalling beserta fitur, API, dan integrasinya. "Akun" adalah akses pribadi Anda ke Layanan. "Workspace" adalah ruang kerja tempat data bisnis Anda disimpan. "Konten" adalah teks, gambar, video, pesan, dan data lain yang Anda masukkan atau kelola melalui Layanan.',
          ],
        },
        {
          h: "2. Kelayakan dan akun",
          p: [
            "Anda harus berusia minimal 18 tahun, atau cakap hukum untuk mengikatkan diri pada perjanjian ini, dan memberikan data pendaftaran yang benar dan terkini.",
            "Anda bertanggung jawab menjaga kerahasiaan akses akun dan atas seluruh aktivitas yang terjadi di dalamnya. Segera hubungi kami bila Anda menduga akun disalahgunakan.",
          ],
        },
        {
          h: "3. Masa percobaan, paket, dan pembayaran",
          p: [
            "Kami dapat menyediakan masa percobaan gratis. Setelah masa percobaan berakhir, fitur tertentu memerlukan langganan berbayar sesuai paket yang Anda pilih.",
            "Harga, batas penggunaan, dan fitur tiap paket ditampilkan di halaman Harga dan dapat berubah dengan pemberitahuan wajar. Perubahan harga tidak berlaku surut untuk periode yang sudah dibayar.",
            "Langganan diperpanjang otomatis sesuai siklus tagihan selama saldo atau metode pembayaran Anda mencukupi. Anda dapat berhenti berlangganan kapan saja; layanan berlaku sampai akhir periode yang sudah dibayar.",
            "Pembayaran yang sudah diterima pada dasarnya tidak dapat dikembalikan, kecuali diwajibkan hukum atau kami nyatakan lain secara tertulis. Pajak yang berlaku dapat ditambahkan.",
          ],
        },
        {
          h: "4. Akun media sosial dan layanan pihak ketiga",
          p: [
            "Layanan terhubung ke platform pihak ketiga (misalnya Instagram, Facebook, TikTok, dan WhatsApp) dan penyedia penerbitan. Anda memberi kami izin untuk bertindak atas nama Anda di akun yang Anda hubungkan, sebatas fungsi yang Anda gunakan, seperti menjadwalkan dan menerbitkan postingan, membaca komentar dan pesan, serta membalasnya.",
            "Anda wajib mematuhi syarat dan kebijakan masing-masing platform. Platform dapat mengubah atau membatasi akses kapan saja, dan kami tidak bertanggung jawab atas gangguan, pembatasan, atau penangguhan akun yang berasal dari platform tersebut.",
          ],
        },
        {
          h: "5. Konten Anda",
          p: [
            "Anda tetap memiliki seluruh hak atas Konten Anda. Anda memberi kami lisensi terbatas, non-eksklusif, dan dapat dicabut untuk menyimpan, memproses, dan menampilkan Konten semata-mata untuk menyediakan Layanan kepada Anda.",
            "Anda menjamin bahwa Anda berhak menggunakan Konten tersebut dan bahwa Konten tidak melanggar hak pihak lain maupun hukum yang berlaku. Anda bertanggung jawab penuh atas pesan yang dikirim kepada pelanggan Anda, termasuk persetujuan penerima untuk dihubungi.",
          ],
        },
        {
          h: "6. Penggunaan yang dilarang",
          p: [
            "Anda wajib mematuhi Kebijakan Penggunaan yang Dapat Diterima. Kami dapat membatasi atau menangguhkan akun yang melanggar ketentuan tersebut.",
          ],
        },
        {
          h: "7. Fitur AI dan integrasi",
          p: [
            "Fitur berbantuan AI menghasilkan saran yang dapat keliru. Anda bertanggung jawab meninjau hasilnya sebelum dipublikasikan atau dikirim. Integrasi melalui MCP/API hanya dapat mengakses data sesuai izin dan paket Anda.",
          ],
        },
        {
          h: "8. Ketersediaan layanan",
          p: [
            "Kami berupaya menjaga Layanan tetap tersedia, tetapi tidak menjamin Layanan bebas gangguan. Pemeliharaan, gangguan jaringan, atau kendala dari pihak ketiga dapat memengaruhi ketersediaan, termasuk ketepatan waktu penerbitan terjadwal.",
          ],
        },
        {
          h: "9. Hak kekayaan intelektual",
          p: [
            "Layanan, merek, logo, tampilan, dan perangkat lunaknya adalah milik kami atau pemberi lisensi kami. Anda tidak boleh menyalin, memodifikasi, melakukan rekayasa balik, atau menjual kembali Layanan, kecuali diizinkan tertulis.",
          ],
        },
        {
          h: "10. Penghentian",
          p: [
            "Anda dapat berhenti menggunakan Layanan kapan saja. Kami dapat menangguhkan atau mengakhiri akses bila Anda melanggar ketentuan ini, tidak membayar tagihan, atau bila diwajibkan hukum.",
            "Setelah akhir langganan, data Anda disimpan untuk jangka waktu wajar agar dapat diekspor, lalu dihapus atau dianonimkan sesuai Kebijakan Privasi.",
          ],
        },
        {
          h: "11. Penafian dan batasan tanggung jawab",
          p: [
            'Layanan disediakan "sebagaimana adanya". Sejauh diizinkan hukum, kami tidak bertanggung jawab atas kerugian tidak langsung, kehilangan keuntungan, atau kehilangan data yang timbul dari penggunaan Layanan.',
            "Total tanggung jawab kami kepada Anda terbatas pada jumlah yang Anda bayarkan untuk Layanan dalam 3 (tiga) bulan terakhir sebelum kejadian yang menimbulkan klaim.",
          ],
        },
        {
          h: "12. Ganti rugi",
          p: [
            "Anda setuju membebaskan kami dari tuntutan pihak ketiga yang timbul karena Konten Anda, pelanggaran ketentuan ini, atau pelanggaran hukum dan hak pihak lain oleh Anda.",
          ],
        },
        {
          h: "13. Perubahan ketentuan",
          p: [
            "Kami dapat memperbarui ketentuan ini dari waktu ke waktu. Perubahan material akan diberitahukan melalui Layanan atau email. Penggunaan Layanan setelah perubahan berlaku berarti Anda menyetujuinya.",
          ],
        },
        {
          h: "14. Hukum yang berlaku dan sengketa",
          p: [
            "Ketentuan ini diatur oleh hukum Republik Indonesia. Sengketa diupayakan diselesaikan secara musyawarah; bila tidak berhasil, sengketa diselesaikan di pengadilan negeri yang berwenang di Jakarta.",
          ],
        },
        { h: "15. Kontak", p: [`Pertanyaan tentang ketentuan ini dapat dikirim ke ${EMAIL}.`] },
      ],
    },
    en: {
      title: "Terms of Service",
      intro:
        'These terms govern your use of Qalling, a social media, conversation and lead management service operated by XPERD ("we"). By registering for or using Qalling, you ("User") confirm that you have read, understood and agree to the following terms.',
      sections: [
        {
          h: "1. Definitions",
          p: [
            '"Service" means the Qalling application, its features, APIs and integrations. "Account" means your personal access to the Service. "Workspace" means the space where your business data is stored. "Content" means text, images, video, messages and other data you enter or manage through the Service.',
          ],
        },
        {
          h: "2. Eligibility and accounts",
          p: [
            "You must be at least 18 years old, or legally able to enter into this agreement, and provide accurate and current registration details.",
            "You are responsible for keeping your credentials confidential and for all activity under your account. Contact us promptly if you suspect misuse.",
          ],
        },
        {
          h: "3. Trial, plans and payment",
          p: [
            "We may offer a free trial. After it ends, some features require a paid subscription for the plan you choose.",
            "Prices, usage limits and features for each plan are shown on the Pricing page and may change with reasonable notice. Price changes do not apply retroactively to periods already paid.",
            "Subscriptions renew automatically each billing cycle as long as your balance or payment method is sufficient. You may cancel at any time; the Service remains available until the end of the paid period.",
            "Payments received are generally non-refundable unless required by law or agreed by us in writing. Applicable taxes may be added.",
          ],
        },
        {
          h: "4. Social accounts and third-party services",
          p: [
            "The Service connects to third-party platforms (such as Instagram, Facebook, TikTok and WhatsApp) and publishing providers. You authorise us to act on your behalf in the accounts you connect, limited to the functions you use, such as scheduling and publishing posts, reading comments and messages, and replying to them.",
            "You must comply with each platform's terms and policies. Platforms may change or restrict access at any time, and we are not responsible for outages, restrictions or suspensions that originate from them.",
          ],
        },
        {
          h: "5. Your Content",
          p: [
            "You retain all rights in your Content. You grant us a limited, non-exclusive, revocable licence to store, process and display Content solely to provide the Service to you.",
            "You warrant that you have the right to use the Content and that it does not infringe the rights of others or applicable law. You are solely responsible for messages sent to your customers, including recipients' consent to be contacted.",
          ],
        },
        {
          h: "6. Prohibited use",
          p: [
            "You must comply with the Acceptable Use Policy. We may restrict or suspend accounts that violate it.",
          ],
        },
        {
          h: "7. AI features and integrations",
          p: [
            "AI-assisted features produce suggestions that may be wrong. You are responsible for reviewing results before publishing or sending them. MCP/API integrations can only access data permitted by your permissions and plan.",
          ],
        },
        {
          h: "8. Availability",
          p: [
            "We work to keep the Service available but do not guarantee it will be uninterrupted. Maintenance, network issues or third-party problems may affect availability, including the timing of scheduled publishing.",
          ],
        },
        {
          h: "9. Intellectual property",
          p: [
            "The Service, its trademarks, logos, design and software belong to us or our licensors. You may not copy, modify, reverse engineer or resell the Service without written permission.",
          ],
        },
        {
          h: "10. Termination",
          p: [
            "You may stop using the Service at any time. We may suspend or end access if you breach these terms, fail to pay, or where required by law.",
            "After a subscription ends, your data is retained for a reasonable period so you can export it, then deleted or anonymised in line with the Privacy Policy.",
          ],
        },
        {
          h: "11. Disclaimer and limitation of liability",
          p: [
            'The Service is provided "as is". To the extent permitted by law, we are not liable for indirect damages, lost profits or data loss arising from use of the Service.',
            "Our total liability to you is limited to the amount you paid for the Service in the 3 (three) months before the event giving rise to the claim.",
          ],
        },
        {
          h: "12. Indemnity",
          p: [
            "You agree to hold us harmless from third-party claims arising from your Content, your breach of these terms, or your violation of law or the rights of others.",
          ],
        },
        {
          h: "13. Changes to these terms",
          p: [
            "We may update these terms from time to time. Material changes will be notified in the Service or by email. Continued use after changes take effect means you accept them.",
          ],
        },
        {
          h: "14. Governing law and disputes",
          p: [
            "These terms are governed by the laws of the Republic of Indonesia. Disputes will first be resolved amicably; failing that, they are submitted to the competent district court in Jakarta.",
          ],
        },
        { h: "15. Contact", p: [`Questions about these terms can be sent to ${EMAIL}.`] },
      ],
    },
  },
  privacy: {
    id: {
      title: "Kebijakan Privasi",
      intro:
        'Kebijakan ini menjelaskan bagaimana XPERD ("kami") mengumpulkan, menggunakan, menyimpan, dan melindungi data pribadi saat Anda menggunakan Qalling, sesuai peraturan pelindungan data pribadi yang berlaku di Indonesia.',
      sections: [
        {
          h: "1. Data yang kami kumpulkan",
          p: [
            "Data akun: nama, alamat email, dan data pendaftaran lain, termasuk akun Google bila Anda masuk dengan Google.",
            "Data bisnis yang Anda masukkan: prospek, kontak, catatan, invoice, jadwal postingan, dan media yang diunggah.",
            "Data dari akun media sosial yang Anda hubungkan: nama akun, postingan, komentar, pesan langsung, dan metrik, sebatas izin yang Anda berikan.",
            "Data teknis: alamat IP, jenis perangkat dan peramban, serta log aktivitas untuk keamanan dan penyelesaian masalah.",
            "Data transaksi: paket, tagihan, dan status pembayaran. Kami tidak menyimpan nomor kartu lengkap.",
          ],
        },
        {
          h: "2. Tujuan penggunaan",
          p: [
            "Kami menggunakan data untuk menyediakan dan mengoperasikan Layanan, memproses pembayaran dan tagihan, mengirim notifikasi dan pengingat, menjaga keamanan, mencegah penyalahgunaan, memperbaiki produk, dan memenuhi kewajiban hukum.",
            "Kami tidak menjual data pribadi Anda.",
          ],
        },
        {
          h: "3. Dasar pemrosesan",
          p: [
            "Kami memproses data berdasarkan persetujuan Anda, kebutuhan untuk melaksanakan perjanjian layanan, kepentingan sah kami yang wajar (misalnya keamanan), dan kewajiban hukum.",
          ],
        },
        {
          h: "4. Data pelanggan Anda",
          p: [
            "Untuk data pelanggan atau prospek yang Anda kelola di Qalling, Anda bertindak sebagai pengendali data dan kami sebagai pemroses yang bertindak sesuai instruksi Anda. Anda bertanggung jawab memiliki dasar hukum, termasuk persetujuan, untuk memproses dan menghubungi mereka.",
          ],
        },
        {
          h: "5. Berbagi data",
          p: [
            "Kami membagikan data hanya kepada penyedia yang membantu menjalankan Layanan, seperti hosting dan infrastruktur, pengiriman email, pembayaran, penerbitan media sosial, dan platform yang Anda hubungkan, serta kepada otoritas bila diwajibkan hukum. Penyedia tersebut terikat kewajiban kerahasiaan dan penggunaan terbatas.",
            "Link publik yang Anda buat (misalnya persetujuan konten, laporan klien, dan invoice) dapat dibuka siapa pun yang memiliki link-nya.",
          ],
        },
        {
          h: "6. Penyimpanan dan keamanan",
          p: [
            "Kami menerapkan langkah teknis dan organisasi yang wajar, seperti enkripsi saat transit, pembatasan akses berbasis peran, dan log audit. Tidak ada sistem yang sepenuhnya bebas risiko, sehingga kami tidak dapat menjamin keamanan mutlak.",
          ],
        },
        {
          h: "7. Retensi",
          p: [
            "Data disimpan selama akun aktif dan selama diperlukan untuk tujuan di atas atau kewajiban hukum, seperti catatan transaksi. Setelah itu data dihapus atau dianonimkan. Anda dapat meminta penghapusan lebih awal sebagaimana dijelaskan di bawah.",
          ],
        },
        {
          h: "8. Hak Anda",
          p: [
            `Anda berhak mengakses, memperbaiki, meminta salinan, membatasi atau menolak pemrosesan, menarik persetujuan, serta meminta penghapusan data pribadi Anda sesuai hukum. Ajukan permintaan ke ${EMAIL}; kami akan menanggapi dalam waktu yang wajar.`,
          ],
        },
        {
          h: "9. Cookie dan penyimpanan lokal",
          p: [
            "Kami memakai cookie dan penyimpanan peramban yang diperlukan untuk sesi masuk, preferensi bahasa, dan menyimpan kode referral selama 30 hari. Anda dapat menghapusnya lewat pengaturan peramban, tetapi sebagian fitur mungkin tidak berfungsi.",
          ],
        },
        {
          h: "10. Transfer lintas negara",
          p: [
            "Sebagian penyedia kami dapat memproses data di luar Indonesia. Kami berupaya memastikan pelindungan yang setara sesuai hukum yang berlaku.",
          ],
        },
        {
          h: "11. Anak-anak",
          p: [
            "Layanan tidak ditujukan bagi anak di bawah 18 tahun dan kami tidak dengan sengaja mengumpulkan data anak.",
          ],
        },
        {
          h: "12. Pemberitahuan insiden",
          p: [
            "Bila terjadi kegagalan pelindungan data pribadi yang berdampak pada Anda, kami akan memberitahukan sesuai ketentuan hukum yang berlaku.",
          ],
        },
        {
          h: "13. Perubahan kebijakan",
          p: [
            "Kami dapat memperbarui kebijakan ini. Perubahan material akan diberitahukan melalui Layanan atau email, dan tanggal pembaruan tertera di halaman ini.",
          ],
        },
        {
          h: "14. Kontak",
          p: [`Pertanyaan atau permintaan terkait data pribadi dapat dikirim ke ${EMAIL}.`],
        },
      ],
    },
    en: {
      title: "Privacy Policy",
      intro:
        'This policy explains how XPERD ("we") collects, uses, stores and protects personal data when you use Qalling, in line with applicable personal data protection regulations in Indonesia.',
      sections: [
        {
          h: "1. Data we collect",
          p: [
            "Account data: name, email address and other registration details, including your Google account if you sign in with Google.",
            "Business data you enter: leads, contacts, notes, invoices, post schedules and uploaded media.",
            "Data from the social accounts you connect: account name, posts, comments, direct messages and metrics, within the permissions you grant.",
            "Technical data: IP address, device and browser type, and activity logs for security and troubleshooting.",
            "Transaction data: plan, billing and payment status. We do not store full card numbers.",
          ],
        },
        {
          h: "2. How we use data",
          p: [
            "We use data to provide and operate the Service, process payments and billing, send notifications and reminders, keep the Service secure, prevent abuse, improve the product, and meet legal obligations.",
            "We do not sell your personal data.",
          ],
        },
        {
          h: "3. Legal bases",
          p: [
            "We process data based on your consent, the need to perform the service agreement, our reasonable legitimate interests (such as security), and legal obligations.",
          ],
        },
        {
          h: "4. Your customers' data",
          p: [
            "For customer or lead data you manage in Qalling, you act as the data controller and we act as a processor following your instructions. You are responsible for having a legal basis, including consent, to process and contact them.",
          ],
        },
        {
          h: "5. Sharing",
          p: [
            "We share data only with providers that help run the Service, such as hosting and infrastructure, email delivery, payments, social publishing and the platforms you connect, and with authorities where required by law. These providers are bound by confidentiality and limited-use obligations.",
            "Public links you create (for example content approvals, client reports and invoices) can be opened by anyone who has the link.",
          ],
        },
        {
          h: "6. Storage and security",
          p: [
            "We apply reasonable technical and organisational measures, such as encryption in transit, role-based access control and audit logs. No system is entirely risk-free, so we cannot guarantee absolute security.",
          ],
        },
        {
          h: "7. Retention",
          p: [
            "Data is kept while your account is active and as long as needed for the purposes above or for legal obligations, such as transaction records. After that it is deleted or anonymised. You can request earlier deletion as described below.",
          ],
        },
        {
          h: "8. Your rights",
          p: [
            `You have the right to access, correct, obtain a copy of, restrict or object to the processing of, withdraw consent for, and request deletion of your personal data, as provided by law. Send requests to ${EMAIL}; we will respond within a reasonable time.`,
          ],
        },
        {
          h: "9. Cookies and local storage",
          p: [
            "We use cookies and browser storage that are necessary for sign-in sessions, language preference and keeping a referral code for 30 days. You can clear them in your browser settings, but some features may not work.",
          ],
        },
        {
          h: "10. Cross-border transfers",
          p: [
            "Some of our providers may process data outside Indonesia. We work to ensure equivalent protection as required by applicable law.",
          ],
        },
        {
          h: "11. Children",
          p: [
            "The Service is not intended for anyone under 18 and we do not knowingly collect children's data.",
          ],
        },
        {
          h: "12. Incident notification",
          p: [
            "If a personal data protection failure affects you, we will notify you as required by applicable law.",
          ],
        },
        {
          h: "13. Changes to this policy",
          p: [
            "We may update this policy. Material changes will be notified in the Service or by email, and the update date is shown on this page.",
          ],
        },
        {
          h: "14. Contact",
          p: [`Questions or requests about personal data can be sent to ${EMAIL}.`],
        },
      ],
    },
  },
  aup: {
    id: {
      title: "Kebijakan Penggunaan yang Dapat Diterima",
      intro:
        "Kebijakan ini melengkapi Syarat dan Ketentuan dan menjelaskan hal yang dilarang saat menggunakan Qalling.",
      sections: [
        {
          h: "1. Larangan umum",
          p: [
            "Anda tidak boleh menggunakan Layanan untuk melanggar hukum atau hak pihak lain; menyebarkan konten ilegal, menyesatkan, memfitnah, pornografi, atau mendorong kekerasan, kebencian, dan diskriminasi; menyamar sebagai orang atau organisasi lain; atau menjual barang dan jasa yang dilarang.",
          ],
        },
        {
          h: "2. Spam dan pesan massal",
          p: [
            "Dilarang mengirim pesan, komentar, atau DM yang tidak diminta secara massal, membeli atau menjual interaksi palsu, dan menghubungi orang yang telah meminta berhenti. Anda wajib memiliki dasar persetujuan yang sah dan menyediakan cara berhenti menerima pesan.",
          ],
        },
        {
          h: "3. Kepatuhan platform",
          p: [
            "Anda wajib mematuhi aturan Instagram, Facebook, TikTok, WhatsApp, dan platform lain yang dihubungkan, termasuk batas frekuensi, aturan iklan, dan larangan otomatisasi tertentu. Layanan tidak boleh dipakai untuk menghindari batasan atau penangguhan platform.",
          ],
        },
        {
          h: "4. Keamanan sistem",
          p: [
            "Dilarang mencoba mengakses akun atau data pihak lain tanpa izin, menguji kerentanan tanpa persetujuan tertulis, menyebarkan malware, mengganggu atau membebani infrastruktur, melakukan scraping berlebihan, atau menyalahgunakan API dan token akses.",
          ],
        },
        {
          h: "5. Data pribadi",
          p: [
            "Jangan mengunggah atau memproses data sensitif (misalnya data kesehatan, identitas resmi, atau data finansial pihak lain) tanpa dasar hukum dan pengamanan yang memadai.",
          ],
        },
        {
          h: "6. Konten AI",
          p: [
            "Anda bertanggung jawab atas hasil AI yang Anda publikasikan dan tidak boleh memakainya untuk menipu, menyamar, atau memproduksi disinformasi.",
          ],
        },
        {
          h: "7. Penegakan",
          p: [
            `Pelanggaran dapat berujung pada peringatan, pembatasan fitur, penangguhan, atau penghentian akun tanpa pengembalian dana, serta pelaporan kepada pihak berwenang bila perlu. Laporkan penyalahgunaan ke ${EMAIL}.`,
          ],
        },
      ],
    },
    en: {
      title: "Acceptable Use Policy",
      intro:
        "This policy supplements the Terms of Service and describes what is prohibited when using Qalling.",
      sections: [
        {
          h: "1. General restrictions",
          p: [
            "You may not use the Service to break the law or infringe others' rights; distribute illegal, misleading, defamatory or pornographic content or content that promotes violence, hatred or discrimination; impersonate a person or organisation; or sell prohibited goods and services.",
          ],
        },
        {
          h: "2. Spam and bulk messaging",
          p: [
            "Do not send unsolicited bulk messages, comments or DMs, buy or sell fake engagement, or contact people who have asked you to stop. You must have a valid basis for consent and provide a way to opt out.",
          ],
        },
        {
          h: "3. Platform compliance",
          p: [
            "You must follow the rules of Instagram, Facebook, TikTok, WhatsApp and other connected platforms, including rate limits, advertising rules and restrictions on certain automation. The Service must not be used to evade platform limits or suspensions.",
          ],
        },
        {
          h: "4. System security",
          p: [
            "Do not attempt to access others' accounts or data without permission, test for vulnerabilities without written consent, distribute malware, disrupt or overload infrastructure, scrape excessively, or misuse APIs and access tokens.",
          ],
        },
        {
          h: "5. Personal data",
          p: [
            "Do not upload or process sensitive data (such as health data, official identity documents or others' financial data) without a legal basis and adequate safeguards.",
          ],
        },
        {
          h: "6. AI content",
          p: [
            "You are responsible for AI output you publish and must not use it to deceive, impersonate or produce disinformation.",
          ],
        },
        {
          h: "7. Enforcement",
          p: [
            `Violations may lead to a warning, feature restrictions, suspension or termination of your account without refund, and reporting to authorities where necessary. Report abuse to ${EMAIL}.`,
          ],
        },
      ],
    },
  },
};
