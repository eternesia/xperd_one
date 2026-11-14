# XPERD — Instalasi mandiri (self-hosted)

Paket ini memasang XPERD di server milik klien. Aplikasinya sama persis dengan XPERD pusat (image Docker
yang sama), tetapi berjalan dalam **mode instalasi mandiri**:

- Modul yang aktif mengikuti **lisensi** dari Super Admin pusat. Paket standar: Pembelian, Persediaan,
  Produksi, Penjualan, Akuntansi (termasuk Kas & Bank) dan Laporan. Data Induk selalu aktif.
- Server klien melapor ke pusat tiap 5 menit, satu arah keluar (HTTPS). Laporan berisi versi, CPU, RAM,
  disk, status database, jumlah pengguna dan status cadangan. **Tidak ada data transaksi yang dikirim.**
- Lisensi ditandatangani pusat (Ed25519) dan disimpan di server klien. Kalau internet putus sementara,
  aplikasi tetap jalan sampai tanggal berakhir lisensi ditambah masa tenggang.
- Pendaftaran umum, tagihan Qalling dan halaman pemasaran dimatikan. Akun pengguna dibuat oleh admin
  perusahaan, dan jumlahnya dibatasi lisensi.
- Tidak ada Super Admin di server klien. Akun platform bawaan dinonaktifkan otomatis oleh job `db`,
  dan semua pengaturan platform hanya bisa diubah dari pusat.

## Kebutuhan server

| | Minimum | Disarankan |
|---|---|---|
| CPU / RAM | 2 vCPU / 4 GB | 4 vCPU / 8 GB |
| Disk | 40 GB SSD | 100 GB SSD |
| OS | Ubuntu 22.04/24.04 LTS (atau Linux lain dengan Docker) | |
| Jaringan | Subdomain (mis. `erp.klien.co.id`) mengarah ke IP server, port 80/443 terbuka, akses keluar HTTPS ke `xperd.id` dan `ghcr.io` | |

Perangkat lunak: Docker Engine 24+ dengan plugin `docker compose`, plus nginx atau Caddy untuk HTTPS.

## 1. Di pusat (tim XPERD)

1. Buka **Super Admin → Instalasi klien → Tambah instalasi**. Isi nama, domain, modul, batas pengguna dan
   tanggal berakhir lisensi.
2. Salin blok `.env` yang muncul. **Token hanya tampil sekali.** Kalau hilang, tekan **Token baru**; token
   lama langsung tidak berlaku.
3. Kalau image privat, beri klien token GitHub baca (`read:packages`) untuk `ghcr.io`.

## 2. Di server klien

```bash
# salin folder deploy/self-hosted ke server, mis. /opt/xperd
cd /opt/xperd
cp .env.example .env
nano .env        # tempel baris dari pusat + isi APP_PUBLIC_URL
sudo ./install.sh
```

`install.sh` akan:

1. mengisi rahasia acak (JWT, kunci vault, kata sandi MySQL, kode penyiapan);
2. mengunduh image;
3. menjalankan MySQL 8.4 LTS;
4. menerapkan skema dan data katalog;
5. menyalakan aplikasi di `127.0.0.1:3000`.

## 3. HTTPS (nginx)

```nginx
server {
  server_name erp.klien.co.id;
  client_max_body_size 50m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
  }
}
```

Lalu pasang sertifikat: `sudo certbot --nginx -d erp.klien.co.id`.

Kalau memakai Caddy, cukup satu baris: `erp.klien.co.id { reverse_proxy 127.0.0.1:3000 }`.

## 4. Penyiapan pertama

1. Buka `https://erp.klien.co.id/setup`.
2. Masukkan kode penyiapan, yaitu `XPERD_SETUP_CODE` di `.env`; `install.sh` juga menampilkannya.
3. Isi nama perusahaan dan akun admin pertama.
4. Masuk lewat `/auth`. Pengguna lain ditambahkan dari menu **Tim**.

Halaman `/setup` tertutup otomatis setelah perusahaan pertama dibuat.

Setelah ±5 menit, status server ini tampil **Online** di Super Admin pusat.

## Pembaruan

```bash
cd /opt/xperd
./update.sh                 # versi terbaru
./update.sh sha-1a2b3c4     # kunci ke versi tertentu (lihat kolom versi di Super Admin pusat)
```

`update.sh` membuat cadangan database ke `backups/` terlebih dahulu (10 cadangan terakhir disimpan),
lalu menarik image, menerapkan migrasi dan menyalakan ulang aplikasi.

## Cadangan

- **Otomatis:** cadangan aplikasi bisa diaktifkan dari menu sistem, dan statusnya ikut dilaporkan ke pusat.
  Pusat memberi peringatan bila cadangan gagal atau sudah lebih dari 2 hari.
- **Manual:**
  ```bash
  set -a; . ./.env; set +a
  docker compose exec -T mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction "$MYSQL_DATABASE"' | gzip > cadangan.sql.gz
  ```
- Salin cadangan ke lokasi lain (NAS atau cloud milik klien). Simpan juga `.env`, karena tanpa
  `VAULT_ENCRYPTION_KEY` data rahasia yang terenkripsi tidak bisa dibuka.

## Status lisensi

| Status | Arti |
|---|---|
| Berlaku | Normal. |
| Segera berakhir | Kurang dari 14 hari. Muncul pita peringatan kuning di aplikasi. |
| Masa tenggang | Lisensi sudah lewat, tapi semua masih bisa dipakai selama masa tenggang. |
| Berakhir | Data tetap aman, tetapi modul terkunci sampai lisensi diperpanjang di pusat. |

Perpanjangan cukup dilakukan dengan mengubah tanggal di Super Admin pusat. Server klien menerimanya pada
laporan berikutnya (≤5 menit).

## Pemecahan masalah

- **Status "Tidak melapor" di pusat.** Cek akses keluar: `docker compose exec web node -e "fetch(process.env.XPERD_CONTROL_URL).then(r=>console.log(r.status))"`.
  Lihat juga log: `docker compose logs --tail 100 web`.
- **"Lisensi tidak valid".** `XPERD_LICENSE_PUBLIC_KEY` atau `XPERD_INSTANCE_TOKEN` salah salin. Salin ulang
  dari pusat (Token baru), lalu jalankan `docker compose up -d web`.
- **Ganti versi MySQL.** Jangan. Paket ini dikunci ke MySQL 8.4 LTS, versi yang diuji bersama aplikasinya.
