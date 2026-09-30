/** Bilingual in-app user manual content for every XPERD One module. */

export interface GuideStep {
  en: string;
  id: string;
}

export interface GuideSection {
  /** Matches AppModule.id, or a custom key for general topics. */
  id: string;
  titleEn: string;
  titleId: string;
  summaryEn: string;
  summaryId: string;
  steps: GuideStep[];
  tips?: GuideStep[];
}

const st = (en: string, id: string): GuideStep => ({ en, id });

export const GUIDE_BASICS: GuideSection[] = [
  {
    id: "getting-started",
    titleEn: "Getting started",
    titleId: "Memulai",
    summaryEn: "From signing in to the first transaction inside a workspace.",
    summaryId: "Dari masuk akun sampai transaksi pertama di dalam workspace.",
    steps: [
      st(
        "Sign in at /auth with the account e-mail and password given after registration.",
        "Masuk di /auth memakai e-mail dan kata sandi akun yang diberikan setelah registrasi.",
      ),
      st(
        "Pick a workspace on the workspace page. One workspace equals one company/branch bookkeeping set.",
        "Pilih workspace pada halaman workspace. Satu workspace sama dengan satu set pembukuan perusahaan/cabang.",
      ),
      st(
        "The launcher shows every module as a card. Click a card to open the module and its sidebar of submodules.",
        "Peluncur menampilkan setiap modul sebagai kartu. Klik kartu untuk membuka modul beserta sidebar sub modulnya.",
      ),
      st(
        "Use the top bar to switch workspace, search, open the AI assistant, change language (EN/ID) and switch light/dark theme.",
        "Gunakan bilah atas untuk ganti workspace, pencarian, membuka AI assistant, mengganti bahasa (EN/ID), dan tema terang/gelap.",
      ),
      st(
        "Before transacting, complete Settings (company profile, currency, fiscal year) and Master Data (items, partners, warehouses, taxes, chart of accounts).",
        "Sebelum bertransaksi, lengkapi Pengaturan (profil perusahaan, mata uang, tahun fiskal) dan Master Data (item, mitra, gudang, pajak, bagan akun).",
      ),
    ],
    tips: [
      st(
        "Every list supports search, date-range filter, pagination, Excel import and PDF/print export.",
        "Setiap daftar mendukung pencarian, filter rentang tanggal, pagination, impor Excel, dan ekspor PDF/cetak.",
      ),
      st(
        "Documents saved as Draft can still be edited; once posted they create journals and stock movements.",
        "Dokumen berstatus Draft masih bisa diubah; setelah diposting akan membuat jurnal dan mutasi stok.",
      ),
    ],
  },
  {
    id: "workspace-utilities",
    titleEn: "Team, Settings, Billing & Backup",
    titleId: "Tim, Pengaturan, Tagihan & Backup",
    summaryEn: "Workspace level utilities available from the launcher.",
    summaryId: "Utilitas tingkat workspace yang tersedia dari peluncur.",
    steps: [
      st(
        "Team: give a tenant user access to this workspace and set the role (Admin, Staff, Viewer).",
        "Tim: beri akses user tenant ke workspace ini dan tentukan perannya (Admin, Staff, Viewer).",
      ),
      st(
        "Settings: company identity, bank accounts for documents, costing method and the invoice print template (classic, modern, minimal).",
        "Pengaturan: identitas perusahaan, rekening bank untuk dokumen, metode costing, dan template cetak invoice (classic, modern, minimal).",
      ),
      st(
        "Billing & Package: subscription status, monthly invoices, online payment and paid add-ons such as Qalling CRM.",
        "Tagihan & Paket: status langganan, tagihan bulanan, pembayaran online, dan add-on berbayar seperti Qalling CRM.",
      ),
      st(
        "Backup & Restore: export a workspace snapshot to JSON, restore master data, or load default starter data.",
        "Backup & Restore: ekspor cadangan workspace ke JSON, pulihkan master data, atau muat data default.",
      ),
    ],
  },
];

export const GUIDE_MODULES: GuideSection[] = [
  {
    id: "master-data",
    titleEn: "Master Data",
    titleId: "Master Data",
    summaryEn: "The single source of truth used by every transaction module.",
    summaryId: "Sumber data utama yang dipakai semua modul transaksi.",
    steps: [
      st(
        "Create Units of Measure and Categories first, then Items (code, name, sales price, cost, unit, tax).",
        "Buat Satuan dan Kategori lebih dulu, lalu Item (kode, nama, harga jual, harga pokok, satuan, pajak).",
      ),
      st(
        "Register Customers and Suppliers with tax ID, address and contact so documents print completely.",
        "Daftarkan Pelanggan dan Pemasok dengan NPWP, alamat, dan kontak agar dokumen tercetak lengkap.",
      ),
      st("Add Warehouses for every stock location, including consignment or store locations.", "Tambahkan Gudang untuk setiap lokasi stok, termasuk lokasi konsinyasi atau toko."),
      st(
        "Fill Tax Rates (PPN 11%, PPh, non-tax) — these appear in the tax dropdown on purchase and sales lines.",
        "Isi Master Pajak (PPN 11%, PPh, non-pajak) — ini muncul pada pilihan pajak di baris pembelian dan penjualan.",
      ),
      st(
        "Review the Chart of Accounts. A standard Indonesian COA is seeded automatically; add or rename accounts as needed.",
        "Periksa Bagan Akun. COA standar Indonesia dibuat otomatis; tambah atau ubah nama akun sesuai kebutuhan.",
      ),
    ],
    tips: [
      st("Use Excel import to load hundreds of items or partners at once.", "Gunakan impor Excel untuk memuat ratusan item atau mitra sekaligus."),
      st("Do not delete an account already used by journals; deactivate it instead.", "Jangan hapus akun yang sudah dipakai jurnal; nonaktifkan saja."),
    ],
  },
  {
    id: "procurement",
    titleEn: "Procurement",
    titleId: "Pembelian",
    summaryEn: "Purchase cycle from request to supplier payment.",
    summaryId: "Siklus pembelian dari permintaan sampai pembayaran pemasok.",
    steps: [
      st("Purchase Request: internal need from a department; approve it before ordering.", "Permintaan Pembelian: kebutuhan internal dari divisi; setujui sebelum memesan."),
      st(
        "Purchase Order: choose supplier, lines, tax and delivery date, then post it to send to the supplier.",
        "Pesanan Pembelian: pilih pemasok, baris item, pajak, dan tanggal kirim, lalu posting untuk dikirim ke pemasok.",
      ),
      st(
        "Goods Receipt: create it from the PO so quantities are copied. Posting increases stock and posts inventory vs GR-clearing journal.",
        "Penerimaan Barang: buat dari PO agar kuantitas tersalin. Posting menaikkan stok dan mencatat jurnal persediaan vs kliring penerimaan.",
      ),
      st(
        "AP Invoice: create it from the Goods Receipt, match the supplier invoice number and tax, then post to record payables.",
        "Faktur Hutang: buat dari Penerimaan Barang, samakan nomor faktur pemasok dan pajaknya, lalu posting untuk mencatat hutang.",
      ),
      st("Payments: settle the AP invoice from a cash or bank account, partially or in full.", "Pembayaran: lunasi faktur hutang dari akun kas atau bank, sebagian atau penuh."),
      st("Purchase Returns: send goods back; stock and payables are reversed.", "Retur Pembelian: kembalikan barang; stok dan hutang dibalik."),
    ],
    tips: [
      st("Always start the next document from the previous one to avoid retyping.", "Selalu mulai dokumen berikutnya dari dokumen sebelumnya agar tidak mengetik ulang."),
    ],
  },
  {
    id: "inventory",
    titleEn: "Inventory",
    titleId: "Persediaan",
    summaryEn: "Stock balances, movements and valuation per warehouse.",
    summaryId: "Saldo stok, mutasi, dan penilaian per gudang.",
    steps: [
      st("Stock Overview: current quantity and value per item and warehouse.", "Ringkasan Stok: kuantitas dan nilai terkini per item dan gudang."),
      st("Stock In / Stock Out: manual adjustments for items not covered by purchase or sales documents.", "Barang Masuk / Keluar: penyesuaian manual untuk barang di luar dokumen pembelian atau penjualan."),
      st("Transfers: move stock between warehouses; total quantity stays the same.", "Transfer Gudang: pindahkan stok antar gudang; total kuantitas tetap."),
      st("Stock Opname: enter the counted quantity, the system posts the variance to the inventory adjustment account.", "Stok Opname: masukkan hasil hitung fisik, sistem memposting selisihnya ke akun penyesuaian persediaan."),
      st("Valuation: inventory value using the average cost method, ready for the balance sheet.", "Penilaian Persediaan: nilai persediaan dengan metode average cost, siap untuk neraca."),
    ],
    tips: [st("Do opname per warehouse at period end before closing the books.", "Lakukan opname per gudang di akhir periode sebelum tutup buku.")],
  },
  {
    id: "sales",
    titleEn: "Sales & POS",
    titleId: "Penjualan & POS",
    summaryEn: "Quotation to cash, plus a point of sale register and shipping scan.",
    summaryId: "Dari penawaran sampai kas masuk, plus kasir POS dan scan pengiriman.",
    steps: [
      st("Quotation: price offer to a customer; can be created automatically from a CRM lead.", "Penawaran: penawaran harga ke pelanggan; bisa dibuat otomatis dari prospek CRM."),
      st("Sales Order: create from the quotation once the customer agrees.", "Pesanan Penjualan: buat dari penawaran setelah pelanggan setuju."),
      st(
        "Delivery Order: create from the SO. Posting reduces stock and books cost of goods sold automatically.",
        "Surat Jalan: buat dari SO. Posting mengurangi stok dan mencatat harga pokok penjualan otomatis.",
      ),
      st(
        "Shipping Scan: scan marketplace waybills (Shopee, Tokopedia, etc.) with a barcode reader to tick off shipments quickly.",
        "Scan Pengiriman: pindai resi marketplace (Shopee, Tokopedia, dll.) dengan barcode reader untuk mencentang pengiriman dengan cepat.",
      ),
      st("AR Invoice: create from the delivery order; posting records receivables and revenue.", "Faktur Piutang: buat dari surat jalan; posting mencatat piutang dan pendapatan."),
      st("Receipts: record customer payment into cash or bank.", "Penerimaan Pembayaran: catat pembayaran pelanggan ke kas atau bank."),
      st(
        "Point of Sale: fast counter checkout — scan or pick items, take payment, print the receipt; stock and journals post instantly.",
        "Point of Sale: kasir cepat — pindai atau pilih item, terima pembayaran, cetak nota; stok dan jurnal langsung terposting.",
      ),
      st("Sales Returns: goods coming back; stock and receivables are reversed.", "Retur Penjualan: barang kembali; stok dan piutang dibalik."),
    ],
    tips: [
      st("Print or download any document as PDF using the chosen invoice template.", "Cetak atau unduh dokumen apa pun sebagai PDF dengan template invoice yang dipilih."),
    ],
  },
  {
    id: "cash-bank",
    titleEn: "Cash & Bank",
    titleId: "Kas & Bank",
    summaryEn: "All money in and out plus bank reconciliation.",
    summaryId: "Semua uang masuk dan keluar plus rekonsiliasi bank.",
    steps: [
      st("Accounts: register every cash drawer and bank account with its opening balance.", "Akun Kas & Bank: daftarkan setiap kas dan rekening bank beserta saldo awalnya."),
      st("Cash In / Cash Out: non-trade receipts and expenses (rent, salary, other income).", "Kas Masuk / Keluar: penerimaan dan pengeluaran non-dagang (sewa, gaji, pendapatan lain)."),
      st("Fund Transfers: move money between your own accounts.", "Transfer Dana: pindahkan uang antar akun sendiri."),
      st("Reconciliation: match book entries against the bank statement and mark cleared items.", "Rekonsiliasi Bank: cocokkan catatan buku dengan rekening koran dan tandai yang sudah clear."),
    ],
  },
  {
    id: "accounting",
    titleEn: "Accounting",
    titleId: "Akuntansi",
    summaryEn: "Journals, ledger, financial statements and period closing.",
    summaryId: "Jurnal, buku besar, laporan keuangan, dan tutup periode.",
    steps: [
      st(
        "Opening Balance: enter starting balances once when migrating from your old system; it posts to the general ledger.",
        "Saldo Awal: masukkan saldo awal sekali saat migrasi dari sistem lama; akan terposting ke buku besar.",
      ),
      st("Journal Entries: manual journals for accruals or corrections; debit must equal credit.", "Jurnal Umum: jurnal manual untuk akrual atau koreksi; debit harus sama dengan kredit."),
      st("General Ledger: per-account movement with drill-down to the source document.", "Buku Besar: mutasi per akun dengan penelusuran ke dokumen sumber."),
      st("Trial Balance: all account balances for a period — the check before reporting.", "Neraca Saldo: saldo semua akun untuk suatu periode — pemeriksaan sebelum pelaporan."),
      st(
        "Balance Sheet, Profit & Loss, Cash Flow and Changes in Equity: pick the period and export to PDF or Excel.",
        "Neraca, Laba Rugi, Arus Kas, dan Perubahan Ekuitas: pilih periode lalu ekspor ke PDF atau Excel.",
      ),
      st("Period Closing: lock a period so posted transactions can no longer change.", "Tutup Periode: kunci periode agar transaksi yang sudah diposting tidak bisa berubah."),
    ],
    tips: [
      st("If the balance sheet is unbalanced, check the trial balance and unposted opening balance first.", "Jika neraca tidak seimbang, periksa neraca saldo dan saldo awal yang belum diposting lebih dulu."),
    ],
  },
  {
    id: "fixed-asset",
    titleEn: "Fixed Assets",
    titleId: "Aset Tetap",
    summaryEn: "Asset register, depreciation schedule and disposal.",
    summaryId: "Daftar aset, jadwal penyusutan, dan pelepasan aset.",
    steps: [
      st("Asset Register: record acquisition date, cost, useful life, residual value and method.", "Daftar Aset: catat tanggal perolehan, harga, masa manfaat, nilai residu, dan metode."),
      st("Depreciation: run it monthly — straight line or declining balance — journals post automatically.", "Penyusutan: jalankan bulanan — garis lurus atau saldo menurun — jurnal terposting otomatis."),
      st("Disposal: sell or write off an asset; gain/loss is calculated from the remaining book value.", "Pelepasan Aset: jual atau hapus buku aset; laba/rugi dihitung dari nilai buku tersisa."),
    ],
  },
  {
    id: "tax",
    titleEn: "Tax",
    titleId: "Perpajakan",
    summaryEn: "VAT in/out, withholding tax and e-filing exports.",
    summaryId: "PPN masukan/keluaran, PPh potong pungut, dan ekspor e-filing.",
    steps: [
      st("Input VAT: taken from posted AP invoices with a tax rate attached.", "PPN Masukan: diambil dari faktur hutang terposting yang memiliki pajak."),
      st("Output VAT: taken from posted AR invoices and POS sales.", "PPN Keluaran: diambil dari faktur piutang terposting dan penjualan POS."),
      st("Withholding Tax: record PPh cut on vendor payments or received on your invoices.", "PPh Potong Pungut: catat PPh yang dipotong atas pembayaran vendor atau atas faktur Anda."),
      st("e-Faktur & e-Bupot: export the period file to be uploaded to the tax portal.", "e-Faktur & e-Bupot: ekspor berkas periode untuk diunggah ke portal pajak."),
    ],
    tips: [st("Make sure the customer/supplier tax ID is filled before exporting.", "Pastikan NPWP pelanggan/pemasok terisi sebelum ekspor.")],
  },
  {
    id: "reporting",
    titleEn: "Reporting & BI",
    titleId: "Laporan & BI",
    summaryEn: "Dashboards and analytics across sales, purchasing, inventory and finance.",
    summaryId: "Dasbor dan analitik untuk penjualan, pembelian, persediaan, dan keuangan.",
    steps: [
      st("Executive Dashboard: revenue, gross margin, cash position and top movers at a glance.", "Dasbor Eksekutif: pendapatan, margin kotor, posisi kas, dan penggerak utama sekilas."),
      st("Sales / Purchasing / Inventory Analytics: trends per period, per customer, per item.", "Analitik Penjualan / Pembelian / Persediaan: tren per periode, per pelanggan, per item."),
      st("Financial Reports: the standard statement set in a report-ready layout.", "Laporan Keuangan: set laporan standar dengan tata letak siap cetak."),
      st("Data Exports: download any dataset as Excel or PDF for auditors and investors.", "Ekspor Data: unduh kumpulan data sebagai Excel atau PDF untuk auditor dan investor."),
    ],
  },
  {
    id: "crm",
    titleEn: "Qalling CRM (add-on)",
    titleId: "Qalling CRM (add-on)",
    summaryEn: "Paid add-on for leads, pipeline, follow-up, broadcast and campaigns.",
    summaryId: "Add-on berbayar untuk prospek, pipeline, follow up, broadcast, dan kampanye.",
    steps: [
      st("Activate the Qalling add-on from Billing & Package before the module opens.", "Aktifkan add-on Qalling dari Tagihan & Paket sebelum modul bisa dibuka."),
      st("Leads: add prospects manually, by Excel import (duplicate detection) or via the public web-to-lead form.", "Prospek: tambah manual, impor Excel (deteksi duplikat), atau lewat form web-to-lead publik."),
      st("Assign an owner from the workspace members and use the \"My leads\" filter for each sales person.", "Tetapkan pemilik dari anggota workspace dan pakai filter \"Prospek saya\" untuk masing-masing sales."),
      st("Pipeline: drag a lead across stages; probability and stage age update automatically.", "Pipeline: geser prospek antar tahap; probabilitas dan umur tahap ter-update otomatis."),
      st("Follow Ups: log calls, WhatsApp, e-mail or meetings and set the next due date; due reminders are sent daily.", "Follow Up: catat telepon, WhatsApp, e-mail, atau meeting dan tentukan jatuh tempo berikutnya; pengingat dikirim harian."),
      st("Convert to Quotation: one click creates the customer (if new) plus a draft quotation in Sales.", "Convert ke Quotation: sekali klik membuat pelanggan (jika baru) plus penawaran draft di modul Sales."),
      st("Broadcast: send templated messages to a lead segment via WhatsApp, e-mail or SMS and track delivery.", "Broadcast: kirim pesan bertemplate ke segmen prospek lewat WhatsApp, e-mail, atau SMS dan pantau pengirimannya."),
      st("WhatsApp Gateway: choose manual wa.me links or a custom HTTP gateway with your API token.", "WhatsApp Gateway: pilih tautan wa.me manual atau gateway HTTP kustom dengan token API Anda."),
      st("Social Campaigns: plan campaigns per platform and record reach, clicks and leads generated.", "Kampanye Sosial: rencanakan kampanye per platform dan catat jangkauan, klik, serta prospek yang dihasilkan."),
      st("Templates & Sales Targets: reusable messages with {{name}} and monthly target vs attainment per sales.", "Template & Target Sales: pesan siap pakai dengan {{name}} serta target bulanan vs pencapaian per sales."),
      st("CRM Dashboard: pipeline value, weighted forecast, win rate, stalled leads and lost-reason analysis.", "Dasbor CRM: nilai pipeline, forecast tertimbang, win rate, prospek mandek, dan analisis alasan kalah."),
      // #62 (BS New 3): panduan Tender Checklist.
      st("Tender Checklist: create a tender with agency, HPS and submission deadline; a standard 26-document checklist is filled in automatically.", "Checklist Tender: buat tender dengan instansi, HPS, dan batas waktu; checklist standar 26 dokumen terisi otomatis."),
      st("Tick each document (or set its status), mark which ones are mandatory, and fill in PIC plus the validity date so expired documents are flagged.", "Centang setiap dokumen (atau ubah statusnya), tandai mana yang wajib, lalu isi PIC dan tanggal berlaku agar dokumen kedaluwarsa ditandai."),
      st("The eligibility card turns green only when every mandatory document is ready and still valid — then print the evaluation sheet or export the package.", "Kartu kelayakan baru berwarna hijau bila semua dokumen wajib siap dan masih berlaku — lalu cetak lembar evaluasi atau ekspor paketnya."),
      // #62 (BS New 3): panduan Pustaka Dokumen.
      st("Document Library: upload legal & qualification files (NIB, NPWP, akta, sertifikat) once with their validity date; files are stored on the workspace server and can be reused in every tender.", "Pustaka Dokumen: unggah berkas legal & kualifikasi (NIB, NPWP, akta, sertifikat) sekali beserta tanggal berlakunya; berkas disimpan di server workspace dan bisa dipakai ulang di setiap tender."),
      st("Replacing an existing document keeps the previous file as a version history (v2, v3, …) so audits stay traceable.", "Mengganti dokumen yang ada menyimpan berkas lama sebagai riwayat versi (v2, v3, …) sehingga jejak audit tetap ada."),
      st("In a tender checklist, pick a document from the library or press “Autofill from library”; documents expiring within 30 days are flagged in the CRM dashboard.", "Di checklist tender, ambil dokumen dari pustaka atau tekan “Isi otomatis dari pustaka”; dokumen yang habis dalam ≤30 hari ditandai di dasbor CRM."),
    ],
  },
  {
    id: "manufacturing",
    titleEn: "Manufacturing (coming soon)",
    titleId: "Manufaktur (segera)",
    summaryEn: "Bill of materials, work orders and production costing — in development.",
    summaryId: "BOM, perintah kerja, dan biaya produksi — masih dalam pengembangan.",
    steps: [
      st("Planned: define a BOM per finished good, release work orders, and absorb material plus overhead cost.", "Rencana: susun BOM per barang jadi, terbitkan perintah kerja, dan serap biaya material serta overhead."),
    ],
  },
  {
    id: "hr",
    titleEn: "Slipp HR (add-on)",
    titleId: "Slipp HR (add-on)",
    summaryEn:
      "Employees, salary components, monthly payroll, payslips, BPJS and PPh 21 TER. Billed Rp15,000 per employee per month.",
    summaryId:
      "Karyawan, komponen gaji, payroll bulanan, slip gaji, BPJS, dan PPh 21 TER. Biaya Rp15.000 per karyawan per bulan.",
    steps: [
      st(
        "Salary Components: click 'Load defaults' or add your own allowances/deductions, marking fixed and taxable ones.",
        "Komponen Gaji: klik 'Muat komponen default' atau tambah tunjangan/potongan sendiri, tandai yang tetap dan kena pajak.",
      ),
      st(
        "Employees: fill in PTKP status, base salary, bank account, BPJS participation and component amounts. The right panel shows an estimated take-home pay.",
        "Data Karyawan: isi status PTKP, gaji pokok, rekening, kepesertaan BPJS, dan nominal komponen. Panel kanan menampilkan estimasi gaji bersih.",
      ),
      st(
        "Payroll: choose period, pay date and paying bank, then Generate. Review each payslip and print them.",
        "Payroll: pilih periode, tanggal bayar, dan bank pembayar, lalu Proses. Periksa slip tiap karyawan dan cetak.",
      ),
      st(
        "Approve & post journal: salary and BPJS expense, BPJS and PPh 21 payables, and the bank payment are posted to the ledger automatically.",
        "Setujui & posting jurnal: beban gaji dan BPJS, hutang BPJS dan PPh 21, serta pembayaran bank otomatis masuk buku besar.",
      ),
      st(
        "BPJS & PPh 21: monthly recap per employee for depositing contributions and tax.",
        "BPJS & PPh 21: rekap bulanan per karyawan untuk setor iuran dan pajak.",
      ),
    ],
  },
];

export const GUIDE_SECTIONS: GuideSection[] = [...GUIDE_BASICS, ...GUIDE_MODULES];

export function guideMatches(section: GuideSection, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    section.titleEn,
    section.titleId,
    section.summaryEn,
    section.summaryId,
    ...section.steps.flatMap((s) => [s.en, s.id]),
    ...(section.tips ?? []).flatMap((s) => [s.en, s.id]),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
