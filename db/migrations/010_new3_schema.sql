-- ===========================================================================
-- 010_new3_schema.sql
--  * Batch 3 — skema dari ekspor `Xperd One Business Suite New 3`
--    (sumber Postgres: `drizzle/migrations/0004..0015`).
--  * Isi: 17 tabel baru + kolom baru pada 8 tabel lama, untuk
--      - CRM: Tender Checklist, Pustaka Dokumen, akun sosial & penjadwal post,
--        integrasi Meta App;
--      - Akuntansi: kunci periode (acc_period_locks);
--      - Omnix: koneksi toko, order marketplace, wallet & saldo;
--      - Workspace: kop surat tender (letterhead_config);
--      - Platform: tag produk tenant/invoice (xperd | qalling);
--      - Master & dokumen: item non-persediaan, pajak per baris (withholding PPh),
--        uang muka penjualan/pembelian.
--  * Yang TIDAK dibawa dari New 3: RLS policy, GRANT, trigger `updated_at`
--    (MySQL sudah `ON UPDATE CURRENT_TIMESTAMP(6)`) dan seluruh fungsi plpgsql
--    (top-up/bundle/charge Omnix) — logikanya pindah ke server fn MySQL
--    transaksional, sesuai keputusan #11 (tanpa trigger DB).
--  * Konvensi mengikuti 001_schema.sql: CHAR(36) + UUID(), DECIMAL(18,4),
--    DATETIME(6), TINYINT(1) untuk boolean, JSON untuk kolom majemuk.
--    CHECK constraint ala Postgres diganti komentar nilai yang sah (kebiasaan Old).
--  * Backward compatible: semua kolom baru punya default yang membuat data lama
--    berperilaku sama seperti sebelumnya — withholding_amount 0, advance_kind
--    NULL, tax_code NULL (jatuh kembali ke perhitungan berbasis tarif),
--    product 'xperd', is_stocked 1 (semua item lama tetap dihitung sebagai stok).
--  * Katalog add-on `omnix` SENGAJA belum di-seed: harga langganan Omnix belum
--    diputuskan (yang sudah pasti hanya fee per transaksi Rp25 dan paket
--    Rp350.000 / 20.000 transaksi, ada di kode). Blok INSERT-nya disediakan
--    (dikomentari) di bagian akhir file.
--  * CREATE TABLE memakai IF NOT EXISTS, tetapi blok ALTER tidak: menjalankan
--    file ini dua kali manual akan gagal "Duplicate column name" — sama seperti
--    006/007. Runner hanya menerapkan tiap file sekali (`db_apply_log`).
-- Runs once via the migrate runner (001..00N in order).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Kolom baru pada tabel yang sudah ada
-- ---------------------------------------------------------------------------

ALTER TABLE workspaces
  ADD COLUMN letterhead_config JSON NULL AFTER logo_url;

ALTER TABLE tenants
  ADD COLUMN product VARCHAR(20) NOT NULL DEFAULT 'xperd' AFTER status;

ALTER TABLE invoices
  ADD COLUMN product VARCHAR(20) NOT NULL DEFAULT 'xperd' AFTER status;

ALTER TABLE md_items
  ADD COLUMN is_stocked TINYINT(1) NOT NULL DEFAULT 1 AFTER item_type,
  ADD COLUMN billing_cycle VARCHAR(20) NULL AFTER is_stocked,
  ADD COLUMN expense_account_code VARCHAR(100) NULL AFTER billing_cycle;

-- Pajak: PPN dan potongan PPh (withholding) dicatat terpisah. Sebelum ini
-- keduanya bercampur di `tax_amount`, sehingga total AR/AP salah saat ada PPh.
ALTER TABLE sls_documents
  ADD COLUMN withholding_amount DECIMAL(18,4) NOT NULL DEFAULT 0 AFTER tax_amount,
  ADD COLUMN advance_kind VARCHAR(20) NULL AFTER source_doc_number;

ALTER TABLE prc_documents
  ADD COLUMN withholding_amount DECIMAL(18,4) NOT NULL DEFAULT 0 AFTER tax_amount,
  ADD COLUMN advance_kind VARCHAR(20) NULL AFTER source_doc_number;

-- `tax_code` menyimpan kode master `md_taxes` supaya posting tahu jenis pajak
-- baris itu (PPN vs PPh) tanpa menebak dari tarif.
ALTER TABLE sls_document_lines
  ADD COLUMN tax_code VARCHAR(100) NULL AFTER tax_rate;

ALTER TABLE prc_document_lines
  ADD COLUMN tax_code VARCHAR(100) NULL AFTER tax_rate;

-- ---------------------------------------------------------------------------
-- 2. CRM — Pustaka Dokumen (item #51) & Tender Checklist (item #50, #52)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_doc_library (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'administrative',
  name VARCHAR(255) NOT NULL,
  doc_number VARCHAR(100),
  issued_date DATE,
  expiry_date DATE,
  file_path VARCHAR(500),
  file_name VARCHAR(255),
  mime VARCHAR(150),
  size BIGINT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  notes TEXT,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_crm_doc_library_ws_expiry (workspace_id, expiry_date),
  CONSTRAINT fk_crm_doc_library_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_doc_library_versions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  library_doc_id CHAR(36) NOT NULL,
  version INT NOT NULL,
  file_path VARCHAR(500),
  file_name VARCHAR(255),
  expiry_date DATE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_crm_doc_lib_ver_doc (library_doc_id),
  CONSTRAINT fk_crm_doc_lib_ver_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_doc_lib_ver_doc FOREIGN KEY (library_doc_id) REFERENCES crm_doc_library(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_tenders (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL DEFAULT '',
  title VARCHAR(255) NOT NULL,
  agency VARCHAR(255),
  lead_id CHAR(36),
  hps_value DECIMAL(18,4) NOT NULL DEFAULT 0,
  deadline_at DATETIME(6),
  status VARCHAR(20) NOT NULL DEFAULT 'preparing',   -- preparing | submitted | won | lost | cancelled
  pic_name VARCHAR(255),
  notes TEXT,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_crm_tenders_ws_deadline (workspace_id, deadline_at),
  CONSTRAINT fk_crm_tenders_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_tenders_lead FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_tender_docs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  tender_id CHAR(36) NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'administrative',  -- administrative | technical | commercial
  name VARCHAR(255) NOT NULL,
  is_mandatory TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'missing',           -- missing | prepared | submitted | approved | expired
  pic_name VARCHAR(255),
  expiry_date DATE,
  file_ref VARCHAR(500),
  library_doc_id CHAR(36),
  file_path VARCHAR(500),
  file_name VARCHAR(255),
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_crm_tender_docs_tender (tender_id),
  CONSTRAINT fk_crm_tender_docs_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_tender_docs_tender FOREIGN KEY (tender_id) REFERENCES crm_tenders(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_tender_docs_lib FOREIGN KEY (library_doc_id) REFERENCES crm_doc_library(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_tender_templates (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  tender_id CHAR(36) NOT NULL,
  tender_doc_id CHAR(36),
  category VARCHAR(20) NOT NULL DEFAULT 'administrative',
  name VARCHAR(255) NOT NULL,
  source_pdf_path VARCHAR(500),
  source_pdf_name VARCHAR(255),
  source_pages VARCHAR(50),
  template_path VARCHAR(500) NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  mime VARCHAR(150) NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size BIGINT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  notes TEXT,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_crm_tender_templates_tender (tender_id),
  CONSTRAINT fk_crm_tender_tpl_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_tender_tpl_tender FOREIGN KEY (tender_id) REFERENCES crm_tenders(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_tender_tpl_doc FOREIGN KEY (tender_doc_id) REFERENCES crm_tender_docs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_tender_template_versions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  template_id CHAR(36) NOT NULL,
  version INT NOT NULL,
  template_path VARCHAR(500) NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_crm_tender_tpl_ver_tpl (template_id),
  CONSTRAINT fk_crm_tender_tpl_ver_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_tender_tpl_ver_tpl FOREIGN KEY (template_id) REFERENCES crm_tender_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. CRM — akun sosial, penjadwal post, dan integrasi Meta (item #54–56)
--    Catatan: `crm_social_tokens` menyimpan access token; hanya boleh dibaca
--    server fn (padanan service_role di Supabase), tidak lewat client.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_social_accounts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  platform VARCHAR(30) NOT NULL,                     -- facebook | instagram | tiktok | ...
  account_name VARCHAR(255) NOT NULL,
  handle VARCHAR(100),
  profile_url VARCHAR(500),
  webhook_url VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'connected',
  external_id VARCHAR(150),                          -- id akun dari penyedia (Page/IG)
  source VARCHAR(20) NOT NULL DEFAULT 'manual',      -- manual | meta
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_crm_social_accounts_ext (workspace_id, platform, external_id),
  CONSTRAINT fk_crm_social_accounts_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_social_tokens (
  account_id CHAR(36) PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  access_token VARCHAR(500) NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_crm_social_tokens_acc FOREIGN KEY (account_id) REFERENCES crm_social_accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_social_tokens_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_scheduled_posts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  caption TEXT,
  media_url VARCHAR(500),
  account_ids JSON,                                  -- array id akun (di Postgres: uuid[])
  scheduled_at DATETIME(6) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',   -- scheduled | publishing | published | failed
  last_error TEXT,
  published_at DATETIME(6),
  results JSON,                                      -- [{ account_id, ok, error }]
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_crm_scheduled_posts_ws_time (workspace_id, scheduled_at),
  CONSTRAINT fk_crm_scheduled_posts_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_meta_settings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  app_id VARCHAR(64) NOT NULL,
  app_secret VARCHAR(255) NOT NULL,                  -- server-only, jangan pernah dikirim ke browser
  app_name VARCHAR(150),
  status VARCHAR(20) NOT NULL DEFAULT 'unverified',  -- unverified | verified | connected
  last_error TEXT,
  verified_at DATETIME(6),
  connected_at DATETIME(6),
  oauth_state VARCHAR(100),
  redirect_uri VARCHAR(500),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_crm_meta_settings_ws (workspace_id),
  CONSTRAINT fk_crm_meta_settings_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. Akuntansi — kunci periode (item #46)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS acc_period_locks (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  period CHAR(7) NOT NULL,                           -- YYYY-MM
  lock_type VARCHAR(10) NOT NULL DEFAULT 'hard',     -- soft | hard
  note VARCHAR(255),
  locked_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_acc_period_locks (workspace_id, period),
  CONSTRAINT fk_acc_period_locks_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5. Omnix (item #63) — modul opsional, baru dipakai setelah add-on aktif
--    Saldo & charging di New 3 memakai trigger + fungsi plpgsql; di sini hanya
--    tabelnya (kolom yang sama supaya porting server fn tidak perlu ubah skema).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS omnix_stores (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  channel VARCHAR(30) NOT NULL,                      -- shopee | tiktok | tokopedia | lazada | gofood | grabfood | shopeefood
  store_name VARCHAR(255) NOT NULL,
  shop_ref VARCHAR(150),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',     -- pending | active | error | disconnected
  last_sync_at DATETIME(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_omnix_stores_ws (workspace_id, channel),
  CONSTRAINT fk_omnix_stores_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS omnix_orders (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  store_id CHAR(36),
  channel VARCHAR(30) NOT NULL,
  order_no VARCHAR(100) NOT NULL,
  buyer_name VARCHAR(255),
  order_date DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',     -- pending | processing | completed | cancelled
  items JSON,
  gross_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  marketplace_fee DECIMAL(18,4) NOT NULL DEFAULT 0,
  net_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  omnix_fee DECIMAL(18,4) NOT NULL DEFAULT 0,
  fee_charged TINYINT(1) NOT NULL DEFAULT 0,
  courier VARCHAR(100),
  tracking_no VARCHAR(100),
  packing_status VARCHAR(20) NOT NULL DEFAULT 'unpacked',  -- unpacked | packed | picked_up
  packed_at DATETIME(6),
  picked_up_at DATETIME(6),
  completed_at DATETIME(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_omnix_orders (workspace_id, channel, order_no),
  KEY idx_omnix_orders_tracking (workspace_id, tracking_no),
  CONSTRAINT fk_omnix_orders_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_omnix_orders_store FOREIGN KEY (store_id) REFERENCES omnix_stores(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS omnix_wallets (
  tenant_id CHAR(36) PRIMARY KEY,
  balance DECIMAL(18,4) NOT NULL DEFAULT 0,
  bundle_quota INT NOT NULL DEFAULT 0,
  bundle_used INT NOT NULL DEFAULT 0,
  bundle_ends_at DATETIME(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_omnix_wallets_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS omnix_wallet_ledger (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  kind VARCHAR(20) NOT NULL,                         -- topup | bundle | charge | refund
  status VARCHAR(20) NOT NULL DEFAULT 'posted',      -- pending | posted | rejected
  amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  balance_after DECIMAL(18,4),
  order_id CHAR(36),
  note VARCHAR(255),
  created_by CHAR(36),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_omnix_ledger_tenant (tenant_id, created_at),
  CONSTRAINT fk_omnix_ledger_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_omnix_ledger_order FOREIGN KEY (order_id) REFERENCES omnix_orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS omnix_channel_settings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  channel VARCHAR(30) NOT NULL,
  partner_id VARCHAR(150),
  public_key VARCHAR(255),
  secret_hint VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'not_set',     -- not_set | validated
  validated_at DATETIME(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_omnix_channel_settings (workspace_id, channel),
  CONSTRAINT fk_omnix_channel_settings_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS omnix_channel_secrets (
  setting_id CHAR(36) PRIMARY KEY,
  secret_key VARCHAR(255) NOT NULL,                  -- server-only
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_omnix_channel_secrets_setting FOREIGN KEY (setting_id) REFERENCES omnix_channel_settings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6. Backfill COA untuk workspace yang sudah ada
--    Jurnal AR Invoice memakai akun 1450 PPh Dibayar Dimuka saat ada potongan
--    PPh (#36). Workspace yang dibuat sebelum migration ini belum punya akun
--    tersebut (workspace baru mendapatkannya dari provisioning), jadi akunnya
--    ditambahkan di sini. Idempotent lewat NOT EXISTS.
-- ---------------------------------------------------------------------------

INSERT INTO md_accounts (id, workspace_id, code, name, account_type, is_active)
SELECT UUID(), w.id, '1450', 'PPh Dibayar Dimuka', 'asset', 1
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM md_accounts a WHERE a.workspace_id = w.id AND a.code = '1450'
);

-- ---------------------------------------------------------------------------
-- 7. Katalog add-on
--    `omnix` belum di-seed: harga langganannya belum diputuskan. Buka komentar
--    blok di bawah (dan set pricing_unit bila nanti dihargai per transaksi)
--    setelah harga disetujui.
-- ---------------------------------------------------------------------------

-- INSERT INTO addons (id, code, name, tagline, description, monthly_price, pricing_unit, module_id, sort_order)
-- VALUES (UUID(), 'omnix', 'Omnix', 'Marketplace & food delivery omni-channel',
--         'Omnix add-on: koneksi toko marketplace, order, pengiriman, laporan, dan saldo transaksi.',
--         0, NULL, 'omnix', 30)
-- ON DUPLICATE KEY UPDATE
--   name = VALUES(name),
--   tagline = VALUES(tagline),
--   description = VALUES(description),
--   monthly_price = VALUES(monthly_price),
--   pricing_unit = VALUES(pricing_unit),
--   module_id = VALUES(module_id),
--   sort_order = VALUES(sort_order);
