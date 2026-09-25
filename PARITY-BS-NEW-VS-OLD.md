> **Catatan lokasi:** dokumen ini semula disimpan di luar repo
> (`../DIFF-BS-NEW-VS-OLD-PRODUCTION.md`) sehingga tidak ikut ter-commit. Sejak
> Batch 2, salinannya dipindahkan ke dalam repo Old (berkas ini) supaya riwayat
> parity ikut ter-versi bersama kode. Rencana & progres porting modul Slipp HR
> ada di `SLIPP-HR-PORTING.md`.

# Perbedaan: Xperd One Business Suite New vs Xperd One Old Production

> Tanggal audit: 2026-09-24 · **Status per commit `21e223e`: 10 item Batch 1 sudah di-port** (ditandai ✅ di tabel), sisanya belum.

| Folder | Peran |
|---|---|
| `Xperd One Business Suite New` | **New**: export Lovable terbaru (Supabase), berisi update yang belum di-port |
| `Xperd One Business Suite` | Snapshot Lovable 24 Agu, dasar port sebelumnya (lihat `FEATURE-PORT-MATRIX.md` di Old) |
| `Xperd One Old Production ` | **Old**: yang jalan di production (MySQL, TanStack Start, server functions) |

**Metode:** folder New dibandingkan dengan snapshot BS 24 Agu untuk mendapat daftar perubahan Lovable sejak port terakhir. Setiap perubahan lalu dicek di Old dengan status ✅ sudah ada, ⚠️ sebagian, atau ❌ belum ada.

**Ringkasan:** dari ±27 perubahan di New, **23 sudah selesai penuh** — #1, #2, #3, #4, #5, #6, #7, #8, #9, #10, #12, #13, #15, #16, #17, #18, #19, #20, #23, #24, #25, #26, #27, #11 (✅ keputusan: tanpa trigger DB, guard di kode) — plus 1 bug MySQL datetime di luar daftar. **#21 & #22 = boilerplate opsional / tidak wajib** (nonaktif default, `31f1224`). **Tidak ada item wajib yang tersisa**; #14 memang sudah ada sejak awal. **Seluruh grup D (CRM) sudah selesai (kecuali bagian opsional #21–22).**

## Verifikasi ulang terhadap Old Production (2026-09-24)

- **State Old:** branch `master` = `origin/master` @ `803f1ce` (23 Sep), working tree bersih, migration sampai `006_workspace_contact.sql`. Branch `port/bs-features` sudah ter-merge ke master.
- **Update (Batch 1, 24 Sep):** Old sekarang di `d8a5b91` (19 commit: `0b7db02` → `e7d281d` → `21e223e` → `1b01f52` → `81c90d6` → `aa235d4` → `b424ac3` → `d40b95f` → `6fab722` → `b325cd6` (server fn agregat sisa nilai) → `5141f4d` (picker sumber hanya sisa nilai, #7 tahap 2a) → `62bb088` (widget Partial/Full + status sumber partial/closed berbasis NILAI, #7 tahap 2b) → `1d1ea7d` (#7 tahap 3 Procurement + #8 sumber closed di picker) → `c384511` (logo workspace #4 + migration 007) → `44ad274` (#12/#13 lampiran bukti kas keluar) → `31f1224` (boilerplate opsional integrasi pihak ketiga #21/#22) → `1627aa0` (#25 reset transaksi tenant di kode + keputusan tanpa trigger DB untuk #11) → `53d832e` (e2e matematika partial NILAI #7 + seed fixture `E2E-DO-0001`) → `d8a5b91` (logo default workspace = logo Xperd One)), migration **001–007** (007 sudah dibuat & diterapkan di DB dev: `workspaces.logo_url`, `cb_transactions.attachment_url`), seed 001–002, tsc 0 / build 0 / Playwright **26 passed (0 skipped)**.
- **Setiap item ❌ dicek langsung dengan grep** di `O/` dan `db/`. Tidak ditemukan `addPage`, `paymentAccount`, `hideAmounts`, `logo_url`, `attachment_url`, `max-w-7xl`, `PartialAmount`, `editDraft`/`Pencil`, guard hapus draft, `TRIGGER`, import CRM, `useWorkspaceOwners`, tombol `convertLeadToQuotation`, penulisan `stage_changed_at`, route `/api/public/crm/lead`, reminder hook, guide, `CircleHelp`, maupun `adminResetTenantTransactions`. `O/src/routes/api/public` hanya berisi `webhooks/midtrans.ts`. CSS dark mode masih memakai `:not([class*="dark:text-"])` (`O/styles.css:165`).
- **#8 dipastikan belum ada:** `closed` yang sudah ada di Old (`O/lib/sales.ts:184`, `O/lib/procurement.ts:198`) itu untuk **retur**. `closed` untuk AR/receipt/AP/payment (baris 143/164 dan 157/178) belum ada.
- **Perbaikan Old sejak 8 Sep** (`31bd0f5`, `1ae8175`, `484afe0`, `dfcd2d3`, `90824fd`, `c56f819`) semuanya menyamakan Old dengan snapshot BS lama, bukan dengan New. Karena itu fitur baru New memang belum tercakup. Satu-satunya yang beririsan adalah fix `oklch`: Old dan New memakai pendekatan yang sama (html2canvas langsung pada iframe), tapi New menambahkan paginasi.

### Perbaikan khusus Old yang **tidak boleh tertimpa** saat port
Kode New masih memakai Supabase. Jangan menyalin file New mentah-mentah; port per perubahan (hunk) dan pertahankan hal-hal berikut:

| Area | Perbaikan di Old | Commit |
|---|---|---|
| Semua data layer | Server fn MySQL (`listWorkspaceRows`, `saveWorkspaceRow`, `adminList/adminSave`, dll.) menggantikan `supabase.from(...)` | port sejak `2ecebdb` |
| `routes/app-admin/tenancy.tsx` | `adminListTenantsWithPackages` mengembalikan `packages: { name }`, jadi kolom Package tidak lagi "—" | `90824fd` / `9b5bca3` |
| `routes/auth.tsx` | Tab Sign in / Register online memakai `emitAuthChange()` (auth JWT cookie) | `90824fd` |
| `$docId.tsx` | Label print (billedTo/signature/thanks/noLines), telepon dan email perusahaan, status terlokalisasi, busy state PDF | `484afe0`, `1ae8175` |
| `lib/doc-print.ts` | Fix `oklch` (html2canvas + jsPDF di iframe). Saat port #1, tambahkan loop paginasi saja | `31bd0f5` |
| `settings.tsx` | Field phone/email (`006_workspace_contact.sql`) dan kartu preview template, disimpan lewat `updateWorkspaceSettings` | `dfcd2d3` |
| `lib/admin-users.functions.ts` | Versi MySQL penuh. Tambahkan `adminResetTenantTransactions` sebagai fungsi baru, jangan timpa file | `9007170` |
| `scripts/wipe.mjs` | Guard production. Kalau menambah trigger #11, pastikan wipe/reset tetap jalan | `c56f819` |
| `e2e/` | Suite Playwright. Perlu diperbarui untuk #3 (DO tanpa harga), #10 (hapus hanya draft), dan #23-24 (topbar) | `1b378a5` dst. |

Singkatan path: `N/` = `Xperd One Business Suite New/src/`, `O/` = `Xperd One Old Production /src/`.

---

## Batch 1 — SELESAI (2026-09-24)

| Commit | Isi | Item |
|---|---|---|
| `0b7db02` | Help Center topbar, halaman User Guide, dark mode (CSS + 10 kelas), tombol Save Settings pindah bawah, dialog create lebih lebar, PDF multi-halaman | #24/V2, #23, #26/V1, #27, #6, #1 |
| `e7d281d` | CRM: convert lead → quotation, lost reason wajib, `stage_changed_at`; **bug fix** MySQL datetime | #18, #19, #20 |
| `21e223e` | Delivery Order tanpa harga (list, dialog, detail, cetak/PDF) | #3 |
| `1b01f52` | Hapus dokumen hanya untuk draft: UI + guard `requireStatus` di server | #10 (+ #11 sebagian) |
| `81c90d6` | CRM: dropdown owner dari anggota workspace + filter "My leads" | #16, #17 |
| `aa235d4` | CRM: import prospek dari Excel/CSV (alias kolom, skip duplikat, bulk insert) | #15 |
| `b424ac3` | Edit draft (sisi Sales) + server fn transaksional `replaceChildRows` | #9 (sebagian) |
| `d40b95f` | Edit draft sisi Procurement + e2e 2 kasus | #9 (selesai) |
| `6fab722` | Blok rekening dokumen = rekening terpilih (`paymentAccount`) + preview contoh rekening | #2, #5 |
| `b325cd6` | Server fn agregat `sumDocumentTotalsBySource` (SUM(total) GROUP BY source_document_id) | #7 (tahap 1) |
| `5141f4d` | Picker sumber sales hanya menampilkan sumber yang masih punya sisa nilai | #7 (tahap 2a) |
| `62bb088` | Widget Partial/Full berbasis nilai, validasi total > sisa ditolak, status sumber `partial`/`closed` by value, `editDraft` menghitung ulang sisa | #7 (tahap 2b) |
| `1d1ea7d` | Sisi Procurement: `isAmountSettlement` AP Invoice/Purchase Payment, picker sisa nilai, widget Partial/Full, status sumber by value, `editDraft` hitung ulang sisa) + `closed` masuk `fromStatuses` picker sumber | #7 (tahap 3), #8 |
| `c384511` | Migration 007 (`workspaces.logo_url`, `cb_transactions.attachment_url`), logo workspace: whitelist PCOLS, shell data, header 3 template cetak, blok unggah/pratinjau/hapus di Settings, e2e `workspace-logo.spec.ts` | #4 |
| `44ad274` | Lampiran bukti Kas Keluar: `CB_ALLOWED` + `COLS` cb_transactions + tipe/payload `createCbTransaction`, input file + pratinjau di dialog, link "Proof" + dialog gambar, e2e `cash-out-proof.spec.ts` | #12, #13 |
| `31f1224` | Boilerplate OPSIONAL integrasi pihak ketiga: `interop.server.ts` (API key constant-time + rate limit + handler `Request→Response`), `whatsapp.server.ts` (adapter no-op), `reminders.server.ts` (read-only), tambatan di `server.ts`, `INTEROP-BOILERPLATE.md`, e2e `interop-disabled.spec.ts` | #21, #22 (kerangka, bukan wajib) |
| `1627aa0` | Reset transaksi tenant murni di kode (`adminResetTenantTransactions`, 1 transaksi MySQL + verifikasi sisa, tombol + konfirmasi ketik RESET di tenancy) + keputusan tanpa trigger DB untuk guard hapus | #25, #11 |
| `53d832e` | e2e matematika partial NILAI AR Invoice (`sales-partial-amount.spec.ts`) + fixture idempotent `db/seeds/002_sales_source_fixture.sql` (`E2E-DO-0001`) | #7 (tuntas) |
| `d8a5b91` | Logo default workspace = logo brand Xperd One (`src/lib/brand.ts` → `DEFAULT_WORKSPACE_LOGO`), dipakai bila workspace belum unggah logo (dokumen + pratinjau Settings) | #4 (penyempurnaan) |

- **Bug di luar daftar:** `new Date().toISOString()` (`…T06:54:02.961Z`) **ditolak MySQL** untuk kolom `datetime` (`Error 1292 Incorrect datetime value … at row 1`; `CAST()` toleran tapi INSERT/UPDATE tidak). Ada 13 penulisan timestamp di 7 file — CrmViews, CrmOutreach, CashBankViews, ShipmentScan, app-admin announcements/invoices/tickets — semuanya kini memakai `sqlDateTime()` dari **`src/lib/datetime.ts`** (baru).
- **Spec e2e baru:** `e2e/guide.spec.ts`, `e2e/crm-lead-extras.spec.ts`, `e2e/delivery-order.spec.ts`.
- **Catatan dev DB:** add-on `qalling` diaktifkan untuk tenant Demo Xperd di DB dev supaya spec CRM jalan (sebelumnya selalu skip).
- **Belum diuji otomatis:** jalur cetak/PDF DO (#3) — DB dev belum punya dokumen `delivery_order`.

## A. Dokumen & print (Sales / Procurement)

| # | Perubahan di New | File New | Status Old | Bukti di Old | Catatan port |
|---|---|---|---|---|---|
| 1 | PDF **multi-halaman**: canvas dipotong per A4 (`addPage`) | `N/lib/doc-print.ts:332-381` | ✅ | **`0b7db02`** — `O/lib/doc-print.ts` sekarang loop `addPage` + `addImage(img,"JPEG",0,-offset,pageW,imgH)` (794×1123) | Selesai di batch 1 |
| 2 | Blok "Bank info" perusahaan dihapus dari 3 template, diganti `paymentAccount` (rekening yang dipilih) **hanya untuk AR Invoice** | `N/lib/doc-print.ts:48-50,185,240,290`; `N/routes/app/w.$workspaceId.$moduleId.$submoduleId.$docId.tsx:104` | ✅ | **`6fab722`** — `DocPrintMeta.paymentAccount`; ketiga template (classic/modern/minimal) merender rekening terpilih, bukan `bankInfo` workspace; `$docId` mengirimnya hanya untuk `ar_invoice` | Selesai |
| 3 | **Delivery Order tanpa harga**: detail, print, list, dan form create tanpa harga/pajak/total | `doc-print.ts:109-123`; `$docId.tsx:41,103,187,204-240`; `N/components/app/SalesTable.tsx:671-710,1021-1127` | ✅ | **`21e223e`** — `hideAmounts` di `DocPrintMeta`/`lineRows` (3 template), `$docId` (`!hideAmounts` untuk Info mata uang, kolom harga/total, colSpan 7→5, ringkasan), `SalesTable` (`entity.docType !== "delivery_order"` untuk kolom Total, th Price/Disc./Tax %, sel harga/diskon/pajak, blok Subtotal/Total; colSpan 8→7) | Selesai di batch 1 · e2e `delivery-order.spec.ts` |
| 4 | **Logo workspace** di semua template, template Modern didesain ulang (aksen, logo/inisial, tanda tangan), upload logo di Settings (resize ≤400×160, PNG data URL) | `doc-print.ts:38,148,199-264`; `N/routes/app/w.$workspaceId.settings.tsx:45-119,269-285`; `N/lib/app-context.tsx:23,104` | ✅ | **`c384511`** — migration 007 + `PCOLS.workspaces` + `ShellWorkspace`/`Workspace` + `app-shell` SELECT + `doc-print` (`DocCompany.logoUrl` dirender di header classic/modern/minimal) + blok “Logo dokumen” di Settings (`pickLogo()` resize ≤400×160 → data URL) + `company.logoUrl` di route dokumen. **Deviasi:** BS New menyimpan logo di Supabase Storage (URL), Old menyimpan data URL di `MEDIUMTEXT` karena tidak ada object storage. e2e `workspace-logo.spec.ts` (unggah → preview cetak memuat data URL → persisten → dihapus kembali). **Update `d8a5b91`:** selama workspace belum mengunggah logo, dokumen & pratinjau memakai **logo default Xperd One** (`src/assets/xperd-one.png` via `DEFAULT_WORKSPACE_LOGO`) — bukan lagi tanpa logo | **Migration 007**: `workspaces.logo_url MEDIUMTEXT`. Tambahkan juga ke whitelist `O/lib/platform.functions.ts:43`, SELECT `O/lib/app-shell.functions.ts:82`, tipe, dan `updateWorkspaceSettings` |
| 5 | Preview template di Settings menampilkan contoh rekening pembayaran | `settings.tsx:361` | ✅ | **`6fab722`** — `previewHtml()` mengirim `paymentAccount: "BCA 4974741191"` sehingga preview menampilkan contoh rekening | Selesai |
| 6 | Dialog create lebih lebar (`max-w-7xl w-[96vw]`) | `SalesTable.tsx:815`, `ProcurementTable.tsx:806` | ✅ | **`0b7db02`** — `max-h-[94vh] w-[96vw] max-w-7xl overflow-x-hidden overflow-y-auto sm:max-w-7xl` di kedua tabel | Selesai di batch 1 |

## B. Alur transaksi

| # | Perubahan di New | File New | Status Old | Bukti di Old | Catatan port |
|---|---|---|---|---|---|
| 7 | **Partial invoice/payment berbasis nilai** untuk AR Invoice, Sales Receipt, AP Invoice, Purchase Payment. Sisa = total sumber − total dokumen anak (bukan draft/cancelled). Picker hanya menampilkan sumber dengan sisa > 0. Ada widget **Partial / Full**. Total yang melebihi sisa ditolak. Sumber tetap `partial` sampai nilainya lunas | `SalesTable.tsx:80,160-250,452-476,832-835,906-930,1188-1234`; `ProcurementTable.tsx` (struktur sama) | ⚠️ | **Tahap 1 + 2a + 2b + 3 SELESAI** (`b325cd6`, `5141f4d`, `62bb088`, `1d1ea7d` — sisi Sales & Procurement) **+ e2e nilai `53d832e` — TUNTAS** (`sales-partial-amount.spec.ts`: sisa == nilai dokumen setelah pull, Apply partial mengubah nilai tanpa mengubah sisa, Full kembali ke sisa; fixture `E2E-DO-0001`) (Procurement: AP Invoice & Purchase Payment), tahap 4. Sebelumnya murni berbasis qty (`O/components/app/SalesTable.tsx:152,180,198-204,319-347`) | `listWorkspaceRows` tidak punya NOT-IN. Server fn agregat dibuat di `b325cd6` (`sumDocumentTotalsBySource`) |
| 8 | Status `closed` boleh dipilih sebagai sumber AR/receipt/AP/payment | `N/lib/sales.ts:145,168`; `N/lib/procurement.ts:159,180` | ✅ | **`1d1ea7d`** — `closed` ditambahkan ke `fromStatuses` sumber dokumen penyelesaian (sales: `delivery_order → ar_invoice`, `ar_invoice → receipt`; procurement: `goods_receipt → ap_invoice`, `ap_invoice → payment`). Aman dari tagihan ganda karena picker menyaring sisa nilai (#7 tahap 2a/2b); sumber retur (qty) sudah `closed` sejak awal. **Dikerjakan setelah #7 tahap 2–3 sesuai catatan** | **Wajib bersamaan dengan #7**, kalau tidak dokumen yang sudah lunas muncul lagi |
| 9 | **Edit Draft**: tombol pensil, muat ulang header + lines, simpan dengan update doc lalu ganti lines | `SalesTable.tsx:294-422,716-725,818`; `ProcurementTable.tsx:295-371` | ✅ | **`b424ac3` + `d40b95f` — SELESAI dua sisi**: tombol `Pencil` (hanya draft), `editDraft()` memuat header + baris, simpan = `saveWorkspaceRow(id)` + server fn baru **`replaceChildRows`** (delete + insert baris dalam SATU transaksi), judul dialog "Edit Draft", toast "Draft updated". Berlaku untuk Sales & Procurement | Selesai · e2e `draft-edit.spec.ts` (2 kasus) |
| 10 | **Hanya draft yang bisa dihapus** (UI) | `SalesTable.tsx:546-563,754-765`; `ProcurementTable.tsx:541-558` | ✅ | **`1b01f52`** — tombol hapus hanya dirender saat `row.status === "draft"`; mutation menolak status lain dengan pesan terlokalisasi | Selesai · e2e `draft-delete.spec.ts` |
| 11 | **Hanya draft yang bisa dihapus** (DB trigger) | `drizzle/migrations/0000_protect_confirmed_sales_purchase_documents.sql` | ✅ | **`1627aa0`** — keputusan: **tanpa trigger DB**, logika tetap di kode. Guard `deleteWorkspaceRow({ requireStatus: "draft" })` (sejak `1b01f52`) sudah menegakkan aturan di semua jalur hapus aplikasi, jadi tidak ada objek DB tersembunyi yang perlu di-migrasi/dijagastatus = ?` + cek `affectedRows` (throw bila 0). Trigger MySQL `BEFORE DELETE … SIGNAL` belum dibuat | Trigger opsional; server fn sudah jadi lapisan kedua |

## C. Cash & Bank

| # | Perubahan di New | File New | Status Old | Catatan port |
|---|---|---|---|---|
| 12 | **Upload bukti (gambar)** di Cash Out, dengan link "Bukti" di list (signed URL 300 detik) | `N/lib/cashbank.ts:41,214,285-303`; `N/components/app/CashBankViews.tsx:28,413,459-461,590-598,730-735` | ✅ | **`44ad274`** — kolom `cb_transactions.attachment_url` (migration 007) + `COLS` di `O/lib/data.functions.ts` + `CB_ALLOWED` di `O/lib/ledger.functions.ts` (**akar masalah: tanpa ini nilai dibuang tanpa error**) + `CbTransaction`/`CbTrxInput`/payload `createCbTransaction` + input file `accept="image/*"` khusus Kas Keluar dengan `pickAttachment()` (resize ≤1000×1400 → JPEG data URL) + link "Proof"/"Bukti" di kolom Kontak/Referensi. **Deviasi:** BS New upload ke Supabase Storage + signed URL 300 detik di tab baru; Old menyimpan data URL dan membuka pratinjau lewat dialog (Chrome memblokir navigasi tab ke data URL). e2e `cash-out-proof.spec.ts` |
| 13 | Policy storage per workspace | `drizzle/migrations/0001_logo_and_cash_attachment.sql` | ✅ | Tidak perlu policy storage: Old tidak memakai Supabase Storage, izin dijaga oleh `isWorkspaceMember`/`canWriteWorkspace` di server fn (`insertCbTransaction` memakai `withWriter`) | N/A di Old |

## D. CRM

| # | Perubahan di New | File New | Status Old | Catatan port |
|---|---|---|---|---|
| 14 | Submodul Dashboard, Sales Targets, Message Templates | `N/lib/modules.ts:235,243-244` | ✅ | Hanya beda label ("CRM Dashboard") dan urutan |
| 15 | **Import lead Excel/CSV**: alias kolom EN/ID, lewati duplikat email/HP | `N/components/app/CrmViews.tsx:155-246,315-329` | ✅ | **`aa235d4`** — tombol "Impor Excel" + `handleImport` (xlsx dynamic import, alias `name/nama/contact/kontak` dst, skip duplikat email & HP via digit) dan insert massal lewat server fn `upsertWorkspaceRows` | Selesai · e2e `crm-import.spec.ts` |
| 16 | Filter **"My leads"** dan owner default = user yang login | `CrmViews.tsx:139-149,239-246,335` | ✅ | **`81c90d6`** — owner lead baru otomatis = pengguna login (`listWorkspaceOwners().isCurrentUser`), tombol "Prospek saya"/"My leads" memfilter baris dengan `owner_name` tersebut | Selesai · e2e `crm-owners.spec.ts` |
| 17 | Owner lead berupa **dropdown anggota workspace** | `CrmViews.tsx:90-104,471-482` | ✅ | **`81c90d6`** — server fn baru `listWorkspaceOwners` (`JOIN workspace_members × profiles`, guard `isWorkspaceMember`) + `AdminSelect` berisi anggota; nama lama dipertahankan sebagai opsi bila owner bukan anggota | Selesai · e2e `crm-owners.spec.ts` |
| 18 | Tombol **Convert lead → Quotation** | `CrmViews.tsx:248-260,387-397` | ✅ | **`e7d281d`** — tombol `FileOutput` di baris lead (hanya `status==="open"` & belum ada `quotation_id`) memakai `useServerFn(convertLeadToQuotation)`; `LeadRow`/`EMPTY_LEAD` dapat `quotation_id` | Selesai di batch 1 · e2e `crm-lead-extras.spec.ts` |
| 19 | **Lost reason wajib** saat stage = lost | `CrmViews.tsx:278,484-509` | ✅ | **`e7d281d`** — field "Alasan kalah" muncul saat stage = lost, tombol Save disabled sampai diisi (payload menyimpan `lost_reason` hanya untuk stage lost) | Selesai di batch 1 · e2e `crm-lead-extras.spec.ts` |
| 20 | `stage_changed_at` ditulis setiap kali stage berubah | `CrmViews.tsx:279,534` | ✅ | **`e7d281d`** — ditulis di `save` lead **dan** saat pindah stage di Pipeline; pakai `sqlDateTime()` (ISO ditolak MySQL) | Selesai di batch 1 |
| 21 | **API publik web-to-lead** `POST /api/public/crm/lead` (CORS `*`) | `N/routes/api/public/crm/lead.ts` | ⚠️ | **`31f1224` — boilerplate OPSIONAL (bukan wajib)**: `POST /api/public/leads` sudah ada beserta verifikasi API key constant-time + rate limit 30/menit/workspace + validasi payload; ditambatkan di `src/server.ts` dan **nonaktif secara default** (`PUBLIC_LEAD_API_ENABLED`, `PUBLIC_LEAD_API_KEYS`). Perbedaan dari New: New memakai CORS `*`; catatan CORS/anti-spam ditulis di `INTEROP-BOILERPLATE.md`. Sisa opsional: tabel `public_api_keys` bila ingin kelola key via UI |
| 22 | **Reminder follow-up harian via WhatsApp** `POST /api/public/hooks/crm-followup-reminders` | `N/routes/api/public/hooks/crm-followup-reminders.ts` | ⚠️ | **`31f1224` — boilerplate OPSIONAL (bukan wajib)**: `POST /api/cron/reminders` + `src/lib/reminders.server.ts` (AR jatuh tempo & follow-up CRM telat, read-only) + adapter `whatsapp.server.ts` (no-op bila env kosong). **Tanpa scheduler in-process** — dipicu cron eksternal (contoh crontab ada di `INTEROP-BOILERPLATE.md`). Nonaktif default (`CRON_API_ENABLED`, `CRON_SECRET`). Sisa opsional: dedupe lewat kolom `last_reminded_at`, penerima per workspace, provider WA spesifik | crontab host. Pesan dikirim ke nomor lead |

## E. Platform & UI

| # | Perubahan di New | File New | Status Old | Catatan port |
|---|---|---|---|---|
| 23 | Halaman **User Guide** bilingual EN/ID (akordeon, pencarian, print) | `N/lib/guide.ts`, `N/routes/app/w.$workspaceId.guide.tsx` | ✅ | **`0b7db02`** — `O/lib/guide.ts` (324 baris, tanpa dependensi Supabase) + `O/routes/app/w.$workspaceId.guide.tsx` | Selesai di batch 1 · e2e `guide.spec.ts` |
| 24 | Menu bantuan topbar "XPERD Help Center" (Guide + Assistant) menggantikan tombol Sparkles | `N/components/app/AppTopbar.tsx:5-14,140-174` | ✅ | **`0b7db02`** — tombol Sparkles → `DropdownMenu` `CircleHelp` berisi Panduan Pengguna (→ route guide) + XPERD Assistant | Selesai di batch 1 · e2e `guide.spec.ts` |
| 25 | Admin: **Reset transaksi tenant** (ketik RESET, hapus semua transaksi, master data tetap) | `N/lib/admin-users.functions.ts:193-251`; `N/routes/app-admin/tenancy.tsx:332-351` | ✅ | **`1627aa0`** — murni kode: `adminResetTenantTransactions` (admin-only `requireAdmin`, `TX_TABLES` urut anak→induk, dijalankan dalam **satu transaksi MySQL** + COUNT verifikasi **di dalam** transaksi sehingga tidak mungkin setengah jalan) + reset turunan (`fa_assets`, `cb_accounts.opening_balance`, `crm_leads.quotation_id`) + tombol di `tenancy.tsx` dengan konfirmasi ketik **RESET** + e2e `admin-tenant-reset-guard.spec.ts` (batal / kata salah = tidak ada perubahan, tanpa menghapus data dev). Tanpa tabel/kolom/migrasi baru, tanpa trigger DB |ransaksi MySQL, urutan hapus anak → induk, guard platform admin |
| 26 | Perbaikan keterbacaan heading di dark mode | `N/styles.css:163-167` + beberapa route | ✅ | **`0b7db02`** — **bukan cuma 1 baris CSS**: `.dark .text-navy:not([class*="dark:text-"])` → `.dark .text-navy` **plus 10 kelas** `dark:text-primary-foreground` → `dark:text-foreground` di `ModuleDashboard` (4), `w.$workspaceId.$moduleId` (3), `w.$workspaceId.index` (3). Old kini 86 occurrence (sama dengan New) | Selesai di batch 1 |
| 27 | Tombol Save di Settings pindah ke bawah | `settings.tsx:288` | ✅ | **`0b7db02`** — tombol Save dipindah setelah grid field (sebelum `</form>`) | Selesai di batch 1 |

## F. Tidak perlu di-port (infra Lovable/Supabase)

- `.validator()` → `.inputValidator()`: di versi TanStack Start yang dipakai Old, `inputValidator` justru deprecated.
- `integrations/supabase/previewAuthStorage.ts`, `client.ts`: auth preview Lovable.
- `drizzle-kit`, `drizzle-orm`, `postgres`, `drizzle.config.ts`: tooling Supabase. `html2canvas` sudah ada di Old.
- `integrations/supabase/types.ts`, `routeTree.gen.ts`: hasil generate.

---

## Kebutuhan DB di Old

- **Migration `007`**:
  - `ALTER TABLE workspaces ADD COLUMN logo_url MEDIUMTEXT NULL;`
  - `ALTER TABLE cb_transactions ADD COLUMN attachment_url VARCHAR(512) NULL;`
- Daftarkan kolom baru di whitelist `O/lib/platform.functions.ts:43`, `O/lib/data.functions.ts:40`, dan SELECT `O/lib/app-shell.functions.ts:82`.
- Kolom CRM (`lost_reason`, `stage_changed_at`, `quotation_id`) **sudah ada**.

## Urutan port yang disarankan

1. **Cepat, tanpa DB:** #23-24 Guide + topbar, #26 dark mode, #1-3 dan #6 print/DO, #18-20 CRM UI, #27.
2. **Alur transaksi:** #7 + #8 bersamaan, lalu #10-11 hapus hanya draft, lalu #9 Edit Draft.
3. **Migration 007:** #4-5 logo, lalu #12-13 bukti Cash Out beserta layer upload file.
4. **Butuh keputusan:** #21 API publik lead, #22 reminder WA + cron, #25 reset transaksi tenant.

---

## Batch 2 — Ekspor `Xperd One Business Suite New 2` (modul baru: Slipp HR)

Dibanding ekspor `Business Suite New` yang sudah diporting penuh di Batch 1, ekspor
`New 2` menambah **satu modul baru + pendukungnya**. Ini **fitur baru, bukan parity
Batch 1**, jadi belum diporting dan menunggu keputusan.

> **Rencana & progres porting**: `Xperd One Old Production /SLIPP-HR-PORTING.md`
> (di dalam repo Old, ikut ter-commit — commit `601b60a`).

| # | Perubahan di New 2 | Bukti | Dampak ke Old |
|---|---|---|---|
| 28 | **Modul HR jadi add-on "Slipp HR"** (`addon: "slipp_hr"`), 7 submodule: Employees, Departments, Positions, PTKP & TER, Salary Components, Payroll & Payslips, BPJS & PPh 21 | `N2/lib/modules.ts:246-266` | `O/src/lib/modules.ts:248-261` masih placeholder `disabled: true` dengan submodule `attendance` |
| 29 | **Halaman HR**: `HrView` (1.336 baris) + `HrDashboard` (232 baris) | `N2/components/app/HrViews.tsx`, `HrDashboard.tsx` | belum ada di Old; perlu port Supabase → server fn MySQL |
| 30 | **Logika payroll**: PTKP (TK/0…K/3), TER kategori A/B/C + bracket, tarif BPJS, `computePayslip()`, `HR_ACCOUNTS`, `periodLabel()` | `N2/lib/hr.ts` (201 baris) | murni TypeScript — bisa diporting hampir apa adanya |
| 31 | **Tabel baru**: `hr_employees`, `hr_org_units`, `hr_pay_components`, `hr_payroll_runs`, `hr_payslips` (+ memakai `acc_journal_entries`/`acc_journal_lines`) | grep `.from(...)` di `HrViews.tsx` | perlu **migration 008**; ekspor tidak memuat migration HR (jumlah migration sama 26 vs 26) dan DB dev Old belum punya tabel `hr_*` |
| 32 | **`addons.pricing_unit`** — add-on bisa dihargai per karyawan/bulan | `N2/lib/addons.ts:13,72`; `N2/routes/app/w.$workspaceId.billing.tsx:328` | kolom baru di `addons` + label billing "karyawan/bln"; harga Slipp HR **Rp15.000/karyawan/bulan** |
| 33 | **5 COA default baru**: 1250 Piutang Karyawan, 2210 Hutang PPh 21, 2300 Hutang BPJS, 6200 Beban Gaji & Tunjangan, 6210 Beban BPJS Perusahaan | `N2/lib/provisioning.server.ts:8-30` | tambahkan ke `O/src/lib/provisioning.server.ts` |
| 34 | **Panduan HR** diganti dari "coming soon" jadi 5 langkah nyata (komponen gaji → karyawan → payroll → approve & posting jurnal → rekap BPJS/PPh 21) | `N2/lib/guide.ts` (entri `id: "hr"`) | ganti entri placeholder di `O/src/lib/guide.ts` |
| 35 | Wiring route: `moduleId === "hr"` → `HrDashboard`, submodule → `HrView` | `N2/routes/app/w.$workspaceId.$moduleId.index.tsx`, `...$submoduleId.index.tsx` | 2 tambahan kecil di Old |

Catatan: `N2/src/integrations/supabase/types.ts` juga berubah (tipe generated) — tidak relevan untuk Old yang memakai MySQL.

### Rencana porting (usulan bertahap)
1. **Migration 008** — 5 tabel `hr_*` + kolom `addons.pricing_unit` + whitelist di data layer.
2. **`lib/hr.ts`** — port murni (PTKP/TER/BPJS/`computePayslip`) tanpa I/O, aman diverifikasi `tsc`.
3. **`modules.ts` + gating add-on** — `hr` → `addon: "slipp_hr"` + 7 submodule.
4. **`HrDashboard` + `HrViews`** — port UI, ganti Supabase → `listWorkspaceRows`/`saveWorkspaceRow`/`deleteWorkspaceRow` + posting jurnal ke `acc_journal_*`.
5. **Billing/addons `pricing_unit`** + label harga per karyawan.
6. **COA provisioning + entri panduan** + e2e (dashboard HR, CRUD karyawan, generate payroll 1 periode, cetak slip).

Perkiraan: ±1.800 baris UI + 5 tabel; sebaiknya dipecah menjadi 3–4 commit terpisah.
