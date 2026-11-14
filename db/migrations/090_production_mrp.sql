-- Production · MRP (fitur add-on `mfg_mrp`): perencanaan kebutuhan bahan dari perintah produksi vs stok lot, PO/PR terbuka,
-- dan order produksi terbuka. Kebutuhan: Sales Order terbuka + perintah produksi. Perhitungan dilakukan langsung di server (src/lib/production-mrp.server.ts), tidak disimpan.
-- Saklar `mfg_mrp_settings.enabled` OFF bawaan per workspace. Tanpa trigger.

CREATE TABLE IF NOT EXISTS mfg_mrp_settings (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  horizon_days INT NOT NULL DEFAULT 30,
  include_draft TINYINT(1) NOT NULL DEFAULT 1,
  include_open_pr TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_mrp_settings_ws (workspace_id),
  CONSTRAINT ck_mfg_mrp_settings_horizon CHECK (horizon_days BETWEEN 1 AND 365),
  CONSTRAINT fk_mfg_mrp_settings_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Parameter perencanaan per item: lead time, stok pengaman (menimpa md_items.min_stock bila diisi), MOQ, kelipatan pesan.
CREATE TABLE IF NOT EXISTS mfg_mrp_item_params (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  lead_time_days INT NOT NULL DEFAULT 0,
  safety_stock DECIMAL(18,4) NULL,
  min_order_qty DECIMAL(18,4) NOT NULL DEFAULT 0,
  order_multiple DECIMAL(18,4) NOT NULL DEFAULT 0,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_mrp_item (workspace_id, item_id),
  CONSTRAINT ck_mfg_mrp_item CHECK (lead_time_days BETWEEN 0 AND 730 AND (safety_stock IS NULL OR safety_stock >= 0)
    AND min_order_qty >= 0 AND order_multiple >= 0),
  CONSTRAINT fk_mfg_mrp_item_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_mfg_mrp_item_item FOREIGN KEY (item_id) REFERENCES md_items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Jejak dokumen yang dibuat dari MRP (PR draf / order produksi draf). `run_key` + jenis + item unik = klik ganda tidak
-- membuat dokumen dobel. Untuk PR, item_id = '' (satu PR berisi banyak baris).
CREATE TABLE IF NOT EXISTS mfg_mrp_links (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  run_key CHAR(36) NOT NULL,
  kind VARCHAR(4) NOT NULL,
  item_id VARCHAR(36) NOT NULL DEFAULT '',
  target_id CHAR(36) NOT NULL,
  doc_number VARCHAR(160) NOT NULL,
  line_count INT NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_mrp_link (workspace_id, run_key, kind, item_id),
  KEY idx_mfg_mrp_link_ws (workspace_id, created_at),
  CONSTRAINT ck_mfg_mrp_link_kind CHECK (kind IN ('pr','mo')),
  CONSTRAINT fk_mfg_mrp_link_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
