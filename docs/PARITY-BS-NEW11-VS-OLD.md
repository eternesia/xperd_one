# Parity BS **New 11** vs Old Production

Acuan kode: `Xperd One Business Suite New 11` (dibandingkan dengan
`Xperd One Business Suite New 10`). Metode kerja: [`PARITY-METHOD-LIVE-FIRST.md`](PARITY-METHOD-LIVE-FIRST.md);
aturan data-layer: [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md). Riwayat sebelumnya:
[`PARITY-BS-NEW10-VS-OLD.md`](PARITY-BS-NEW10-VS-OLD.md).

> Catatan: `PRD.md`/`PARITY-BS-NEW10-VS-OLD.md` masih menulis XPro "belum ada di Old".
> Itu sudah usang — XPro fase 1+2 diporting di Ronde 33 (`016_xpro.sql`, `e2e/xpro.spec.ts`).

## 1. Klaster New 11 dan status di Old

| # | Klaster | Menyentuh uang | Status di Old |
|---|---|---|---|
| 9 | XPro Kanban Tugas + kolom dinamis + Beban Kerja Tim (`managerOnly`) | tidak | ✅ **Ronde 36** |
| 11 | Navigasi submodul bergrup (`SubmoduleNav`, `groupSubmodules`) | tidak | 🟡 infrastruktur selesai (Ronde 36); pengelompokan CRM menunggu klaster 5/6 |
| 10 | Cash In/Out import Excel (`cashbank-import`, `cashbank-filter`) | ya | ⬜ belum |
| 8 | Visitor tracking + dasbor Super Admin + pencarian/pagination tabel admin | tidak | ⬜ belum |
| 5 | Qalling publikasi: Posts, Media, Ideas, Tebar | tidak | ⬜ belum |
| 6 | Interaksi + Native Meta: Inbox, Comments, Automations, webhook | tidak | ⬜ belum |
| 7 | Email Gateway (OTP) | tidak | ⬜ belum |
| 4 | Qalling standalone (situs, daftar/masuk tanpa kata sandi) | sebagian | ⬜ belum (butuh desain JWT, bukan magiclink Supabase) |
| 1 | Wallet tenant (ledger tak bisa diubah, top-up, Midtrans) | **ya** | ⬜ belum — butuh persetujuan pemilik produk |
| 2 | Checkout langganan dari saldo, perpanjangan, ganti paket instan | **ya** | ⬜ belum — idem |
| 3 | Add-on bertingkat + entitlement + kuota | **ya** | ⬜ belum — idem |
| 12 | `zod` 3→4, `mcp-js` 3.3, `vite-tanstack-config` 2.26.5 | n/a | ⏭️ khusus Lovable / keputusan terpisah |

Migrasi New 11 (`drizzle/migrations/0000–0016`) hanya memuat migrasi **baru** dan
dinomori ulang; tabel `prj_board_columns` tidak punya berkas migrasi di sana (hanya
ada di `types.ts`), jadi skemanya diturunkan dari tipe tersebut.

## 2. Ronde 36 — XPro Kanban & Beban Kerja (selesai)

| Perubahan | Berkas |
|---|---|
| Tabel kolom papan per proyek, kunci unik `(project_id, key)` | `db/migrations/017_xpro_board.sql` |
| Whitelist data layer (tanpa ini nilai dibuang senyap) | `src/lib/data.functions.ts` (`WORKSPACE_TABLES` + `COLS`) |
| Helper murni papan & beban kerja (disalin apa adanya) | `src/lib/xpro-board.ts` |
| `XproKanbanView`, `XproWorkloadView` (UI disalin; data lewat server fn MySQL) | `src/components/app/XproKanban.tsx` |
| Submodul `kanban` (semua penerima tugas) dan `workload` (khusus manager); submodul keuangan XPro jadi `managerOnly` | `src/lib/modules.ts` |
| `managerOnly` ditegakkan di `canViewSubmodule`/`canEditSubmodule` | `src/lib/app-context.tsx` |
| Sidebar bergrup + ikon, tautan Dasbor disembunyikan untuk Staff/Viewer di XPro | `SubmoduleNav.tsx`, `routes/app/w.$workspaceId.$moduleId.tsx` |
| Dasbor XPro untuk Staff/Viewer = papan Kanban miliknya | `XproViews.tsx` |

Padanan data-layer: `db.from(...).upsert(onConflict)` → `upsertWorkspaceRows` yang
memanfaatkan kunci unik MySQL; hapus kolom → pindahkan kartu lewat `saveWorkspaceRow`
lalu `deleteWorkspaceRow` pada baris kolom yang tersimpan (kolom bawaan belum tersimpan
tidak punya baris).

### Bukti
- `npx tsc --noEmit` → 0 error; ESLint 0 error pada berkas yang disentuh.
- `e2e/xpro-kanban.spec.ts` ✅ (angka/DB dihitung ulang dari SQL): kolom bawaan, drag kartu →
  `status='done'` + progres 100, tambah kolom kustom (5 baris tersimpan), hapus kolom
  (kartu pindah ke kolom pertama, baris hilang), KPI Beban Kerja = hitungan SQL + level
  `Overload`/`Light`, Staff (dicocokkan lewat email anggota tim) hanya melihat papannya,
  tanpa menu keuangan/Beban Kerja/Dasbor, dan bisa memindah kartunya sendiri.
- Regresi: `xpro.spec`, `modules.spec`, `team-role-enforcement.spec`, `launcher.spec` ✅.

### Belum terbukti / batas yang diketahui
- **Tidak dibandingkan dengan `xperd-one.lovable.app`.** XPro adalah add-on yang belum aktif
  di workspace acuan DNICORP (lihat metode §5), jadi halaman isinya tidak bisa dibuka di
  live. Paritas ditetapkan dari kode ekspor New 11 saja. Perlu diulang bila add-on diaktifkan.
- `managerOnly` hanya penegakan sisi UI/navigasi (sama seperti New 11, yang mengandalkan
  RLS untuk data). Di Old, `saveWorkspaceRow` hanya memeriksa `canWriteWorkspace`, sehingga
  Staff yang memanggil server fn langsung masih bisa menulis `prj_*`. Perlu keputusan bila
  ingin penegakan di server.
- Uji drag & drop memakai gerakan mouse bertahap dan viewport 2400 px; pada layar sempit
  papan memakai `<select>` pemindah kolom (tidak diuji e2e).

## 3. Ronde 37 — samakan dengan `xperd-one.lovable.app` (HR + CRM sebagian)

Dasar: capture live DNICORP (add-on CRM/HR/XPro kini aktif) vs Old —
`audit/parity-report-new11-crm-hr-xpro.md` (35 halaman: ✅ 11 · ⚠️ 19 · ❌ 5).
Perbandingan hanya **baca** di live; perilaku tulis dibandingkan dengan kode New 11
(identik dengan live).

### Slipp HR — selesai
Kode HR New 2 = New 10 = New 11 (0 baris beda), tetapi Old menyimpang di Payroll/Rekap.
Disamakan (`HrViews.tsx`): judul "Payroll", deskripsi, tombol "Run payroll" (ikon Play),
"Paid from" **wajib** ("Choose the paying cash/bank account."), daftar hanya tombol Open,
dialog slip (Pokok/Tunjangan/BPJS/PPh 21/Potongan/Bersih) + unduh PDF & cetak per slip,
"Delete draft" hanya untuk draft, "Posted to GL"; jurnal `JV/PAY/YYYYMM`;
Rekap BPJS & PPh 21 (5 kartu + tabel tanpa kolom Net, tanpa tombol cetak).
**Bug Old yang ikut diperbaiki:** `upsertWorkspaceRows` memakai `ON DUPLICATE KEY UPDATE`
sehingga payroll kedua pada periode yang sama *menimpa total run lama*; kini INSERT biasa
dan periode ganda ditolak ("Payroll for this period already exists.").
Nilai DB status tetap `approved` (tidak terlihat user; dashboard HR memakainya).
Bukti: `e2e/hr-payroll.spec.ts` (bank wajib, periode ganda tidak menimpa, draft→posting,
jurnal seimbang = hitung ulang SQL, rekap BPJS = SQL) dan `e2e/hr-tax-bpjs.spec.ts`;
`audit-dialog-parity --module hr`: form employees/departments/positions/components ✅ sama.
Sisa ⚠️ HR di laporan hanya karena data (live punya baris payroll, dev Old kosong) dan
`aria-label` "Delete" yang hanya ada di Old (live tombol ikon tanpa label).

### Qalling CRM — sebagian
- ✅ Judul modul "Qalling CRM"; sidebar bergrup + ikon (Sales/Messaging/Publishing/Analytics/
  Tender/Settings), "Posts", "Insights"; urutan modul launcher `hr` sebelum `omnix`.
- ✅ Pipeline = Kanban drag & drop berwarna, header "Rp total · probabilitas%"; memindah kartu
  menyimpan stage/probability/status. ✅ Kode lead baru = nomor LEAD-xxxx tertinggi + 1.
  Bukti: `e2e/crm-pipeline.spec.ts` + regresi `crm*.spec`, `launcher`, `modules`.
- ⬜ Belum: Ideas, Media, Comments, Inbox, Automations; Posts composer (Daftar/Minggu/Bulan,
  Tebar/Meta); Social Accounts (Resync/Tebar); keadaan kosong Post Scheduler ("Connect a social
  account first"); ukuran halaman bawaan paginasi live ("25 / page"); Email Gateway/Native Meta.

## 4. Ronde 38 — Qalling Ideas & Media (selesai) + temuan live ≠ New 11

| Perubahan | Berkas |
|---|---|
| Tabel `crm_idea_columns`, `crm_ideas`, `crm_media` | `db/migrations/018_crm_ideas_media.sql`, whitelist `data.functions.ts` |
| `CrmIdeasView` (Kanban ide; teks Indonesia hardcode seperti sumbernya) | `components/app/CrmIdeas.tsx`, `lib/social-interaction-rules.ts` |
| `MediaLibraryView` + `MediaPickerDialog` (untuk composer Posts nanti) | `components/app/CrmMedia.tsx` |
| Berkas media: video diizinkan, batas 50 MB hanya untuk folder `crm/media`; rute berkas mengizinkan `crm_media` | `files.server.ts`, `files.functions.ts`, `routes/api/workspace-files.ts` |
| Submodul `ideas`, `media` di sidebar Publishing (Posts → Ideas → Media → Social Campaigns) | `modules.ts`, `CrmViews.tsx` |

Bukti: `e2e/crm-ideas-media.spec.ts` ✅ — Ideas: kolom bawaan Todo/Progress/Done dari tombol "Mulai papan ide", tambah/pindah (select & drag)/cari/ubah/hapus, kolom berisi tidak bisa dihapus.
Media: unggah gambar+video → baris `crm_media` + isi byte identik lewat rute berkas, tipe lain ditolak,
filter/cari, pratinjau memuat gambar, hapus → baris hilang & berkas 404. Regresi `modules`, `launcher`,
`crm*`, `team-role-enforcement`, `xpro-kanban` ✅.
Bar kuota penyimpanan tier (`storageQuota`) sengaja belum ada (klaster wallet/entitlement).

### Temuan: live yang sedang berjalan ≠ kode New 11
Capture live DNICORP (2026-10-30): `crm/ideas`, `crm/comments`, `crm/inbox`, `crm/automations`
menampilkan placeholder **"Next rollout — The <x> menu is being prepared and will connect via Tebar in
the next rollout."**, padahal kode New 11 sudah punya Kanban Ideas dan view lainnya. Artinya versi yang
dipublikasikan di live tertinggal dari snapshot New 11 untuk empat submodul itu (menu ada, view belum).
`crm/media` di live sudah nyata (Media Library). Keputusan yang diperlukan: ikuti live yang sedang
berjalan (placeholder) atau ikuti kode New 11 (view nyata). Sementara: Ideas = view nyata (New 11);
Comments/Inbox/Automations belum dikerjakan.

## 5. Ronde 39 — Inbox, Comments, Automations (Meta native) — irisan A selesai

Keputusan pemilik produk (2026-10-30): **ikuti kode New 11** (live yang berjalan masih menampilkan
placeholder "Next rollout" untuk empat submodul ini — lihat §4).

| Perubahan | Berkas |
|---|---|
| Tabel `crm_conversations`, `crm_messages`, `crm_social_comments`, `crm_automation_rules`, `crm_automation_runs`; kolom `crm_meta_settings.native_social_enabled/webhook_verify_token/oauth_expires_at`, `crm_social_tokens.page_id` | `db/migrations/019_crm_native_inbox.sql` |
| Padanan fungsi SQL `crm_ingest_meta_message` → transaksi aplikasi (`SELECT … FOR UPDATE`, `INSERT IGNORE` idempoten) | `lib/social-interactions.server.ts` |
| Kirim DM/balas komentar (Graph API), automasi dengan klaim durable `UNIQUE(rule_id,event_id)` | idem |
| Server fn: daftar/balas komentar, papan automasi + kelola aturan, daftar percakapan/thread, tandai dibaca/selesai, kirim pesan idempoten (`messageId`) | `lib/social-interactions.functions.ts` |
| Webhook Meta: handshake `hub.verify_token`; POST wajib `x-hub-signature-256` (HMAC-SHA256 App Secret); payload dibatasi 1 MB | `routes/api/public/meta/webhook.ts` |
| Tampilan Comments/Automations/Inbox (UI disalin dari New 11) + submodul seksi "Interaction" di sidebar | `CrmInteractions.tsx`, `CrmInbox.tsx`, `modules.ts`, `CrmViews.tsx` |

Bukti `e2e/crm-interactions.spec.ts` ✅ (tanpa trafik ke Meta; data masuk lewat webhook yang ditandatangani
di spec): handshake benar/salah (200/403), POST tanpa/ salah tanda tangan → 401, payload rusak → 400;
ingest DM idempoten (webhook diulang tidak menggandakan pesan), unread, jendela balasan 24 jam = hitungan
SQL; Inbox: daftar, badge belum dibaca, baca → unread 0, catatan internal (`note`), balasan tanpa token ditolak
sebelum jaringan ("Hubungkan ulang akun Meta."), selesaikan/buka lagi, jendela ditutup → kolom nonaktif;
Automations: buat aturan, cocok kata kunci → 1 eksekusi, webhook diulang → tetap 1 (klaim durable), tak cocok →
tidak ada eksekusi, riwayat tampil, switch; Comments: ingest idempoten, kelompok per postingan, balas → status
`failed` tanpa token dan tombol Balas nonaktif.

**Deviasi dari New 11 (sengaja):** percakapan baru memakai `last_message_at` = waktu pesan pertama
(di New 11 default `now()` > waktu event Meta sehingga `last_message` pesan pertama tetap kosong dan Inbox
menampilkan "Lampiran"). Fitur Qalling diperiksa lewat add-on `qalling` aktif (belum ada tier/entitlement).

**Belum terbukti:** pengiriman sukses ke Graph API (tidak diuji, agar tidak ada pesan nyata); butuh App Meta
dan izin terverifikasi. `META_GRAPH_BASE` bisa menunjuk server tiruan.
**Belum ada (irisan B):** layar Super Admin "Social Connector" (`NativeMetaSettings`/`configureNativeMeta`,
`getNativeMetaAdmin`), tombol native connect + OAuth state sekali pakai + langganan Page webhook. Tanpa irisan B,
opt-in `native_social_enabled` dan akun `source='meta'` baru bisa dibuat lewat DB — halaman tetap menampilkan
keadaan kosong yang benar.

## 6. Ronde 40 — konektor sosial Super Admin, Social Accounts, Posts (irisan B + C)

| Perubahan | Berkas |
|---|---|
| `tebar_settings`; kolom `crm_scheduled_posts` (`source`, `external_id`, `media_paths`, `permalinks`) | `db/migrations/020_social_connector.sql`, `data.functions.ts` |
| Konektor Tebar: API Tebar, profil per workspace, connect link, sinkron akun & postingan, publikasi | `lib/tebar.server.ts`, `lib/tebar.functions.ts`, `lib/tebar-posts.ts` |
| Super Admin → **Tebar Connector** (API key + penugasan akun ke workspace) + **Meta Native · Beta** (workspace, App ID, App Secret, Verify Token, switch aktif) | `routes/app-admin/tebar.tsx`, `NativeMetaSettings.tsx`, `lib/meta-inbox.functions.ts`, nav `app-admin.tsx` ("Integrasi & Konten") |
| Meta: App ID/Secret hanya Super Admin; tenant hanya "Connect natively" (Owner/Admin, state OAuth sekali pakai 10 menit, scope New 11), callback menolak bila akun FB/IG Tebar masih aktif, langganan webhook Page, `page_id` token | `lib/meta-social.functions.ts`, `routes/api/public/meta/callback.ts` |
| Publikasi: Tebar + Meta native, media pustaka lewat **URL bertanda tangan** (pengganti signed URL bucket), hook cron mengklaim atomik & melewati postingan Tebar | `lib/meta-publish.server.ts`, `lib/crm-media.server.ts`, `routes/api/public/crm-media.ts`, `hooks/social-publish.ts` |
| Social Accounts (kartu hubungkan Tebar, kartu Meta native, tambah manual), **Posts** (composer: caption, media pustaka/link, jadwal, akun; Simpan draft / Jadwalkan / Post now; Daftar/Minggu/Bulan; sinkron Tebar), Insights | `components/app/CrmSocial.tsx` |

Bukti `e2e/crm-social.spec.ts` ✅ (tanpa trafik eksternal): keadaan kosong Posts ("Connect a social account first"
— akun manual tidak dihitung), kartu Tebar "Connection is not enabled by XPERD admin yet.", kartu "Facebook &
Instagram · Meta" + Beta hanya setelah Super Admin mengaktifkan, tambah/hapus akun manual (field Platform,
Account name, Username, Profile URL → baris DB), composer (validasi "Add a caption or media", Jadwalkan →
`status='scheduled'` + `account_ids` JSON, hitungan tab/header, tampilan Bulan, Simpan draft, **Post now** pada
akun Meta tanpa token → `failed` + "Account is not connected via Meta", hapus). Regresi 11 spec ✅.

Perbandingan live (`audit/parity-report-crm-social-ronde40.md`): `post-scheduler` ✅, `social-dashboard` ✅;
`social-accounts` hanya beda tombol **Resync** (konfigurasi: live punya API key Tebar aktif, dev Old belum);
`media` beda karena data (live 1 file). `ideas/comments/inbox/automations`: live masih placeholder (§4).

**Belum terbukti:** panggilan nyata ke Tebar API (butuh API key) dan Meta (verifikasi App ditunda sesuai
keputusan pemilik produk); kuota tier (tidak ada batas akun/kuota yang tampil); layar Super Admin belum
dibandingkan dengan halaman admin live.

## 7. Ronde 41 — Super Admin (dashboard, pengunjung website, tabel) + filter akun Kas & Bank

| Perubahan | Berkas |
|---|---|
| **Dashboard eksekutif** (KPI deposit/pembayaran/piutang/top-up, tren 6 bulan, status tenant, 8 kartu operasional, daftar top-up & invoice terbaru) | `routes/app-admin/index.tsx`, `lib/admin-dashboard.functions.ts` |
| **Pengunjung Website** (filter situs & 7/30/90 hari, KPI, tren, halaman terpopuler + cari, sumber) | `routes/app-admin/visitors.tsx`, `lib/visitor-dashboard.functions.ts`, nav "Pengunjung Website" |
| Pencatatan kunjungan anonim: `VisitorTracker` (hormati Do-Not-Track, 1× per halaman per sesi) → `POST /api/public/visit` (validasi jalur/situs, `INSERT IGNORE` idempoten), tabel `website_visits` | `components/VisitorTracker.tsx`, `routes/api/public/visit.ts`, `lib/visitor-rules.ts`, `db/migrations/021_website_visits.sql`, `__root.tsx` |
| Pencarian + paginasi 10 baris/halaman ("a–b dari N") di Tenancy, Registrations, Users, Invoices, Plan & Packages, Add-ons (langganan), Announcements, Help Desk | `components/app/admin-table.tsx` + 8 halaman `routes/app-admin/*` |
| `matchesCbAccount`: hanya transfer yang memengaruhi akun lawan (Cash In/Out dengan lawan basi tidak bocor ke buku mutasi/filter akun lain) | `lib/cashbank-filter.ts`, `CashBankViews.tsx` (4 pemakaian) |

Bukti: `e2e/admin-dashboard-visitors.spec.ts` ✅ (validasi kunjungan: 12 kasus ditolak senyap, idempoten, pencatatan nyata dari browser
untuk halaman XPERD & Qalling; KPI dashboard & pengunjung = hitungan SQL, termasuk filter situs/pencarian),
`e2e/admin-tables.spec.ts` ✅ (8 halaman: format pager, total = SQL, halaman berikutnya/sebelumnya, cari kosong → 0–0 dari 0),
`e2e/cash-bank-account-filter.spec.ts` ✅. Regresi `admin*`, `billing`, `register-flow`, `site-header`, `auth` ✅.

**Catatan jujur:**
- Dashboard: bagian **deposit / saldo / top-up** bersumber dari tabel wallet (klaster wallet, belum ada) ⇒ bernilai 0 dan tautannya
  sementara ke Invoices (halaman `/app-admin/wallet` belum ada). Angka lain nyata.
- **Import Excel Cash In/Out: tidak ada yang bisa diporting.** Di New 11 `cashbank-import.ts` hanya pustaka murni + tes; tidak dipakai
  UI mana pun (roadmap upstream: layar draft/review/posting belum selesai). Akan diporting saat New 12+ memakai UI-nya.
- `e2e/cash-bank-trx-number.spec.ts` gagal di dev bukan karena perubahan ini: periode **2026-10 terkunci (hard lock, dibuat 2026-10-12)**
  sehingga Cash In bertanggal hari ini ditolak. Kunci itu data dev; tidak saya ubah tanpa persetujuan.

## 8. Ronde 42 — Wallet tenant bersama, Tahap 1 (keputusan pemilik produk: ikuti New 11 sepenuhnya)

| Perubahan | Berkas |
|---|---|
| Tabel `wallet_accounts` (saldo ≥ 0), `wallet_ledger` (**hanya tambah**, kunci idempotensi unik, jenis topup/subscription/addon/usage/refund/adjustment/voucher), `wallet_settings` (min 50.000 · maks 10.000.000 · preset), `topups`; saldo awal Omnix dipindah sebagai entri `adjustment` pembuka | `db/migrations/022_wallet_core.sql`, seed dev `006_dev_wallet_gateways.sql` |
| Padanan fungsi SQL `wallet_post_entry` / `wallet_create_topup` / `wallet_settle_topup` → transaksi aplikasi + `SELECT … FOR UPDATE` + idempotensi (`idempotency_conflict`, `insufficient_balance`) | `lib/wallet.server.ts` |
| Server fn: saldo & riwayat, ajukan top-up (transfer manual / Midtrans Snap), unggah bukti (JPEG/PNG/PDF ≤ 5 MB, cek magic bytes), lihat bukti, daftar & review Super Admin (tolak **wajib beralasan**), ekspor CSV, rekonsiliasi status gateway | `lib/wallet.functions.ts`, `lib/wallet/rules.ts`, `lib/wallet/gateway.server.ts` |
| Webhook Midtrans: SHA-512 signature, nominal harus sama, settle idempoten, expire/cancel/deny → status | `routes/api/public/webhooks/wallet-midtrans.ts` |
| Bukti transfer hanya untuk anggota tenant / Super Admin | `routes/api/workspace-files.ts` |
| UI: **WalletPanel** (Billing + Omnix), **Deposit & Top-up** Super Admin (+ menu), dashboard admin kembali memakai data wallet | `WalletPanel.tsx`, `WalletTopupAdmin.tsx`, `routes/app-admin/wallet.tsx`, `routes/app/w.$workspaceId.billing.tsx` |
| Omnix memakai saldo bersama: biaya per transaksi = entri `usage`, paket bulanan = entri `addon` (idempoten per siklus); alur top-up lama dihapus; riwayat lama tetap tampil ("Legacy Omnix history"); `omnix_wallets.balance` jadi cermin | `lib/omnix.functions.ts`, `OmnixViews.tsx`, `routes/app-admin/addons.tsx` |

Bukti: `e2e/wallet.spec.ts` ✅ (ajukan → unggah bukti PNG → tolak dengan alasan [saldo & ledger tak berubah] → ajukan lagi → setujui;
tanda terima `TOP-<id>` product=wallet, entri ledger `topup` dengan `balance_after`, saldo akun = cermin Omnix = hitungan SQL,
bukti terbaca anggota & ditolak untuk path lain), `e2e/omnix.spec.ts` diperbarui (biaya Rp25 tercatat di wallet bersama),
`admin-dashboard-visitors.spec.ts` (KPI deposit = SQL). Regresi 10 spec ✅.

**Belum (Tahap 2+ klaster uang):** `payInvoiceFromWallet`, perpanjangan otomatis (cron per jam), checkout langganan/ganti paket
dengan prorata, tab Billing (Balance/Invoices/Package/Add-ons/Qalling), tier & entitlement Qalling + kuota, Qalling Billing.
Verifikasi Midtrans nyata ditunda (butuh server key). Ledger "tidak bisa diubah" ditegakkan di aplikasi (tidak ada jalur UPDATE/DELETE);
tidak ada trigger MySQL (aturan repo).

## 9. Ronde 43 — Billing ERP lewat saldo (Tahap 2A): bayar invoice, perpanjangan otomatis, ganti paket

| Perubahan | Berkas |
|---|---|
| `subscriptions.wallet_auto_renew`, `invoices.activation_applied_at`, `billing_operations` (kunci idempotensi + permintaan + hasil), `billing_policy` | `db/migrations/023_billing_wallet.sql` |
| Padanan `billing_pay_invoice` / `billing_renew_tenant` (bagian ERP) / `billing_package_quote` / `billing_package_checkout` → transaksi aplikasi (lock langganan lalu saldo), tanggal Asia/Jakarta, prorata `round((baru−lama)×sisa/total)` | `lib/billing-wallet.server.ts` |
| Server fn pemilik tenant: bayar invoice dari saldo, opt-in perpanjangan, quote & checkout paket (idempoten `idempotencyKey`, `expectedCharge` harus cocok) | `lib/subscription.functions.ts` |
| Cron per jam `POST /api/public/jobs/subscription-renewal` (maks 25 tenant; rahasia `CRON_SECRET`/`SOCIAL_PUBLISH_SECRET`, **tertutup bila tak ada rahasia**) + perpanjangan otomatis dicoba lagi setelah top-up masuk (webhook, rekonsiliasi, persetujuan admin) | `routes/api/public/jobs/subscription-renewal.ts`, `lib/cron-auth.server.ts`, `wallet.functions.ts` |
| Halaman **Billing** bertab (Balance / Invoices / Package / Add-ons), kartu "Perpanjang otomatis dari saldo", tombol "Bayar dari saldo", dialog **Package summary** (prorata, saldo, "Confirm & pay from balance"), daftar invoice menyembunyikan tanda terima deposit | `routes/app/w.$workspaceId.billing.tsx`, `platform.functions.ts` |

Bukti `e2e/billing-wallet.spec.ts` ✅ (angka dari rumus/SQL): saldo kurang → peringatan & tanpa tombol konfirmasi; upgrade Starter→Professional
`round(350.000×20/30)=233.333` (invoice `PKG-<idem>`, ledger `subscription` −233.333, langganan/tenant ikut berubah, operasi tercatat);
bayar invoice ERP −100.000 (periode baru menyambung dari akhir periode berjalan +1 bulan, `ends_at` tenant); opt-in perpanjangan; cron tanpa/dengan
rahasia salah → 403; top-up Rp50.000 < harga → `past_due` tanpa invoice; top-up Rp600.000 → invoice `renew:base:<sub>:<akhir>` + ledger "Perpanjangan ERP",
periode lanjut, status `active` kembali, saldo akhir = 650.000 − harga. `billing.spec` disesuaikan (katalog add-on di tab "Add-ons").

**Belum (sisa setelah Ronde 44):** Email Gateway, pendaftaran/login Qalling tanpa kata sandi, situs Qalling standalone.

**Data uji (permintaan pemilik produk):** tenant dev "XPERD Demo" kini punya **langganan ERP nyata** lewat seed
`db/seeds/007_dev_tenant_subscription.sql` (Professional, bulanan, aktif; periode relatif hari seed). `e2e/billing-wallet.spec.ts` tidak lagi
membuat/melewati fixture: ia mengubah baris langganan itu per skenario lalu memulihkannya persis. Seed `006_dev_wallet_gateways.sql` dan `007` hanya
berlaku bila tenant "XPERD Demo" ada (no-op di produksi, sehingga rekening contoh tidak pernah masuk produksi).

## 10. Ronde 44 — Tier & opsi add-on Qalling, entitlement, kuota

| New 11 | Old |
|---|---|
| `addon_tiers`, `addon_options`, `tenant_addon_options`, kolom baru `tenant_addons` (tier_id, overrides, wallet_managed, pending_change, grace_until…), seed Lite 49.000 / Pro 149.000 / Agency 349.000 | `db/migrations/024_addon_tiers.sql` |
| `billing_addon_entitlement`, `workspace_addon_entitlements`, `server_workspace_has_feature`, `wallet_catalog_limits`, `billing_usage_fits` | `lib/entitlements.server.ts` (tier + hibah opsi + override + grace; tier NULL = `legacy` semua fitur) |
| Trigger kuota akun/media/posting/pengguna | `lib/qalling-quota.server.ts`, dipasang di `saveWorkspaceRow`/`upsertWorkspaceRows`, Tebar, callback Meta, tambah anggota (team/admin-users). Pesan galat sama dengan New 11 |
| `billing_quote` / `billing_checkout` (prorata, jadwal downgrade, cek pemakaian, idempoten) | `lib/addon-billing.server.ts`, `lib/addon-catalog.functions.ts` |
| Perpanjangan add-on/opsi + grace (`billing_policy.addon_grace_days`=3), urutan ERP → add-on → opsi | `renewTenant` memanggil `renewAddonsOn`; cron/top-up ikut memproses |
| UI: tab **Qalling** di Billing, dialog checkout, katalog Tiers/Optional extras/tenant tier di Super Admin, bar penyimpanan Media, kuota akun Social | `AddonTierChoices`, `SubscriptionCheckout`, `AddonTierCatalog`, `AddonOptionCatalog`, `CrmMedia`, `CrmSocial`, `app-admin/addons.tsx` |
| Gating submodul CRM per fitur (`hasCatalogFeature`) | `app-context.tsx` (`entitlements`, `refreshEntitlements`) |

Bukti `e2e/addon-tiers.spec.ts` ✅ dan `e2e/addon-admin.spec.ts` ✅ (angka dari SQL/rumus): Pro dari legacy `round(149.000×20/30)`, Agency selisih
`round(200.000×20/30)`, downgrade dijadwalkan tanpa potongan, opsi 2×9.000 prorata, batas akun 40+2=42, gating Lite/Pro/Agency/legacy/override/kedaluwarsa,
kuota akun/media/video/pengguna ditolak server, perpanjangan (downgrade diblokir bila pemakaian melebihi; lolos dengan override), grace = `ends_at`+3 lalu pulih
setelah top-up, aturan harga tier vs kapasitas akun.

**Asumsi/batas jujur:** (1) repo New 11 tidak menyertakan baris opsi — 3 opsi contoh (akun/pengguna/penyimpanan) ditambahkan dan dapat diubah Super Admin;
(2) cek kuota di jalur generik adalah *pre-check* (tanpa kunci advisory seperti trigger Postgres) sehingga balapan sangat sempit mungkin lolos;
(3) seperti New 11, status `grace` tidak membuka modul CRM di UI (hanya `active/trial`), sementara entitlement server tetap berlaku sampai `grace_until`.

## 11. Ronde 45 — Email Gateway, Login & Pendaftaran, Qalling tanpa kata sandi, situs Qalling standalone, tool MCP

| New 11 | Old |
|---|---|
| `email_gateway_settings` (rahasia hanya server), `platform_auth_settings` (trial default 14 hari), `registration_otps`, `login_otps` | `db/migrations/025_email_auth.sql` |
| Pengiriman Brevo/Resend/SendGrid (HTTP API; SMTP langsung tetap "persiapan") — **kode pihak ketiga disalin apa adanya**, basis URL dapat ditimpa `EMAIL_API_BASE_<PROVIDER>` untuk uji | `lib/email-gateway.server.ts`, `email-gateway.functions.ts`, `EmailGatewayPanel.tsx`, `app-admin/email.tsx`, tab "Notifikasi Email" di Settings workspace |
| `app-admin/auth-settings.tsx` (Google, kode email, lama trial 1–90) | `routes/app-admin/auth-settings.tsx`, `savePlatformAuthSettings`; menu Super Admin "Email Gateway" & "Login & Pendaftaran" |
| `provisioning-core.server.ts` (tenant trial, langganan, workspace, tier Qalling trial tanpa invoice ERP) | `lib/provisioning-core.server.ts`; provisioning admin kini memakai inti yang sama (trial dari pengaturan platform) |
| Pendaftaran mandiri ERP: OTP + kata sandi, email selamat datang | `lib/signup.functions.ts`, halaman `/register` (tanpa gateway aktif tetap masuk antrean admin) |
| Qalling tanpa kata sandi: daftar (pilih paket → nama+email → kode), masuk (kode, respons sama untuk email tak dikenal, throttle 60 dtk, 5 percobaan, kode sekali pakai, hash SHA-256) | `lib/qalling-auth.functions.ts`. **Beda yang disengaja:** New 11 menukar token magiclink Supabase; Old langsung menerbitkan cookie JWT httpOnly yang sama dengan `/auth` |
| Situs Qalling: Beranda, Solusi, Fitur, Kelebihan, Harga, Kontak, Daftar, Masuk; aplikasi: Beranda (saldo, paket, grafik), Kalender, AI, Tagihan & Saldo (Saldo/Paket/Riwayat), menu CRM per fitur tier; logo & favicon Qalling | `routes/qalling.*.tsx`, `components/qalling/*` (disalin dari New 11; akses data diganti server function MySQL) |
| 6 tool MCP `qalling_*` (akun sosial, posting, draf posting, cari/buat lead, buat ide + media) | `lib/mcp/tools/qalling-*.ts` (MySQL; cek anggota, izin tulis, fitur tier, kuota) |

Bukti `e2e/qalling-auth.spec.ts` ✅ (4 skenario; server email tiruan di host:4599 menangkap email nyata): gateway tersimpan tanpa membocorkan kunci, uji kirim memakai header `api-key` & pengirim yang benar, galat 401 tersimpan; pengaturan trial 1–90 (browser & server);
daftar Qalling → hash OTP = SHA-256, kode salah menaikkan `attempts`, tenant trial = hari ini + trial_days, add-on `trial` tier Pro Rp149.000, tanpa invoice, anggota `owner`, menu Pro (CRM ya, Tender tidak); email ganda ditolak; masuk lewat kode (email tak dikenal tidak dikirimi apa pun); kalender/AI/Tagihan & Saldo; situs publik; pendaftaran ERP OTP + kata sandi + email selamat datang + login `/auth`.
`qalling-standalone.spec.ts` diperbarui ke perilaku New 11. Dev compose: `EMAIL_API_BASE_BREVO` + `host.docker.internal` untuk uji.

**Batas jujur:**
1. **Login Google** memakai OAuth pihak ketiga (Lovable Cloud di New 11). Tombol & alur disalin, tetapi di Old default **nonaktif** dan butuh `VITE_GOOGLE_OAUTH_URL` (endpoint OAuth milik Anda); tanpa itu klik menampilkan pesan jelas. Tidak diuji dengan Google asli.
2. **Tool MCP** sudah dipasang dan lolos tsc/lint, tetapi **belum bisa dipanggil end-to-end**: SDK `@lovable.dev/mcp-js` hanya mengautentikasi bearer OAuth (JWKS), sedangkan Old tidak mengonfigurasi issuer sehingga *semua* tool (termasuk ERP lama) menjawab "Authentication required". Itu kondisi yang sudah ada sebelum Ronde 45.
3. Pengiriman ke Brevo/Resend/SendGrid asli belum diuji (hanya server tiruan), sesuai arahan "pihak ketiga cukup salin kodenya".
4. Situs live `xperd-new.lovable.app` dicek hanya judul halaman (read-only); tampilan dibangun dari kode New 11 yang sama.

## 12. Ronde 46 — Pencocokan dengan situs live `xperd-new.lovable.app` (akun Starter nyata)

Metode (read-only): login ke live dengan akun ERP Starter, crawl halaman beranda, Billing (semua tab), Settings, Team, dan **seluruh submodul 13 modul**
(judul, tombol, kolom tabel); buat tenant Starter setara di Old (daftar → provisioning admin), lalu diff teks per halaman. Hasil awal: daftar submodul
**identik di semua modul**; beda ditemukan & ditutup:

| Beda di live | Perbaikan di Old |
|---|---|
| Beranda: checklist "Get started with XPERD One" (5 langkah, hanya owner/admin, bisa disembunyikan) | `GettingStartedChecklist.tsx` + dipasang di launcher |
| Katalog add-on: Qalling 349.000, Slipp HR 149.000, Omnix 249.000, XPro 199.000 + tagline | `026_live_catalog_parity.sql` |
| Paket: Professional 3 workspace; Business 10 workspace/50 pengguna | `026_live_catalog_parity.sql` |
| Opsi Qalling live: **WhatsApp channel 100.000, Extra user 30.000, Extra storage 5 GB 10.000** (tanpa opsi akun) — menggantikan 3 opsi contoh Ronde 44 | `026_live_catalog_parity.sql` (grants disimpulkan dari nama; maks per opsi tidak terlihat dari sisi pelanggan) |
| AR Invoices: tombol **Generate SaaS Monthly** (draf bulanan dari faktur terakhir tiap pelanggan, hanya item SaaS bulanan) | `SalesTable.tsx` |
| Quotations: edit & hapus di tahap mana pun kecuali dibatalkan, tombol **Duplicate quotation** | `SalesTable.tsx` + `deleteWorkspaceRow.forbidStatus` |
| Omnix Store Connections (kartu, tanpa ubah, butuh kunci API tervalidasi) & Transactions (tanpa pager, "New order" nonaktif tanpa toko) | `OmnixViews.tsx` |
| Settings: logo "No logo" (bukan logo default), pratinjau A4 kop tender dengan blok dekoratif + baris To/Date | `settings.tsx` |
| Backup & Restore: cadangan memuat `owner_email`, restore ditolak bila workspace/email berbeda | `maintenance.tsx` |
| Microcopy: toast/dialog Cash & Bank (koreksi/batal), "Period reopened", "No account yet." | `CashBankViews`, `AccountingViews`, `ModuleDashboard` |
| CRM: pager Leads, ukuran halaman default 25 (Broadcast/Campaigns), bar pager Templates selalu tampil | `CrmViews`, `CrmOutreach`, `CrmInsights` |

Bukti: `e2e/sales-saas-quotation.spec.ts`, `e2e/maintenance-restore-guard.spec.ts`, `e2e/omnix.spec.ts` (diperbarui), `e2e/addon-tiers.spec.ts` (opsi Extra user),
re-crawl Old vs live: sisa beda hanya data (isi top-up, tanggal, email) dan tombol "Proof" yang muncul karena live punya top-up dengan bukti.

**Belum dibandingkan / batas:** akun live adalah Starter pelanggan — halaman Super Admin live tidak bisa dicek (tak ada kredensial admin); alur tulis (buat dokumen, payroll,
dll.) tidak dicoba di live (read-only), hanya dibandingkan lewat kode New 11 pada ronde sebelumnya. Ada berkas New 11 `[.]lovable.oauth.consent.tsx` (halaman persetujuan OAuth
untuk server MCP Lovable) yang tidak diporting karena Old tidak punya server OAuth.

## 13. Ronde 47–48 — port BS New 12 (sumber: `docs/MAPPING-NEW12-VS-OLD.md`)

Dikerjakan: Qalling signup tanpa pilih paket + syarat (migrasi 028), klien/referral/laporan (029), automation kaya (komentar→DM, balas publik, follow-gate, tombol link + pelacak `/l/$ruleId`, auto-like),
Tebar hybrid, media folder, DM→Leads (030), pengaturan storage platform (031), PDF invoice, bahasa bawaan Indonesia, layout Super Admin New 12.
Spec diperbarui ke perilaku New 12: `crm-interactions`, `admin-content-site`, `qalling-auth`, `qalling-standalone` (bahasa Indonesia lewat `storageState` kosong).

Regresi penuh (dev): 74 lulus, 5 gagal → 3 diperbaiki (spec usang/rapuh, bukan bug aplikasi), 2 diblokir data dev:
- `admin-dashboard-visitors`: menu admin New 12 berlabel "Pengunjung" (spec mencari "Pengunjung Website") → spec diperbarui.
- `workspace-logo`: spec masih menguji "Default logo (Xperd One)"; sejak New 11 tampil "No logo" tanpa gambar; setelah unggah ada 2 gambar "Logo" (kartu + pratinjau kop) → spec diperbarui.
- `sales-saas-quotation`: `setMonth(-1)` pada tanggal 31 meluap ke bulan yang sama (faktur "bulan lalu" jatuh di bulan ini) → tanggal diganti tanggal 15 bulan lalu.
- `cash-bank-trx-number` & `cash-out-proof`: DB dev punya kunci periode **hard** 2026-10 (catatan "test", dibuat 2026-10-12, bukan dari spec) sehingga transaksi bertanggal hari ini ditolak. Terbukti: dengan kunci dilepas sementara kedua spec lulus (kunci dikembalikan persis). Perlu keputusan: hapus kunci dev itu.

E2E baru (semua lulus, angka dari SQL): `qalling-referral`, `qalling-clients-reports` (menemukan bug: `crm_social_comments` belum terdaftar di `data.functions.ts`),
`crm-automation-rich` (Meta Graph tiruan :4598), `crm-tebar-hybrid` (Tebar tiruan :4597), `crm-inbox-to-leads`, `crm-media-folders`, `admin-storage`, `admin-signup-terms`, `billing-invoice-pdf`.
Re-crawl live (xperd-new) vs Old: Klien, Laporan, Referral, Kalender, Media, Inbox, Komentar, Automation, Leads, Billing sama; beda hanya data.
**Belum:** tes webhook Midtrans → 500 bila perpanjangan gagal (sulit dipaksa gagal tanpa mock); crawl halaman Super Admin live (akun live bukan admin).

### Ronde 49 — kunci gateway dari aplikasi, MCP dihapus, regresi penuh

- **Regresi penuh:** 79/79 lulus (8,4 menit) setelah kunci periode dev `2026-10` ("test") dihapus.
- **Midtrans tanpa env:** migrasi `032_gateway_server_key.sql` menambah `payment_gateways.server_key`. Super Admin mengisinya di
  Admin → Payments ("Server key (rahasia)"): tulis-saja, kosong = pertahankan, tidak pernah dikembalikan ke klien
  (`adminList` memilih kolom eksplisit dan hanya mengirim `has_server_key`). Dibaca dua webhook, checkout tagihan, dan
  top-up/cek status wallet; env `server_key_secret_name` tetap jadi cadangan. **Prod: jalankan `npm run migrate` manual.**
- **Spec baru** `e2e/wallet-midtrans-webhook.spec.ts`: isi kunci lewat UI, kunci tidak muncul di respons server function,
  tanda tangan salah 401, nominal beda 400, perpanjangan gagal → 500 (saldo sudah masuk), diulang → 200 + invoice
  `renew:base:…` + saldo = top-up − harga paket, ulangan berikutnya idempoten.
- **Meta/Tebar:** sudah diatur dari aplikasi (`crm_meta_settings`, `tebar_settings`, `crm_social_tokens`); tak ada perubahan.
- **MCP dihapus** (fitur platform Lovable, butuh OAuth Lovable): `src/lib/mcp/`, route `/mcp`, `/.mcp/*`,
  `/.well-known/oauth-protected-resource`, halaman & menu "Integrasi AI", dependensi `@lovable.dev/mcp-js`. Flag fitur `mcp_api`
  pada tier Agency (data & label katalog) sengaja tidak diubah.
