# Boilerplate Integrasi Pihak Ketiga (OPSIONAL)

> **Status: opsional, bukan fitur wajib.** Tidak ada bagian di sini yang perlu
> diaktifkan agar aplikasi berjalan normal. Selama env flag belum diisi, kedua
> endpoint mengembalikan **404** dan tidak melakukan apa pun.
>
> Sumber: two item terakhir dari daftar parity BS New —
> **#21 Public web-to-lead API** dan **#22 WhatsApp reminder + cron** —
> keduanya di New bergantung pada layanan di luar aplikasi, jadi di Old
> disiapkan sebagai kerangka + catatan, bukan implementasi penuh.

## 1. Ringkasan isi

| Berkas | Peran |
|---|---|
| `src/lib/interop.server.ts` | Flag + verifikasi API key + rate limit + handler `Request → Response` untuk kedua endpoint |
| `src/lib/whatsapp.server.ts` | Adapter pengirim WhatsApp (no-op bila belum dikonfigurasi) |
| `src/lib/reminders.server.ts` | Pemilih dokumen jatuh tempo / follow-up CRM yang telat + pengiriman pengingat |
| `src/server.ts` | Menambatkan `/api/public/leads` dan `/api/cron/reminders` (2 baris, sebelum SSR) |
| `e2e/interop-disabled.spec.ts` | Menjamin default aman: kedua endpoint 404 saat fitur nonaktif |

Tidak ada paket npm baru, tabel baru, atau migrasi baru. Semuanya *read-only*
kecuali endpoint lead (yang memang menulis satu baris `crm_leads`).

## 2. #21 — Public web-to-lead API

**Endpoint:** `POST /api/public/leads`
**Header:** `x-api-key: <apiKey>`
**Body JSON:**

```json
{
  "name": "Budi Santoso",
  "email": "budi@example.com",
  "phone": "08123456789",
  "company_name": "PT Contoh",
  "source": "Landing Page",
  "notes": "Minta demo hari Jumat",
  "estimated_value": 25000000
}
```

`name` wajib, dan salah satu dari `email`/`phone` wajib. Balasan: `201 { ok, id, code }`,
`400` payload tidak valid, `401` key salah/kosong, `404` fitur nonaktif, `405` method salah,
`429` melebihi rate limit (30 permintaan/menit per workspace).

### Mengaktifkan

```bash
PUBLIC_LEAD_API_ENABLED=true
PUBLIC_LEAD_API_KEYS=<workspaceId>:<apiKey>,<workspaceIdLain>:<apiKeyLain>
```

Contoh pakai:

```bash
curl -X POST https://<host>/api/public/leads \
  -H "content-type: application/json" \
  -H "x-api-key: rahasia-panjang" \
  -d '{"name":"Budi","email":"budi@example.com","source":"Landing Page"}'
```

### Catatan & TODO (pilih sesuai kebutuhan)

- Token disimpan di env (`PUBLIC_LEAD_API_KEYS`), **bukan** di database. Bila
  ingin kelola key lewat UI, tambahkan tabel `public_api_keys` (butuh migration)
  lalu ganti `resolveApiKey()` agar membaca dari sana.
- Rate limit masih **in-memory per-proses**. Untuk beberapa instance, pindahkan
  ke Redis atau rate limiter reverse proxy.
- Penomoran lead memakai `WEB-<base36 waktu>`. Bila ingin seragam dengan CRM
  (`LD/…`), sesuaikan bagian `// TODO(opsional)` di `interop.server.ts`.
- Belum ada verifikasi anti-spam (captcha/honeypot) — tambahkan bila endpoint
  dibuka ke internet publik.
- Pertimbangkan `OPTIONS`/CORS bila form web berada di domain berbeda.

## 3. #22 — Pengingat WhatsApp + cron

**Endpoint pemicu:** `POST /api/cron/reminders` dengan header `x-cron-secret: <CRON_SECRET>`
(GET juga diterima supaya bisa dipakai uptime pinger). Balasan `200 { ok, arInvoices, crmFollowUps, sent, skipped, failures }`.

### Mengaktifkan

```bash
CRON_API_ENABLED=true
CRON_SECRET=<secret-panjang-acak>

# Adapter WhatsApp (opsional; bila kosong pengiriman hanya di-log)
WA_ENABLED=true
WA_API_URL=https://api.provider-anda.example/send
WA_API_TOKEN=<token>
WA_SENDER=6281xxxxxxx
WA_REMINDER_TO=628123456789,628987654321   # penerima pengingat
```

### Memicu dari cron eksternal

Old **tidak** memasang scheduler in-process supaya tidak ada proses background
wajib. Panggil dari luar, misalnya crontab harian pukul 08:00:

```cron
0 8 * * * curl -fsS -X POST https://<host>/api/cron/reminders \
  -H "x-cron-secret: $CRON_SECRET" >/dev/null
```

Alternatif: systemd timer, GitHub Actions terjadwal, atau uptime pinger.

### Catatan & TODO

- **Dedupe belum ada**: belum ada kolom `last_reminded_at`, jadi pemanggilan
  berulang akan mengirim ulang. Tambahkan kolom via migration baru lalu isi di
  `runDueReminders()` bila pengingat ingin sekali saja.
- Bentuk body HTTP ke provider berbeda-beda; sesuaikan `buildRequestBody()` di
  `whatsapp.server.ts` dengan dokumentasi provider (Meta Cloud API, Fonnte,
  Qontak, dsb).
- Tidak ada retry/queue; kegagalan hanya dicatat di `failures`.
- Penerima masih dari env `WA_REMINDER_TO`. Idealnya dari pemilik/penagih per
  workspace (`profiles.phone` atau kolom konfigurasi workspace).
- Normalisasi nomor: `0812…` → `62812…` (lihat `normalizePhone()`).

## 4. Keamanan

- Jangan pernah commit `PUBLIC_LEAD_API_KEYS`, `CRON_SECRET`, atau `WA_API_TOKEN`.
  Simpan sebagai secret server.
- Endpoint cron tidak boleh dibuka tanpa `CRON_SECRET`: tanpanya handler hanya
  membalas `404` (fitur nonaktif) atau `401`.
- Perbandingan rahasia memakai *constant-time compare* untuk mengurangi risiko
  timing attack.

## 5. Verifikasi

- `e2e/interop-disabled.spec.ts` mengecek bahwa tanpa konfigurasi:
  - `POST /api/public/leads` → **404** (bukan 500, bukan bocor data),
  - `GET /api/cron/reminders` → **404**.
- Setelah mengaktifkan flag di lingkungan Anda, uji manual dengan `curl` seperti
  contoh di atas.
