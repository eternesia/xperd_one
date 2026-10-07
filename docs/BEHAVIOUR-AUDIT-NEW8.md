# BEHAVIOUR AUDIT — paritas per modul vs `xperd-one.lovable.app` (ekspor New 8)

> Status: **berjalan** · Mulai 2026-10-08 · Acuan: [`PRD.md`](PRD.md), [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md)

Dokumen ini mencatat **analisis perilaku per modul**: memastikan aplikasi Old
Production berperilaku sama dengan Lovable — baik aplikasi live
(`https://xperd-one.lovable.app`) maupun kode ekspor terbaru
(`Xperd One Business Suite New 8`). Porting kode mengikuti temuan di sini.

## 1. Tiga sumber yang dibandingkan

| Sumber | Peran | Akses |
|---|---|---|
| `xperd-one.lovable.app` | **Sumber kebenaran perilaku** (UI, alur, label, angka) | publik ✅ · area workspace **butuh akun** ⛔ |
| `Xperd One Business Suite New 8` | Sumber kebenaran **kode** (UI/JSX identik) | lokal ✅ |
| Repo ini (Old Production) | Yang diaudit | lokal ✅ |

## 2. Alat audit: `scripts/audit-modules.mjs`

Skrip ini login, mengunjungi **setiap** modul/submodul (daftar diambil dari
`src/lib/modules.ts`), lalu merekam “sidik perilaku” tiap halaman: judul, tombol,
header tabel, jumlah kontrol form (combobox/textbox/checkbox/tab), pesan kosong,
flag error, serta tangkapan layar. Hasilnya JSON agar dua aplikasi bisa dipakai
banding otomatis.

```bash
# audit aplikasi Old lokal (butuh app di :3999)
AUDIT_BASE_URL=http://127.0.0.1:3999 \
AUDIT_EMAIL=<email> AUDIT_PASSWORD=<password> \
node scripts/audit-modules.mjs

# audit aplikasi Lovable live (publik saja bila tanpa kredensial)
AUDIT_BASE_URL=https://xperd-one.lovable.app node scripts/audit-modules.mjs

# bandingkan dua hasil audit
node scripts/audit-modules.mjs --compare audit/live.json audit/local.json
```

**Kredensial tidak boleh ditulis di repo.** Isi lewat environment (mis. tambahkan
`AUDIT_EMAIL`/`AUDIT_PASSWORD` di `.env` yang sudah di-*gitignore*, lalu
`node --env-file=.env scripts/audit-modules.mjs`).

Keluaran tersimpan di `audit/` (di-*gitignore*): `<host>-<tanggal>.json` +
`<host>-shots/*.png`.

## 3. Hasil yang sudah terkumpul

| Audit | Cakupan | Hasil |
|---|---|---|
| `xperd-one.lovable.app` | 6 halaman publik (`/`, `/products`, `/pricing`, `/register`, `/auth`, `/qalling`) | ✅ terdokumentasi di `audit/xperd-one.lovable.app-*.json` |
| Old lokal | **114 halaman** (12 modul + seluruh submodul + halaman publik) | ✅ `audit/127.0.0.1-*.json` + tangkapan layar per halaman |
| Banding publik (live vs Old) | 6 halaman | ✅ sama, kecuali **satu** temuan: halaman `/` di live punya tombol **“Dismiss”** yang tidak ada di Old (banner/konsen?) — perlu diverifikasi |

⛔ **Blokir**: tab “Register online” di aplikasi live bukan pendaftaran akun
instan (“Our team activates your organisation and sends your login credentials”),
jadi **area workspace live hanya bisa diaudit dengan akun uji**. Yang dibutuhkan:
satu akun (owner/admin) tenant demo di `xperd-one.lovable.app`.

## 4. Analisis struktural modul (Old vs New 8)

Dihasilkan dengan membandingkan `src/lib/modules.ts` kedua sisi:

| Modul | Perbedaan |
|---|---|
| `master-data` | **+ `currencies` (Mata Uang)**, **+ `exchange-rates` (Kurs Mata Uang)** → multi-currency master |
| `accounting` | **+ `fx-revaluation` (Revaluasi Kurs)** |
| `crm` | **− `dashboard`** (New 8 menghapus submodul dashboard CRM — Old masih punya) |
| **modul baru `xpro`** | submodul: `projects`, `milestones`, `budget`, `billing` |
| Modul lain (`procurement`, `inventory`, `sales`, `cash-bank`, `fixed-asset`, `tax`, `reporting`, `hr`, `omnix`) | struktur sama |

## 5. Analisis per klaster fitur New 8 → dampak modul

| Klaster (migrasi/berkas baru) | Modul terdampak | Sifat |
|---|---|---|
| **Multi-currency**: `0018_multi_currency_master`, `0019_document_exchange_rate`, `lib/currency.ts`, `CurrencyFields.tsx` | master-data (currencies, exchange-rates), sales, procurement, cash-bank, journal | ⚠️ menyentuh nilai uang & kurs dokumen |
| **Revaluasi kurs**: `lib/fx-revaluation.ts`, `FxRevaluationView.tsx` | accounting (`fx-revaluation`) | ⚠️ posting jurnal selisih kurs → **butuh keputusan pemilik produk** |
| **Audit trail**: `0020_audit_trail.sql`, `AuditTrailView.tsx`, `AccountingViews`, `master-data` | accounting, master-data | netral uang |
| **Xpro Projects fase 1**: `0021_xpro_projects_phase1.sql`, `XproViews.tsx` | modul baru `xpro` | modul baru → perlu keputusan aktivasi |
| **Workspace Access matrix**: `AccessMatrixPanel.tsx`, `getAccessMatrix`, `setWorkspaceAccess` | Team & Access (tab baru “Workspace Access”) | netral uang; lanjutan ronde 26 |
| Lain-lain: `ui/dialog|sheet|table|alert-dialog`, `styles.css`, `_site/index`, `GettingStartedChecklist.tsx`, `doc-print.ts`, `master-data.ts`, `provisioning.server.ts` | lintas modul | perlu ditelusuri per modul |

Berkas `src` yang berubah New 4 → New 8: **33 berkas** + 8 berkas baru
(`AccessMatrixPanel`, `AuditTrailView`, `CurrencyFields`, `FxRevaluationView`,
`GettingStartedChecklist`, `XproViews`, `lib/currency.ts`, `lib/fx-revaluation.ts`).

## 6. Checklist audit per modul

Isi kolom **Status** dengan: ✅ sama · ⚠️ beda (jelaskan) · ❌ belum ada di Old.
Kolom **Bukti** diisi tautan tangkapan layar/berkas hasil audit.

| # | Modul | Struktur submodul | Label EN/ID | Tombol & aksi | Dialog/form | Validasi | Angka/laporan | Status | Bukti |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Master Data | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⛔ perlu akun live | |
| 2 | Procurement (PR→PO→GR→AP→Payment→Return) | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⛔ perlu akun live | |
| 3 | Inventory | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⛔ perlu akun live | |
| 4 | Sales & POS | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⛔ perlu akun live | |
| 5 | Cash & Bank | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⛔ perlu akun live | |
| 6 | Accounting | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⛔ perlu akun live | |
| 7 | Fixed Assets | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⛔ perlu akun live | |
| 8 | Tax | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⛔ perlu akun live | |
| 9 | Reporting | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⛔ perlu akun live | |
| 10 | CRM (Qalling) | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | n/a | ⛔ perlu akun live | |
| 11 | Slipp HR | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⛔ perlu akun live | |
| 12 | Omnix | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⛔ perlu akun live | |
| 13 | Xpro Projects (**baru**) | ❌ belum ada di Old | | | | | | ⛔ menunggu keputusan | |
| 14 | Utilitas: Team & Access, Settings, Billing, Maintenance, Guide | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | n/a | ⛔ perlu akun live | |
| 15 | Marketing site (`_site`) | ✅ | ✅ | ⚠️ `/` tombol “Dismiss” | ✅ | ✅ | n/a | ⚠️ 1 temuan kecil | `audit/*-shots/` |

## 7. Rencana urutan kerja

1. **Siapkan akun uji live** → audit penuh 114 halaman di `xperd-one.lovable.app`,
   lalu `--compare` dengan hasil audit Old untuk daftar selisih otomatis.
2. **Porting non-uang dulu** (aman, tidak butuh keputusan): tab **Workspace
   Access** matriks, **audit trail**, penghapusan `crm/dashboard`.
3. **Butuh keputusan pemilik produk** (menyentuh jurnal/uang): **multi-currency**
   (mata uang & kurs pada dokumen) dan **revaluasi kurs** (`fx-revaluation`) —
   termasuk akun selisih kurs, sumber kurs, dan periode revaluasi.
4. **Xpro Projects fase 1** — menunggu keputusan apakah modul diaktifkan di Old.
5. Setiap item: ikuti Definition of Done di
   [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md) §7, perbarui
   [`PARITY-BS-NEW3-VS-OLD.md`](PARITY-BS-NEW3-VS-OLD.md), lalu commit
   `feat|fix|docs|test(scope)`.
