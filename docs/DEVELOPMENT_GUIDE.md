# DEVELOPMENT GUIDE — Xperd One (Old Production)

Konteks produk ada di [`PRD.md`](PRD.md). Perintah harian & env ada di
[`OPERATIONS.md`](OPERATIONS.md).

## 1. Prinsip utama

> **Perilaku proyek ini HARUS sama dengan versi Lovable di
> https://xperd-one.lovable.app.**

Versi Lovable adalah **sumber kebenaran** untuk UI, alur, label, validasi,
urutan langkah, dan hasil perhitungan. Repo ini hanya mengganti *mesin di
bawahnya* (Supabase → MySQL). Kalau ragu bagaimana sesuatu seharusnya bekerja:

1. Buka `xperd-one.lovable.app` dan coba alurnya.
2. Baca kode ekspor Lovable terbaru (folder `Xperd One Business Suite*`).
3. Samakan. Jangan "memperbaiki" atau mendesain ulang.

Beda yang **diizinkan** hanya yang dipaksa oleh data-layer:

| Lovable | Repo ini |
|---|---|
| `supabase.from(t).select/insert/update` | server fn: `listWorkspaceRows`, `saveWorkspaceRow`, `upsertWorkspaceRows`, dll. |
| `supabase.auth.*` | `logoutAppUser()`, `emitAuthChange()`, `useSession` (JWT cookie) |
| `supabase.rpc(...)` / trigger / RLS | fungsi di lapisan aplikasi + transaksi MySQL + cek role |
| Supabase Storage | `files.server.ts` / `STORAGE_DIR` |
| Bentuk hasil join Supabase (`t.packages?.name`) | server fn mengembalikan objek yang bentuknya sama |

Selain itu **diff terhadap Lovable harus nol**. File UI yang identik harus
tetap byte-identik bila memungkinkan, agar ekspor berikutnya mudah di-diff.

## 2. Alur porting ekspor Lovable baru

1. Taruh ekspor di folder sejajar (mis. `Xperd One Business Suite New 9`).
2. Diff terhadap repo ini (`diff -rq`, lalu per file). Abaikan infra
   (`integrations/supabase/*`, `lib/mcp/supabase.ts`, `.lovable`, `supabase/`).
3. Catat temuan di dokumen paritas baru atau ronde baru di
   [`PARITY-BS-NEW3-VS-OLD.md`](PARITY-BS-NEW3-VS-OLD.md): item, file, status.
4. Port per item. UI disalin apa adanya; hanya data-layer yang ditulis ulang.
5. Bila ekspor membawa tabel/kolom baru → buat migration MySQL (lihat §4).
6. Jalankan verifikasi (§7), perbarui dokumen paritas, baru commit.
7. Bila Lovable dan kebutuhan produksi bertentangan (mis. perubahan jurnal),
   **jangan putuskan sendiri**: minta keputusan pemilik produk dan catat
   (contoh: keputusan GR/IR 2050 mengikuti New 3).

Jangan menulis ulang riwayat git yang sudah di-push (lihat `AGENTS.md`).

## 3. Arsitektur singkat

```
src/routes/        TanStack Router (file-based): _site, app/w.$workspaceId.*, app-admin, qalling, api/public
src/components/    app/ (modul), site/, ui/ (shadcn)
src/lib/*.ts       logika domain (journal, inventory, sales, procurement, cashbank, hr, tax, ...)
src/lib/*.functions.ts   server function (createServerFn) — satu-satunya pintu ke DB
src/lib/*.server.ts      kode server-only (auth JWT, files, meta, whatsapp, interop)
src/integrations/mysql/  pool + helper transaction()
db/migrations, db/seeds  SQL idempoten (dicatat di db_apply_log)
e2e/                     Playwright
```

Definisi modul/submodul: `src/lib/modules.ts`. Gating add-on: `src/lib/addons.ts`.

## 4. Aturan data

- **Tabel/kolom baru** untuk lapisan generik wajib didaftarkan di
  `WORKSPACE_TABLES` + `COLS` (`data.functions.ts`) atau `PCOLS`
  (`platform.functions.ts`). Tanpa itu nilainya **dibuang senyap**.
- **Tidak ada trigger / stored function / procedure.** Logika uang & status
  di aplikasi: `transaction()` + `SELECT … FOR UPDATE`.
- **Migration**: file baru bernomor berikutnya di `db/migrations`, idempoten
  (`IF NOT EXISTS`, `ON DUPLICATE KEY UPDATE`), tanpa `DROP/TRUNCATE/DELETE FROM`.
  Jangan mengubah migration yang sudah dipakai; buat yang baru.
- **Seed**: urutan nama file penting; seed yang butuh katalog dinamai setelahnya.
- **Tanggal** selalu lewat `sqlDateTime()` (`src/lib/datetime.ts`).
- **Jurnal**: otomatis dalam transaksi yang sama dengan dokumennya; koreksi =
  storno (balik jurnal lama + posting baru), bukan hapus.
- **Hak akses**: setiap server fn yang menulis harus memeriksa role workspace.
- **Rahasia** tidak boleh di `VITE_*` atau kode klien.

## 5. Gaya kode

- TypeScript ketat, Prettier + ESLint repo (`npm run lint`, `npm run format`).
- Ikuti komentar/penamaan di sekitar; teks UI dwibahasa lewat pola `en` / `id_`
  yang sudah ada, jangan hardcode satu bahasa.
- Komponen UI memakai shadcn di `src/components/ui`; jangan menambah library
  UI baru tanpa alasan kuat.
- Jangan menambahkan fitur, opsi, atau "perbaikan" yang tidak ada di Lovable.

## 6. Lingkungan lokal

```bash
cp .env.example .env
docker compose up -d --wait mysql
npm i
npm run db:setup
npm run dev          # atau jalankan di :3999 untuk e2e
```

## 7. Definisi selesai (checklist sebelum commit)

- [ ] Perilaku dicocokkan dengan `xperd-one.lovable.app` / kode ekspor Lovable.
- [ ] `npx tsc --noEmit` → 0 error.
- [ ] `npm run build` sukses.
- [ ] `npm run migrate` pada DB kosong **dan** DB yang sudah terisi sukses.
- [ ] `npm run test:e2e` hijau; spec baru ditambahkan untuk alur yang berubah.
- [ ] Angka keuangan diuji manual (jurnal seimbang, saldo akun perantara benar).
- [ ] Dokumen paritas / `FEATURE-PORT-MATRIX.md` diperbarui.
- [ ] Pesan commit mengikuti pola `feat|fix|docs|test(scope): ...`.

## 8. Larangan

- Mengimpor `@supabase/*` baru ke kode aplikasi (dependency lama hanya sisa
  dari ekspor; jangan dipakai untuk data).
- Menjalankan `db:wipe` / `db:reset` di luar DB lokal.
- Menaruh kredensial (password dev, token, secret) di dokumen atau kode.
- Mengubah jurnal/perhitungan uang tanpa persetujuan pemilik produk.
