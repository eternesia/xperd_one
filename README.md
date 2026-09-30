# Xperd One — Old Production (TanStack Start + MySQL)

Aplikasi ERP/CRM Xperd One: TanStack Start + React 19 + TypeScript + Tailwind +
shadcn/ui, data di **MySQL** (bukan Supabase). Autentikasi memakai cookie httpOnly
berisi JWT (`xperd_token`), semua akses DB lewat server function.

## Mulai cepat (dev)

```bash
cp .env.example .env                       # isi APP_JWT_SECRET (+ MYSQL_* bila perlu)
docker compose up -d --wait mysql          # MySQL 8.4 di port 3307
npm i
npm run db:setup                           # migrate + seed (idempoten)
npm run dev                                # aplikasi
npm run test:e2e                           # Playwright (perlu app di :3999)
```

## Dokumen penting

| Dokumen | Isi |
|---|---|
| `OPERATIONS.md` | Referensi variabel `.env`, perintah harian, deploy produksi, cron, cadangan |
| `META-SETUP.md` | Langkah mengaktifkan integrasi Meta (Facebook Page & Instagram) |
| `PARITY-BS-NEW3-VS-OLD.md` | Checklist + riwayat porting dari Business Suite New 3 (per ronde) |
| `INTEROP-BOILERPLATE.md` | Pola endpoint publik/hook untuk integrasi eksternal |
| `SLIPP-HR-PORTING.md` | Catatan porting modul HR (Slipp HR) |

## Aturan pengembangan singkat

- Tabel/kolom baru untuk lapisan data generik **wajib** didaftarkan di
  `WORKSPACE_TABLES` + `COLS` (`src/lib/data.functions.ts`) atau `PCOLS`
  (`src/lib/platform.functions.ts`) — tanpa itu nilainya dibuang senyap.
- Logika uang/status memakai transaksi MySQL di lapisan aplikasi
  (`transaction()` + `SELECT … FOR UPDATE`); proyek ini **tidak memakai trigger
  atau fungsi database**.
- Tanggal selalu lewat `sqlDateTime()` (`src/lib/datetime.ts`).

---

# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
