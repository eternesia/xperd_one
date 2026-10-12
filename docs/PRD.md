# PRD — Xperd One (Old Production)

> Status: hidup · Pemilik produk: Xperd · Referensi perilaku: https://xperd-one.lovable.app

## 1. Ringkasan

**Xperd One** adalah suite bisnis multi-tenant (ERP + CRM + HR) untuk UKM
Indonesia: master data, pembelian, persediaan, penjualan & POS, kas & bank,
akuntansi, aset tetap, pajak, pelaporan, CRM (Qalling), HR & payroll (Slipp HR),
dan Omnix. Satu akun dapat memiliki beberapa *workspace*; fitur tambahan dibuka
lewat paket langganan dan *add-on*.

## 2. Apa project ini sebenarnya: porting Lovable → produksi nyata

Repo ini **bukan produk baru dan bukan desain ulang**. Ini adalah **porting**
dari versi prototipe **Lovable** (`xperd-one.lovable.app`, kode di folder
`Xperd One Business Suite*`, berbasis **Supabase**) ke versi **produksi nyata**
yang berjalan di infrastruktur sendiri (**TanStack Start + MySQL**, Docker,
JWT cookie, penyimpanan berkas lokal).

| Aspek | Versi Lovable (referensi) | Versi ini (produksi) |
|---|---|---|
| Database | Supabase Postgres (+ RLS, trigger, RPC) | MySQL 8.4, **tanpa trigger/fungsi DB** |
| Auth | Supabase Auth | JWT di cookie httpOnly `xperd_token` |
| Akses data | `supabase.from(...)` dari klien | Server function (`*.functions.ts`) + `mysql2` |
| Logika uang/status | Trigger/RPC | Transaksi aplikasi (`transaction()` + `SELECT … FOR UPDATE`) |
| Berkas | Supabase Storage | `STORAGE_DIR` / volume `local-storage` |
| Deploy | Hosting Lovable | Docker (`Dockerfile.prod`, `docker-compose.prod.yml`) |
| UI/UX, alur, teks, modul | **Sumber kebenaran** | **Harus sama** |

Lovable terus menghasilkan ekspor baru (`Business Suite New`, `New 2`, `New 3`,
`New 4`, `New 8`, …). Setiap ekspor di-diff terhadap repo ini lalu fitur yang
hilang di-port. Riwayatnya ada di [`PARITY-BS-NEW-VS-OLD.md`](PARITY-BS-NEW-VS-OLD.md),
[`PARITY-BS-NEW3-VS-OLD.md`](PARITY-BS-NEW3-VS-OLD.md),
[`FEATURE-PORT-MATRIX.md`](FEATURE-PORT-MATRIX.md) dan
[`SLIPP-HR-PORTING.md`](SLIPP-HR-PORTING.md).

## 3. Tujuan

1. **Paritas perilaku** dengan versi Lovable: pengguna tidak merasakan beda
   alur, label, validasi, maupun hasil angka. Lihat [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md).
2. **Layak produksi**: data tersimpan di MySQL milik sendiri, aman (JWT, guard
   wipe, secret hook), bisa dibackup, bisa di-deploy dengan Docker.
3. **Tetap bisa menerima ekspor Lovable berikutnya** tanpa menulis ulang
   (data-layer dipisah dari UI sehingga diff tetap kecil).

Bukan tujuan: mengubah desain, menambah fitur yang tidak ada di Lovable tanpa
persetujuan pemilik produk, atau kembali memakai Supabase.

## 4. Pengguna

| Peran | Kebutuhan utama |
|---|---|
| Superadmin platform | Kelola tenant, registrasi, paket, add-on, invoice/pembayaran, tiket, konten situs, pengguna (`/app-admin`) |
| Owner / admin tenant | Setup workspace, tim & role, billing, branding dokumen, backup/restore |
| Staff | Operasional harian: dokumen jual/beli, stok, kas, jurnal |
| Viewer | Hanya lihat laporan/dokumen |
| Calon pelanggan | Marketing site, registrasi online, kontak sales |

## 5. Lingkup fitur

**Marketing site (`_site`)** — Home, Products, Solutions, Industries, Technology,
Pricing, About, Resources, Contact, Register; dwibahasa (EN/ID).

**Aplikasi workspace (`/app/w/$workspaceId`)** — launcher modul, tiap modul
dengan submodul (definisi di `src/lib/modules.ts`):

| Modul | Isi |
|---|---|
| Master Data | Items, Categories, UoM, Customers, Suppliers, Warehouses, Tax Rates, COA |
| Procurement | PR → PO → GR → AP Invoice → Payment, Purchase Return |
| Inventory | Stock Overview/In/Out, Transfer, Opname, Valuation (AVERAGE/FIFO) |
| Sales & POS | Quotation → SO → DO → AR Invoice → Receipt, POS, Shipping Scan, Sales Return |
| Cash & Bank | Accounts, Cash In/Out, Fund Transfer, Reconciliation, Laporan Kas & Bank |
| Accounting | Opening Balance, Jurnal, GL, Trial Balance, Neraca, L/R, Arus Kas, Ekuitas, Kartu & Aging AR/AP, Period Closing |
| Fixed Assets | Register, Depresiasi, Disposal |
| Tax | PPN Masukan/Keluaran, PPh, e-Faktur & e-Bupot |
| Reporting | Executive, Sales, Purchasing, Inventory, Financial, Data Exports |
| Manufacturing | BOM, Work Order, Costing (belum aktif, sama dengan Lovable) |
| Utilitas | Team & Access, Settings (+ branding dokumen), Billing & Package, Maintenance (backup/restore), Guide |

**Add-on** (gating lewat `tenant_addons`): **Qalling CRM** (leads, pipeline,
broadcast WhatsApp, kampanye sosial Meta, target sales, template pesan),
**Slipp HR** (karyawan, absensi, payroll, PPh 21 TER, BPJS), **Omnix**.

**Platform admin (`/app-admin`)** — tenancy, registrations, packages, add-ons,
users, invoices, payments (webhook Midtrans), announcements, site content, tickets.

**Integrasi** — Midtrans (pembayaran), Meta Graph (ditunda), WhatsApp gateway,
web-to-lead publik, hook cron auto-publish, MCP server & asisten AI.

## 6. Persyaratan non-fungsional

- **Integritas keuangan**: setiap dokumen bernilai uang menjurnal otomatis dalam
  satu transaksi DB; koreksi memakai **storno**, bukan hapus jurnal.
- **Idempotensi**: migration/seed boleh dijalankan ulang (`db_apply_log`).
- **Keamanan**: tidak ada rahasia di bundle klien; `db:wipe` diblokir di produksi;
  endpoint publik dilindungi secret; akses data selalu lewat cek role workspace.
- **Kualitas**: `tsc --noEmit` 0 error, `npm run build` sukses, e2e Playwright
  hijau pada DB kosong (CI).
- **Operasional**: backup DB + volume storage, lihat [`OPERATIONS.md`](OPERATIONS.md).

## 7. Metrik keberhasilan

- Nol selisih perilaku yang diketahui antara checklist paritas dan Lovable.
- Setiap ekspor Lovable baru ter-port dengan diff yang terdokumentasi.
- CI hijau di DB kosong; deploy produksi tanpa langkah manual selain `docker compose up`.

## 8. Status & pekerjaan terbuka

Status terkini per ronde ada di [`PARITY-BS-NEW3-VS-OLD.md`](PARITY-BS-NEW3-VS-OLD.md).
Terbuka saat dokumen ini ditulis:

- Menjalankan `migrate` + e2e untuk ronde porting terakhir, dan uji manual alur
  GR → AP Invoice → pembayaran (akun GR/IR 2050 harus bersaldo nol).
- Integrasi Meta dengan App nyata (#55) — **ditunda** atas keputusan pemilik produk.
- Porting ekspor Lovable yang lebih baru (mis. `Business Suite New 8`).
- Manufacturing tetap nonaktif sampai Lovable mengaktifkannya.
