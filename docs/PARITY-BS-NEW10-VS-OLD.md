# Parity BS **New 10** vs Old Production

Dokumen ini memetakan perubahan **`Xperd One Business Suite New 10`** (rilis
terbaru, 2026-10-12) terhadap **New 8** dan terhadap fitur yang sudah ada di
`Xperd One Old Production`. Ringkasan Ronde 1–30 ada di
[`PARITY-BS-NEW3-VS-OLD.md`](PARITY-BS-NEW3-VS-OLD.md).

## 1. Ringkasan: New 10 vs New 8 (sangat sedikit)

Perbandingan `src/`, `drizzle/migrations/`, `package.json`:

| Perubahan | Berkas | Sifat |
|---|---|---|
| **XPro fase 2 — detail proyek** | `drizzle/migrations/0022_xpro_project_detail.sql` *(baru)*, `src/components/app/XproDetail.tsx` *(baru, 482 baris)*, `src/components/app/XproViews.tsx` (+69 baris) | fitur baru, uang **belum** menyentuh jurnal |
| **Perbaikan penomoran transaksi kas/bank** | `src/lib/cashbank.ts`, `src/components/app/CashBankViews.tsx` | **bug fix** (nomor bisa bentrok) |
| `integrations/supabase/types.ts` | generated | tidak relevan untuk Old |
| `@lovable.dev/vite-tanstack-config` 2.25.2 → 2.25.3 | `package.json` | khusus Lovable |

Tidak ada perubahan pada `modules.ts`, `lib/journal.ts`, master data, maupun
modul lain. Roadmap New 10 menyisakan **satu** item belum selesai:

> `[ ] XPro: posting biaya proyek ke jurnal akuntansi.` — **belum ada di New 10**.

## 2. Mapping ke Old Production

### 2.1. Penomoran transaksi kas/bank — ✅ **sudah diporting (Ronde 30)**

New 8 (dan Old) menghitung nomor dari **jumlah baris**:

```ts
seq = count(cb_transactions where trx_type = type)   // cara lama
trx_no = nextTrxNumber(prefix, seq + 1)
```

Dua cacat: (a) jurnal koreksi/storno memakai `trx_type` yang sama sehingga ikut
terhitung, (b) **menghapus** satu baris membuat nomor berikutnya dipakai ulang →
bentrok dengan nomor yang masih ada (dan `trx_no` juga kunci idempotensi
`recordSettlementCashTransaction`).

New 10 menggantinya dengan `peekNextTrxNumber()`: ambil **nomor tertinggi** pada
bulan berjalan (`trx_no LIKE 'CI/202610/%'`) lalu +1.

**Di Old:** diporting apa adanya (data lewat server fn `listWorkspaceRows`, bukan
Supabase). Verifikasi: `e2e/cash-bank-trx-number.spec.ts` — buat 3 transaksi kas
masuk, hapus yang tengah, buat 1 lagi → nomor baru `CI/202610/0004`
(tertinggi + 1) dan tidak ada nomor ganda.

### 2.2. XPro fase 2 (detail proyek) — ❌ **belum ada di Old** (modul XPro belum ada sama sekali)

Modul `xpro` adalah **add-on** (`addon: "xpro"`, harga katalog Rp 750.000/bulan)
dengan 4 submodule: `projects`, `milestones`, `budget`, `billing`. Di Old modul
ini belum pernah diporting — fase 1 (`0021_xpro_projects_phase1.sql`) pun belum,
jadi fase 2 New 10 harus masuk bersama fase 1.

**Skema yang dibutuhkan (gabungan 0021 + 0022):**

| Tabel | Isi |
|---|---|
| `prj_projects` | proyek & kontrak (kode, nama, klien, nilai kontrak, tanggal, status, PIC) |
| `prj_milestones` | tahapan + bobot progres (%) |
| `prj_budget_lines` | RAB per kategori |
| `prj_billings` | tagihan termin/BAST + `ar_document_id`, `ar_doc_number`, `progress_report_id` |
| `prj_members` | tim proyek (nama, role, **email** — dipakai mencocokkan tugas milik user login) |
| `prj_tasks` | tugas (milestone, assignee, tanggal, `progress_pct`, status) |
| `prj_expenses` | realisasi biaya/material (tanggal, kategori, vendor, nilai) |
| `prj_documents` | berkas proyek (path, ukuran, mime) |
| `prj_progress_reports` | laporan progres (periode, %, pekerjaan, kendala, rencana, foto) — syarat BAST |

**Adaptasi yang diperlukan untuk Old (bukan salin-tempel):**

| Kebutuhan New 10 | Padanan di Old |
|---|---|
| Query Supabase langsung (`useRows`/`useSave`/`useRemove`) | tabel wajib didaftarkan di **`WORKSPACE_TABLES` + `COLS`** (`src/lib/data.functions.ts`) supaya bisa dibaca/disimpan lewat `listWorkspaceRows`/`saveWorkspaceRow` |
| Unggah berkas ke bucket `xpro-files` + signed URL | jalur berkas Old: `src/lib/files.functions.ts` + `files.server.ts` + rute `/api/workspace-files` (volume `storage/`), sama seperti Pustaka Dokumen CRM |
| Gating add-on (`addon: "xpro"`) | `modules.ts` sudah punya pola `addon:` (`qalling`, `omnix`, `slipp_hr`) + katalog tabel `addons` → perlu baris katalog `xpro` (Rp 750.000/bulan, `module_id = 'xpro'`) dan seed add-on tenant untuk dev/demo |
| RLS workspace-member/writer | Old tidak memakai RLS: penjagaan lewat `requireAppAuth` + `isWorkspaceMember`/`canWriteWorkspace` di server fn (otomatis bila lewat `data.functions.ts`) |
| Trigger `updated_at` | kolom `updated_at … ON UPDATE CURRENT_TIMESTAMP(6)` di DDL MySQL (bukan trigger) |
| Dashboard tugas: staff hanya melihat tugasnya (cocok `prj_members.email` ↔ email login) | `useApp().workspaceRole` + email tersedia di Old; aturan visibilitas yang sama bisa dipakai apa adanya |
| Cetak/PDF & Gantt (dari `XproDetail.tsx`) | Old sudah punya `report-export` (Excel/PDF) & komponen cetak — pola sama seperti modul lain |

**Perlu keputusan pemilik produk (menyentuh uang):**

1. **`prj_billings` → AR Invoice.** Di New 10, tombol “issue” hanya **menyisipkan
   baris `sls_documents` (ar_invoice)** lalu menyimpan `ar_document_id`; **jurnalnya
   tidak dibuat** dari jalur itu. Di Old, AR Invoice normal selalu memposting
   jurnal (`postArInvoiceJournal`) — jadi kalau disalin apa adanya, akan muncul
   faktur piutang **tanpa jurnal** (buku besar tidak sinkron).
   - Opsi A *(disarankan)*: pakai jalur AR Invoice Old (posting jurnal) sehingga
     GL & subledger konsisten.
   - Opsi B: samakan persis dengan New 10 (tanpa jurnal) — tidak disarankan.
2. **Posting biaya proyek ke jurnal** (`prj_expenses`) — belum ada di New 10;
   kalau Old mau melakukannya lebih dulu, ini fitur baru (bukan parity) dan perlu
   akun beban per kategori.
3. **Status “Soon” vs aktif**: apakah XPro langsung diaktifkan (add-on aktif untuk
   tenant demo) atau ditampilkan sebagai add-on yang bisa dibeli.

**Perkiraan pekerjaan** (mengikuti pola ronde sebelumnya): migrasi MySQL 8 tabel +
katalog add-on; whitelist data layer; `XproViews`/`XproDetail` (≈1.100 baris UI)
diporting dengan penyesuaian berkas & gating; e2e (proyek → milestone → tugas →
biaya → laporan progres → BAST → tagihan termin → AR invoice); dokumentasi.

## 3. Status akhir setelah Ronde 30

| Item New 10 | Status di Old |
|---|---|
| Penomoran kas/bank dari nomor tertinggi | ✅ **diporting & diuji** |
| XPro fase 1 + fase 2 | ❌ belum ada (modul + add-on belum pernah diporting) |
| Posting biaya proyek ke jurnal | ➖ belum ada di New 10 sendiri (di luar parity) |
| `@lovable.dev/vite-tanstack-config` 2.25.3 | ⏭️ tidak relevan (khusus Lovable) |
| `integrations/supabase/types.ts` | ⏭️ generated, tidak relevan |

Sisa selisih lain terhadap New 8 yang **bukan** bagian New 10 dan masih terbuka:
**audit trail** (`0020_audit_trail.sql` + `AuditTrailView.tsx`) dan tab
**Workspace Access** (`AccessMatrixPanel.tsx`) — keduanya non-uang.

## 4. Verifikasi Ronde 30

- `npx tsc --noEmit` → 0 error; `npm run build` → sukses.
- `e2e/cash-bank-trx-number.spec.ts` → lulus: nomor tidak dipakai ulang setelah
  baris dihapus, tidak ada nomor ganda, fixture uji dibersihkan lagi.
