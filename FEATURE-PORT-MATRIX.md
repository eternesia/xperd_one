# XPERD One — Business Suite Feature Inventory & Port/Flow Matrix

> Target: **Xperd One Old Production** (MySQL monolith, TanStack Start)
> Sumber fitur: **Xperd One Business Suite** (Lovable terbaru, Supabase monolith)
> Tanggal audit: 2026-09-08 · Branch: `port/bs-features`
> Verifikasi: `tsc --noEmit` 0 error · `npm run build` OK · stack dev hidup di `http://127.0.0.1:3999`

## Status legend
| Status | Arti |
|---|---|
| 🟢 **Sama / sudah ada** | Flow ada di Old (kedua repo berbagi kode UI monolith; Old sudah MySQL) |
| 🔵 **Di-port (sesi ini)** | Fitur terbaru BS → Old (2026-09-08) |
| 🟣 **Old = superset** | Old punya lebih (tidak ada di BS module) |
| ⚪ **N/A (infra)** | File Supabase/Lovable-glue, bukan flow produk |

---

## 1. Modul & submodul aplikasi
Struktur modul **identik** BS vs Old (cek otomatis `modules.ts`); satu-satunya beda: CRM (Old = superset).

| Modul | Submodul | Old | Flow (alur) |
|---|---|---|---|
| **Master Data** | Items, Categories, Units of Measure, Customers, Suppliers, Warehouses, Tax Rates, Chart of Accounts (8) | 🟢 | CRUD master (table generik workspace) — live |
| **Procurement** | Purchase Requests, Purchase Orders, Goods Receipts, AP Invoices, Payments, Purchase Returns (6) | 🟢 | Alur dokumen PR→PO→GR→AP; doc detail + print/PDF |
| **Inventory** | Stock Overview, Stock In, Stock Out, Transfers, Stock Opname, Valuation (6) | 🟢 | Mutasi stok + costing (AVERAGE/FIFO) |
| **Sales & POS** | Quotations, Sales Orders, Delivery Orders, Shipping Scan, AR Invoices, Receipts, Point of Sale, Sales Returns (8) | 🟢 | Alur QUO→SO→DO→AR→Receipt; POS; scan pengiriman |
| **Cash & Bank** | Accounts, Cash In, Cash Out, Fund Transfers, Reconciliation (5) | 🟢 | Transaksi kas/bank + rekonsiliasi → jurnal |
| **Accounting** | Opening Balance, Journal Entries, GL, Trial Balance, Balance Sheet, P&L, Cash Flow, Equity, Period Closing (9) | 🟢 | Jurnal otomatis dokumen; laporan keuangan |
| **Fixed Assets** | Asset Register, Depreciation, Disposal (3) | 🟢 | Penyusutan bulanan + disposal |
| **Tax** | Input VAT, Output VAT, Withholding Tax, e-Faktur & e-Bupot (4) | 🟢 | Catatan PPN/PPh + ekspor e-faktur CSV |
| **Manufacturing** | BOM, Work Orders, Production Costing (3) | 🟢 disabled | Belum aktif (sama BS: modul fase lanjut) |
| **Reporting** | Executive, Sales, Purchasing, Inventory, Financial Reports, Data Exports (6) | 🟢 | Dasbor + analitik + ekspor |
| **CRM (Qalling)** | BS: Leads, Pipeline, Contacts, Follow Ups, Broadcast, WhatsApp Gateway, Social Campaigns (7) | 🟣 Old **10**: BS-7 + **Dashboard, Sales Targets, Message Templates** | 🔵 di-port sesi ini; gating add-on `qalling` |
| **HR & Payroll** | Employees, Attendance, Payroll (3) | 🟢 disabled | Belum aktif (sama BS) |

*Catatan alur:* submodul → view nyata (tabel/lines/doc) di Old; yang belum ada entity backend render "Being prepared" (sama perilaku BS).

## 2. Admin / platform (app-admin)
| Area | BS | Old | Status |
|---|---|---|---|
| Tenancy (tenant, status, subscription) | ✅ | ✅ | 🟢 |
| Registrations (provision tenant) | ✅ | ✅ | 🟢 |
| Invoices / Payments (Midtrans webhook) | ✅ | ✅ | 🟢 |
| Packages | ✅ | ✅ | 🟢 |
| Announcements / Site content | ✅ | ✅ | 🟢 |
| Support Tickets | ✅ | ✅ | 🟢 |
| **Users** (list, create, superadmin toggle, workspace access, reset PW) | ✅ | ✅ | 🔵 di-port (`admin-users.functions` + `/app-admin/users`) |
| **Add-on Modules** (katalog + assign per tenant) | ✅ | ✅ | 🔵 di-port (`003_addons`, `/app-admin/addons`) |

## 3. Add-ons & gating modul
| Item | BS | Old | Status |
|---|---|---|---|
| Tabel `addons` / `tenant_addons` | ✅ (Supabase) | ✅ `003_addons.sql` | 🔵 |
| Katalog add-on `qalling` | ✅ | ✅ seed di `004` | 🔵 |
| Hook `hasAddon`/`useTenantAddons` | ✅ | ✅ `lib/addons.ts` | 🔵 |
| Gating modul (lock saat add-on tak aktif) | ✅ | ✅ launcher + module shell | 🔵 |
| CRM → add-on `qalling` | ✅ | ✅ | 🔵 (tenant demo sudah di-assign) |

## 4. Dokumen: print & branding
| Item | BS | Old | Status |
|---|---|---|---|
| `doc-print.ts` template classic/modern/minimal | ✅ | ✅ `html2canvas@1.4.1` + `jspdf` (`lib/doc-print.ts`) | 🔵 fix: html2pdf.js melempar `oklch` (Tailwind v4) → render langsung di iframe via html2canvas+jsPDF |
| Halaman detail dokumen (Print/PDF via template) | ✅ | ✅ route `$docId` | 🔵 |
| Kolom `workspaces.doc_template/bank_info/doc_footer_note` | ✅ | ✅ `004` | 🔵 |
| Settings → Document branding (template, info bank, footer, alamat/NPWP) | ✅ | ✅ | 🔵 |
| `doc-pdf.ts` (legacy jspdf) | — | ada (tidak dipakai lagi) | ⚪ |

## 5. Marketing site (`_site`)
Identik BS vs Old — 11 halaman: Home, Products(+detail), Solutions, Industries, Technology, Pricing, About, Resources, Contact, Register. Status 🟢 (konten sama; register = alur pembuatan akun/registrasi).

## 6. Utilitas workspace
Team, Settings, Billing & Package, Backup & Restore (maintenance) — ada di keduanya 🟢.
- **Settings** sekarang = profil + alamat/NPWP + **Document branding** (🔵).
- **Billing**: paket, invoice tenant, upgrade request + seksi **Add-on modules** (daftar katalog add-on aktif/tidak + harga, paritas BS) (🟢 MySQL platform fns).
- **Team**: undang anggota + role (owner/admin/staff/viewer) (🟢).

## 6b. Topbar & navigasi (paritas UI)
- **Topbar homepage** (`components/site/SiteHeader.tsx`): kini **0 diff** vs BS — CTA disamakan jadi **Contact Sales** (outline) + **Sign In / Sign Up Online** (gold → `/auth`); tombol "Sign In" terpisah & "Sign Up Online" terpisah dihapus (desktop maupun menu mobile). `_site.tsx`, `_site/index.tsx`, `LanguageSwitcher.tsx` juga 0 diff.
- **Logo site** (`components/site/Logo.tsx`): memakai brand wordmark (`xperd.png` = byte identik dengan `xperd-logo.png` BS, asset `0d9cd24d…`, 337 615 B); varian light (`xperd-logo-light.png`) tidak tersedia lokal → dipakai filter CSS (`invert brightness-200`), ukuran mengikuti BS (`h-11` saat onDark / `h-9`).
- **App topbar** (`components/app/AppTopbar.tsx`): struktur identik BS (beda hanya 3 baris data-layer: `supabase.auth.signOut()` → `logoutAppUser()+emitAuthChange()`). ⚠️ Beda logo: BS memakai **app logo** (`xperd-one-app-logo.png`, asset `b2601f6f…`, 242 823 B) sedangkan Old memakai **brand wordmark** (asset `0d9cd24d…`). Catatan: dua file aset di Old **tertukar namanya** vs BS (`src/assets/xperd.png` = brand wordmark; `src/assets/xperd-logo.png` = app logo).
- **Admin nav/topbar** (`routes/app-admin.tsx`): Old dulu tidak punya menu **Users** & **Add-on Modules** (halaman ada tapi tak bisa diakses dari UI) → 🔵 ditambahkan (sidebar NavItem + link header mobile), mengikuti BS.
- **`styles.css`**: aturan dark-mode BS `.dark .text-navy:not([class*="dark:text-"]){color:var(--foreground)}` → 🔵 di-port (kini `styles.css` 0 diff vs BS).

## 6c. Registrasi & paket tenant (2026-09-21)
- **`/auth`**: disamakan dengan BS — **Tabs** "Sign in" | "Register online"; tab register berisi penjelasan + tombol **Start online registration** (→ `/register`) dan **contact sales** (→ `/contact`). Beda dari BS hanya data-layer (`emitAuthChange()` alih-alih `supabase.auth.signInWithPassword`). Sebelumnya Old memakai satu form dengan toggle & `registerAppUser` langsung (tidak sesuai referensi Lovable).
- **`/register`**: sudah sama dengan BS (form pendaftaran online: paket, siklus billing, data perusahaan) — beda hanya data-layer (`getPublicSignupPackages`/`submitRegistration` MySQL vs Supabase). Alur: `/auth` → tab Register online → `/register` → tersimpan di tabel `registrations` (`pending`) → tampil di **/app-admin/registrations**.
- **Kolom Package di `/app-admin/tenancy`**: BUG — server fn mengembalikan `package_name` (flat) sementara UI membaca `t.packages?.name` (bentuk join Supabase) → kolom selalu “—”. Fix: server fn sekarang mengembalikan objek `packages: { name }` sehingga UI (identik BS) bekerja.

## 6d. Settings workspace (2026-09-23)
Disamakan dengan BS (`app/w/$workspaceId.settings.tsx` — kini beda hanya di data-layer save: `updateWorkspaceSettings` MySQL vs `supabase.from("workspaces").update`):
- **Field tambahan**: `phone` (Telepon) & `email` + label `NPWP / Tax ID` (sebelumnya `tax`/“NPWP” saja). Kolom DB baru: migration **`006_workspace_contact.sql`** (`workspaces.phone`, `workspaces.email` TEXT — paritas `public.workspaces` BS), didaftarkan di `PCOLS.workspaces`, SELECT `app-shell.functions.ts`, dan interface `Workspace`/`ShellWorkspace`.
- **Kartu “Document & invoice template”** (kartu terpisah, menggantikan dropdown “Branding dokumen”): 3 **kartu preview live** (iframe `srcDoc` dari `buildDocHtml` template classic/modern/minimal, ring emas saat dipilih) + judul/hint; deskripsi “Applied to print and PDF download for Quotation, SO, DO, PO, GR, AP and AR.”
- Tombol **Save changes** kini di atas blok alamat (urutan sama BS); bank info jadi “Bank details”, footer note jadi input (bukan textarea) — persis BS.
- E2E `settings.spec.ts` diperbarui: pilih kartu “Modern Accent” (bukan lagi `#docTemplateSelect`), assert tersimpan + assert **isi iframe preview benar-benar ter-render** (`INV/2026/0001`).




## 7. AI / MCP / Asisten
Ada di kedua repo (`assistant`, `ai-gateway.server`, MCP tools). UI serupa; backend data layer beda (Old = MySQL tool, BS = Supabase tool). Status 🟢 (UI) — tool MySQL sudah menjadi bagian Old.

## 8. Infra BS saja (tidak di-port — bukan flow produk)
`integrations/supabase/*`, `lib/mcp/supabase.ts`, `[.]lovable.oauth.consent.tsx` → ⚪ N/A (Old memakai auth JWT cookie + MySQL, bukan Supabase).

---

## Ringkasan perbandingan alur
- **Semua modul/submodul inti**: struktur 100% sama; flow diimplementasikan di Old (MySQL) sejak sebelum sesi ini — UI kedua repo satu sumber.
- **Fitur terbaru BS yang hilang di Old** (CRM views/broadcast, Admin Users, Add-ons+gating, Doc Print v2+branding, CRM insights) → **sudah di-port** sesi ini & terverifikasi tsc/build + route 200.
- **Satu-satunya beda struktural yang disengaja**: CRM Old punya 3 submodul ekstra (Dashboard, Sales Targets, Message Templates) yang di BS ada file `CrmInsights` tapi tidak di-wire ke module.
- **Terverifikasi e2e (Playwright, 9 spec)**: login → launcher/module shell → CRM (lead, dashboard/targets/templates) → settings (template Modern) → admin (users, add-ons) → billing (Add-on modules: Qalling Active) → **Download PDF** (`E2E-SO-0001.pdf`, valid `%PDF-`). Belum dites: klik penuh print-to-printer & broadcast WA ke gateway asli. Siap dites di `http://127.0.0.1:3999/auth` → `dnicorp.id@gmail.com` / `@DNIIPO2032`.

## Env runtime (untuk tes)
- App: http://127.0.0.1:3999 · Login: `/auth`
- DB: `mysql://xperd:xperd@127.0.0.1:3307/xperd` (container `xperd-mysql-dev`)
- Web: container `xperd-web-dev` (vite dev)
- Stop: `cd "Xperd One Old Production " && docker compose down`
