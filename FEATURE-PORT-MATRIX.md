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
| `doc-print.ts` template classic/modern/minimal (html2pdf) | ✅ | ✅ `html2pdf.js@0.14` + `lib/doc-print.ts` | 🔵 |
| Halaman detail dokumen (Print/PDF via template) | ✅ | ✅ route `$docId` | 🔵 |
| Kolom `workspaces.doc_template/bank_info/doc_footer_note` | ✅ | ✅ `004` | 🔵 |
| Settings → Document branding (template, info bank, footer, alamat/NPWP) | ✅ | ✅ | 🔵 |
| `doc-pdf.ts` (legacy jspdf) | — | ada (tidak dipakai lagi) | ⚪ |

## 5. Marketing site (`_site`)
Identik BS vs Old — 11 halaman: Home, Products(+detail), Solutions, Industries, Technology, Pricing, About, Resources, Contact, Register. Status 🟢 (konten sama; register = alur pembuatan akun/registrasi).

## 6. Utilitas workspace
Team, Settings, Billing & Package, Backup & Restore (maintenance) — ada di keduanya 🟢.
- **Settings** sekarang = profil + alamat/NPWP + **Document branding** (🔵).
- **Billing**: paket, invoice tenant, upgrade request (🟢 MySQL platform fns).
- **Team**: undang anggota + role (owner/admin/staff/viewer) (🟢).

## 7. AI / MCP / Asisten
Ada di kedua repo (`assistant`, `ai-gateway.server`, MCP tools). UI serupa; backend data layer beda (Old = MySQL tool, BS = Supabase tool). Status 🟢 (UI) — tool MySQL sudah menjadi bagian Old.

## 8. Infra BS saja (tidak di-port — bukan flow produk)
`integrations/supabase/*`, `lib/mcp/supabase.ts`, `[.]lovable.oauth.consent.tsx` → ⚪ N/A (Old memakai auth JWT cookie + MySQL, bukan Supabase).

---

## Ringkasan perbandingan alur
- **Semua modul/submodul inti**: struktur 100% sama; flow diimplementasikan di Old (MySQL) sejak sebelum sesi ini — UI kedua repo satu sumber.
- **Fitur terbaru BS yang hilang di Old** (CRM views/broadcast, Admin Users, Add-ons+gating, Doc Print v2+branding, CRM insights) → **sudah di-port** sesi ini & terverifikasi tsc/build + route 200.
- **Satu-satunya beda struktural yang disengaja**: CRM Old punya 3 submodul ekstra (Dashboard, Sales Targets, Message Templates) yang di BS ada file `CrmInsights` tapi tidak di-wire ke module.
- **Belum diverifikasi browser**: klik penuh (login → buka modul → simpan dokumen → print html2pdf → broadcast WA). Siap dites di `http://127.0.0.1:3999/auth` → `dnicorp.id@gmail.com` / `@DNIIPO2032`.

## Env runtime (untuk tes)
- App: http://127.0.0.1:3999 · Login: `/auth`
- DB: `mysql://xperd:xperd@127.0.0.1:3307/xperd` (container `xperd-mysql-dev`)
- Web: container `xperd-web-dev` (vite dev)
- Stop: `cd "Xperd One Old Production " && docker compose down`
