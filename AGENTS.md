# Panduan untuk agen (XPERD One / Qalling)

Repo ini **mandiri** (tidak lagi tersambung ke Lovable). Rebase, amend, dan force-push boleh
di branch fitur sendiri.

## `master` = produksi
Setiap commit yang masuk ke `master` otomatis menjalankan GitHub Actions:
**Build and Push Docker Image → Deploy Docker Image (Manager) → Migrate Database (Manager)**.
Jadi:
- Jangan commit atau push langsung ke `master`, dan jangan pernah force-push `master`.
- Kerja di branch (`feat/…`, `fix/…`, `docs/…`), gabungkan lewat pull request.
- Sebelum mulai: `git fetch origin master` lalu buat branch dari `origin/master`.
- Sebelum menggabungkan: gabungkan/rebase `origin/master` terbaru ke branch, selesaikan konflik,
  lalu pastikan `npx tsc --noEmit`, `npm run lint` (berkas yang diubah) dan `npm run build` lolos.
- Fitur baru yang belum siap untuk pengguna: pasang di balik saklar yang OFF bawaan
  (contoh: `ai_studio_settings.enabled`, lihat `docs/AI-STUDIO.md`).

## Database
- MySQL. Migrasi di `db/migrations/NNN_nama.sql`, diterapkan sekali per nama berkas (`db_apply_log`),
  otomatis setelah deploy. Tulis idempoten (`CREATE TABLE IF NOT EXISTS`, `INSERT IGNORE`).
- Pakai nomor berikutnya setelah berkas terakhir di `origin/master` agar tidak bentrok.
- Saldo/kredit hanya lewat `walletPostEntryOn` (`src/lib/wallet.server.ts`) dengan kunci idempotensi;
  `wallet_ledger` tidak pernah di-UPDATE/DELETE.

## Konvensi
- TanStack Start + React; server function di `src/lib/*.functions.ts`, kode server-only di `*.server.ts`
  (impor dinamis di dalam handler).
- Teks UI dan komentar berbahasa Indonesia; dukung `id`/`en` lewat `useI18n().pick`.
- Dokumentasi operasional: `docs/OPERATIONS.md`.
