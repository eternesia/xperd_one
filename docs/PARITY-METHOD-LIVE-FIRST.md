# Pola pengembangan: **live-first parity** (`xperd-one.lovable.app` ↔ Old Production)

Aturan kerja yang disepakati:

> Setiap pengembangan modul **wajib dibandingkan dengan aplikasi live**
> (`https://xperd-one.lovable.app`) — **UI-nya** dan **behaviour-nya** — memakai
> kredensial yang sama seperti tim. Tidak boleh mengandalkan hasil membayangkan
> kode ekspor Lovable.

Tujuannya: menghindari halusinasi (fitur/label/angka yang "kira-kira sama") dan
membuat setiap perubahan punya **bukti** berupa sidik jari perilaku + tangkapan
layar dari kedua sisi.

## 1. Kredensial & workspace acuan

| Hal | Nilai |
|---|---|
| URL live | `https://xperd-one.lovable.app` |
| Akun | `dnicorp.id@gmail.com` / `@DNIIPO2032` (dari pemilik produk) |
| Workspace live yang **punya akses penuh** | **DNICORP** — `PT Digital Niaga International`, id `094c6136-8a8d-4360-b3c6-8b524f5120f4` |
| Workspace live lain | ETERNESIA — akun kita **bukan owner/admin** → semua modul “Module access restricted”, hanya berguna untuk melihat pesan penolakan |
| Jalur app lokal | `http://127.0.0.1:3999` (container `xperd-web-dev`, `npm run dev`) |
| Workspace lokal (dev) | `XPERD Demo` (`46bc16a0-56bc-4bd1-a813-fe7f0046a6d9`) |

Kredensial **tidak** ditulis di repo: selalu lewat environment
(`AUDIT_EMAIL`, `AUDIT_PASSWORD`).

## 2. Alat: `scripts/audit-parity.mjs`

Tiga langkah, bisa diulang kapan saja:

```bash
# 1. Enumerasi SEMUA halaman dari navigasi nyata aplikasi live
AUDIT_EMAIL=… AUDIT_PASSWORD=… node scripts/audit-parity.mjs discover
#    → audit/parity-routes.json  (path relatif, mis. "accounting/journals")

# 2. Sidik jari perilaku + tangkapan layar, per sisi
AUDIT_EMAIL=… AUDIT_PASSWORD=… node scripts/audit-parity.mjs capture --side live
AUDIT_EMAIL=… AUDIT_PASSWORD=… node scripts/audit-parity.mjs capture --side old

# 3. Bandingkan
node scripts/audit-parity.mjs report
#    → audit/parity-report.md   (status per halaman + rincian beda)
```

Dua alat pendamping (dipakai saat menutup sisa ⚠️, lihat §6 dan §9):

| Skrip | Gunanya |
|---|---|
| `scripts/audit-dialog-parity.mjs --module <id>` | struktur form/dialog **New** tiap submodul (label, wajib, tipe, opsi) |
| `scripts/audit-page-detail.mjs` (`ROUTES=…`) | dump DOM halaman yang ⚠️: header tabel, sel aksi, tombol + `title`/`aria-label` |

Captur Old memakan ±12 menit (116 halaman) dan **wajib** memakai
`chromium.launch({ channel: "chrome" })` — browser bawaan Playwright tidak
ter-install di lingkungan ini.

Yang direkam tiap halaman (“sidik jari”): `headings`, daftar `buttons`, `tabs`,
header tabel (`tableHeaders`), jumlah kontrol (`combobox`, `inputs`, `checkbox`),
`alerts/toast`, serta bendera `empty` / `locked` / `notFound` dan potongan teks
utama. Tangkapan layar tersimpan di `audit/parity-live-shots/` dan
`audit/parity-old-shots/` (nama berkas = nama halaman).

Catatan discovery: daftar halaman diambil dari **sidebar aplikasi live**, lalu
digabung dengan submodul BS New 10 (untuk modul add-on seperti `xpro`, `crm`,
`hr`, `omnix` yang tidak aktif di workspace acuan → di live muncul sebagai
“not active / paid add-on”).

## 3. Alur kerja per modul

1. **Jalankan `report`** → lihat baris modul yang dituju.
2. Untuk setiap halaman:
   - **❌ belum ada di Old** → bangun halamannya (migrasi + data layer + UI) mengikuti
     `PARITY-BS-NEW10-VS-OLD.md` / `PARITY-BS-NEW3-VS-OLD.md`.
   - **⚠️ beda** → buka dua tangkapan layar (live vs Old), baca catatan bedanya
     (judul/tombol/kolom/kontrol/status), lalu perbaiki UI/alur Old agar sama.
   - **✅ sama** → jadikan bukti; kalau menyentuh uang, tetap tambahkan uji angka
     (lihat §4).
3. **Ulangi** langkah 2–3 sampai modul itu **tidak punya baris ⚠️/❌** lagi.
4. Simpan hasil terakhir (`audit/parity-report.md`) sebagai bukti ronde, perbarui
   [`PARITY-BS-NEW3-VS-OLD.md`](PARITY-BS-NEW3-VS-OLD.md) /
   [`PARITY-BS-NEW10-VS-OLD.md`](PARITY-BS-NEW10-VS-OLD.md), lalu commit.

Urutan pengerjaan modul mengikuti urutan yang tampak di sidebar live:
**master-data → procurement → inventory → sales → cash-bank → accounting →
fixed-asset → tax → reporting → utilitas (team/settings/billing/maintenance) →
add-on (crm/qalling, slipp hr, omnix, xpro)**.

## 4. Kapan harus menambah uji (bukan hanya membandingkan tampilan)

Perbandingan UI tidak membuktikan angka. Untuk halaman yang menyentuh uang atau
status dokumen, tambahkan uji e2e yang membandingkan **angka** dengan hasil
hitung ulang dari SQL (bukan menyalin kode aplikasi) — pola yang sudah dipakai:

| Spec | Yang dibuktikan |
|---|---|
| `e2e/accounting-vat-closing.spec.ts` | tutup PPN 2100/1400/1410/2110 + tolak periode terkunci |
| `e2e/accounting-fx-revaluation.spec.ts` | revaluasi kurs + jurnal balik otomatis |
| `e2e/accounting-fx-documents.spec.ts` | dokumen valas → jurnal mata uang dasar + selisih kurs realisasi |
| `e2e/cash-bank-trx-number.spec.ts` | nomor transaksi tidak dipakai ulang |

## 5. Batas yang perlu diketahui

- Akun live kita hanya owner/admin di workspace **DNICORP**; untuk modul
  **add-on** (XPro, CRM/Qalling, Slipp HR, Omnix) workspace itu belum
  berlangganan → yang bisa dibandingkan hanya halaman “belum aktif”
  (penawaran/paket). Kalau pemilik produk mengaktifkan add-on di DNICORP,
  jalankan ulang `capture --side live` untuk membandingkan isi modulnya.
- Aplikasi live memakai Supabase + RLS; Old memakai MySQL + server fn. Perbedaan
  lapisan data itu **bukan** selisih parity (lihat `DEVELOPMENT_GUIDE.md` §2).
- **Label tidak selalu ikut bahasa UI.** Panel “Workspace Access” di live
  berlabel **Bahasa Indonesia hardcoded** (`No | Pengguna | Pemilik |
  Semua akses | Tidak ada akses`) walaupun tab lain di halaman yang sama
  berbahasa Inggris (`# | User | Joined | Role | Actions`) dan salah satu
  workspace bernama `DNICORP`. Artinya: jangan “merapikan” label panel itu ke
  i18n — parity menuntut salinan apa adanya (komponen Old sengaja tidak memakai
  `useI18n`). Pelajarannya umum: **jangan menyimpulkan bahasa label dari bahasa
  UI sekitarnya; ukur dari DOM live.**

## 6. Perbandingan per modul: form/dialog (`scripts/audit-dialog-parity.mjs`)

Sidik jari halaman hanya melihat daftar. Untuk behaviour yang dirasakan user,
skrip kedua membuka tombol **New** tiap submodul di kedua sisi dan merekam
struktur formnya (judul dialog, label field, tipe input, wajib/tidak, opsi
select, tombol aksi):

```bash
AUDIT_EMAIL=… AUDIT_PASSWORD=… node scripts/audit-dialog-parity.mjs --module master-data
# → audit/dialog-parity-<module>.json  (+ ringkasan ✅/⚠️ di stdout)
```

Hasil yang sudah diverifikasi (Ronde 30–31):

| Modul | Hasil |
|---|---|
| master-data | 10/10 struktur form sama (setelah perbaikan tanda wajib `Code *`) |
| procurement, sales, cash-bank | sama (setelah normalisasi nomor dokumen otomatis) |
| accounting, fixed-asset, tax, reporting | 18 ✅ sama, 0 ⚠️ |

Normalisasi yang **wajib** dipakai saat membaca hasil: nomor dokumen otomatis
(`normNum()`), bendera `empty` (bergantung data), dan chrome aplikasi live
(pencarian modul, notifikasi, pemilih bahasa, “Edit with”, nama workspace).

## 7. Perbandingan tab & panel di dalam satu halaman

Beberapa parity tidak terlihat dari daftar halaman. Contoh: halaman **Team &
Access** di live punya **3 tab** (`Users | Workspace Access | Role Access`) —
tab kedua (matriks user × workspace) tidak ada di Old sebelum Ronde 31 dan tidak
akan pernah muncul di `parity-report.md` karena halaman `/team` sudah ✅.

Cara memeriksanya: skrip kecil sekali pakai yang membuka halaman, mengklik tiap
`[role="tab"]`, lalu membuang `thead th`, baris pertama, jumlah
`select`/`[role="combobox"]`, dan badge dari `[role="tabpanel"]`. Hasil Ronde 31
(live vs Old, sebelum perbaikan label):

| | live | Old (sebelum) | Old (sesudah) |
|---|---|---|---|
| Header tabel | `No \| Pengguna \| <workspace…>` | `# \| User \| <workspace>` | `No \| Pengguna \| <workspace>` |
| Badge baris pemilik | `Pemilik` + `Semua akses` | `Owner` + `All access` | `Pemilik` + `Semua akses` |
| Sel user biasa | select peran (`Staff`, `Viewer`, `Tidak ada akses`) | select peran | select peran |

Pelajarannya: **periksa juga tab/panel tersembunyi** (cek `[role="tab"]` dan
`[role="tabpanel"]`), bukan hanya elemen yang terlihat pada muatan pertama.

## 8. Data untuk membandingkan matriks team

Matriks user × workspace hanya berguna kalau tenant punya ≥ 2 workspace / ≥ 2 user.
Tenant dev Old (`XPERD Demo`) hanya punya 1 workspace dan 1 anggota, sehingga sel
peran tidak akan pernah muncul di tangkapan layar. Solusinya: **tambahkan anggota
uji langsung ke DB di dalam spec** lalu hapus lagi di akhir
(`e2e/team-workspace-access.spec.ts` memakai `mysql2` seperti
`e2e/audit-trail.spec.ts`), sehingga spec tetap idempoten tanpa mengubah data
seed.

## 9. Bukti sebelum memperbaiki: `scripts/audit-page-detail.mjs`

Untuk halaman yang masih ⚠️, **jangan** langsung menyimpulkan dari satu baris
laporan. Skrip ini men-dump DOM kedua sisi (header tabel, isi sel terakhir tempat
aksi hidup, semua tombol + `title`/`aria-label`, jumlah input/checkbox): 

```bash
ROUTES="cash-bank/cash-in,accounting/period-closing" \
  AUDIT_EMAIL=… AUDIT_PASSWORD=… node scripts/audit-page-detail.mjs
```

Contoh hasil nyata (Ronde 31): laporan menandai `cash-bank/cash-in` ⚠️ karena
“kolom hanya Old: Actions”, ternyata live memang punya kolom aksi **tanpa judul**
(`<TableHead className="w-28" />` di New 10) → yang salah adalah judul kolomnya,
bukan fiturnya. Sebaliknya `accounting/period-closing` memang **benar-benar**
kurang: live punya tabel riwayat kunci periode yang selalu tampil.

## 10. Daftar ⚠️ yang **bukan** celah (agar tidak dikejar berulang)

| Halaman | Kenapa ⚠️ | Bukti |
|---|---|---|
| `(launcher)` | sidik jari hanya membaca `h1,h2`; tangkapan terjadi sebelum render | screenshot kedua sisi sama-sama menampilkan nama workspace |
| `accounting/opening-balance` | jumlah input = 2 × jumlah akun COA (data) | dev punya 33 akun → 69 input; live 26 akun → 55 input |
| `cash-bank/cash-out`, `reconciliation` | live tidak punya transaksi (0 baris) sehingga tombol/checkbox per baris tidak muncul | New 10 punya tombol `Proof` (baris 734) dan `Checkbox` per baris (baris 1128) |
| `inventory`, `inventory/stock-in|stock-out`, `procurement`, `reporting/sales` | status `empty` — live kosong, Old punya data seed |  |
| `procurement/purchase-requests`, `sales/quotations` | tombol `Edit draft`/`Delete` hanya ada bila barisnya masih draft di Old | New 10: `aria-label` “Edit draft”/“Delete draft” |
| `sales/pos` | nama item berbeda (data) |  |
| `settings` | tombol `Remove` (logo) hanya muncul kalau workspace punya logo | dev belum punya logo |
| `team` | live punya 4 anggota (jadi ada `Select` peran + paginasi); Old dev hanya 1 | struktur baris Old sudah identik New 10 (dibuktikan dump DOM baris) |

Selain itu, **chrome aplikasi live** selalu muncul sebagai selisih dan harus
diabaikan: tombol `Dismiss`/“Edit with Lovable”, pencarian modul, notifikasi,
pemilih bahasa, dan nama workspace di header.

## 11. Aksi per baris & halaman detail: `scripts/audit-row-actions.mjs`

Lapisan berikutnya setelah form: **apa yang terjadi kalau tombol baris diklik**.
Skrip ini membuka aksi baris pertama di kedua sisi lalu merekam:

- daftar aksi baris (`aria-label`/`title`/teks) — mis. `Preview|Print`;
- kalau aksinya dialog → judul + label field; kalau aksinya **link** → sidik jari
  halaman detail (path, `?print=1`, heading, header tabel, **tombol** halaman itu).

```bash
AUDIT_EMAIL=… AUDIT_PASSWORD=… node scripts/audit-row-actions.mjs
ROUTES="sales/ar-invoices,procurement/purchase-orders" … node scripts/audit-row-actions.mjs
# → audit/row-actions-parity.json + ringkasan ✅/ℹ️/🎫/⚠️
```

Aturan penting yang sudah tertanam di skrip:

1. **Aman untuk live**: hanya pembuka yang diklik (`detail|view|eye|pencil|edit|
   proof|print|cetak`); tombol destruktif (`delete|hapus|void|batal|storno|post|
   approve|…`) **tidak pernah** diklik, jadi data tenant live tidak berubah.
2. **Baris empty-state bukan data** (`No documents match…`) — kalau tidak
   dikecualikan, halaman kosong di live tampak “punya 1 baris” dan memicu ⚠️ palsu.
3. **Normalisasi**: id dokumen → `<docId>`, nomor dokumen (`SO/202609/0001`,
   `E2E-SO-0001`) → `<docNumber>`; `?print=1` dibuka lewat URL langsung karena
   klik `Print` kadang membuka tab yang langsung menutup.
4. **Beda yang sah karena status** dicatat sebagai ℹ️, bukan ⚠️ (mis. baris dev
   masih `draft` → `Edit draft`/`Delete` memang tampil; di New 10 pun hanya untuk
   status draft).

Hasil Ronde 32 (live vs Old):

| Halaman | Hasil |
|---|---|
| `master-data/items`, `master-data/customers` | ✅ aksi baris + dialog edit sama |
| `sales/sales-orders`, `sales/delivery-orders`, `sales/ar-invoices` | ✅ aksi baris + halaman detail + tombol + tampilan cetak sama |
| `procurement/purchase-orders`, `procurement/goods-receipts` | ✅ idem |
| `procurement/purchase-requests` | ℹ️ sama; Old sedang `draft` → ada `Edit draft`/`Delete` |
| `accounting/journals`, `inventory/stock-in|out|transfers|opname`, `fixed-asset/assets`, `cash-bank/cash-in` | ✅ (dialog/halaman sama; sebagian 🎫 karena salah satu sisi kosong) |
| `sales/quotations`, `sales/pos`, `crm/leads`, `hr/employees` | 🎫 tidak bisa dibanding (live kosong / add-on terkunci) |

### Cara membuat halaman bisa dibanding kalau dev Old kosong

Live punya dokumen berstatus selesai (`PO/202610/0002`, `GRN/202610/0001`,
`ARI/202609/0002`) sedangkan dev Old belum. Solusinya **salin baris dokumen yang
sudah ada di dev** menjadi jenis/status yang dibutuhkan (tandai `reference =
'PARITY-TEMP'` supaya mudah dihapus):

```sql
INSERT INTO prc_documents (id, workspace_id, doc_type, doc_number, …, reference, status, …)
SELECT UUID(), workspace_id, 'purchase_order', 'PO/202610/9001', …, 'PARITY-TEMP', 'closed', …
  FROM prc_documents WHERE workspace_id = @ws AND doc_type = 'purchase_request' LIMIT 1;
-- lalu barisnya dari prc_document_lines dokumen sumber; sesudah audit, hapus lagi.
```

Status yang dipakai live: `Completed` = `closed`, `Received` = `received`,
`Approved` = `approved` (lihat `STATUS_LABEL` di `src/lib/procurement.ts`).
**Jangan** menjalankan resep ini di database produksi — hanya untuk dev/audit.



