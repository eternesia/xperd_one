-- BS New 16 · Production M6–M10: perintah produksi, material (koreksi potensi), batch record (eBMR), output, jam kerja, biaya,
-- silsilah lot, pemetaan akun & outbox jurnal. Tanpa trigger/fungsi tersimpan: aturan ada di src/lib/production-orders.server.ts
-- (transaksi + SELECT … FOR UPDATE). Tabel transisi/output/jam kerja/biaya/silsilah hanya di-INSERT (koreksi = entri pembalik).
-- Tidak ada FK ke tabel tahap lain (BOM = 041/042, lot/QC = 043/044); relasi diperiksa di kode. Idempoten.

CREATE TABLE IF NOT EXISTS mfg_orders (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  order_no VARCHAR(160) NOT NULL,
  item_id CHAR(36) NOT NULL,
  bom_version_id CHAR(36) NOT NULL,
  planned_qty DECIMAL(18,4) NOT NULL,
  uom VARCHAR(100) NOT NULL,
  planned_start DATE NULL,
  planned_end DATE NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'draft',
  batch_lot_no VARCHAR(200) NULL,
  warehouse_from VARCHAR(100) NOT NULL,
  warehouse_to VARCHAR(100) NOT NULL,
  registration_id CHAR(36) NULL,
  cost_method_snapshot VARCHAR(10) NULL,
  expected_output_qty DECIMAL(18,4) NULL,
  yield_pct DECIMAL(9,4) NULL,
  notes TEXT NULL,
  released_by CHAR(36) NULL,
  released_at DATETIME(6) NULL,
  closed_at DATETIME(6) NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_orders_no (workspace_id, order_no),
  KEY idx_mfg_orders_status (workspace_id, status, created_at),
  CONSTRAINT ck_mfg_orders_qty CHECK (planned_qty > 0),
  CONSTRAINT ck_mfg_orders_status CHECK (status IN ('draft','planned','released','in_progress','qc_pending','completed','closed','cancelled')),
  CONSTRAINT ck_mfg_orders_dates CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start),
  CONSTRAINT fk_mfg_orders_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_mfg_orders_item FOREIGN KEY (item_id) REFERENCES md_items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_order_transitions (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  from_status VARCHAR(12) NOT NULL,
  to_status VARCHAR(12) NOT NULL,
  reason VARCHAR(2000) NOT NULL,
  idempotency_key CHAR(36) NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_otr_key (workspace_id, idempotency_key),
  KEY idx_mfg_otr_order (workspace_id, order_id),
  CONSTRAINT fk_mfg_otr_order FOREIGN KEY (order_id) REFERENCES mfg_orders (id),
  CONSTRAINT fk_mfg_otr_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_order_materials (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  bom_line_id CHAR(36) NULL,
  item_id CHAR(36) NOT NULL,
  line_type VARCHAR(12) NOT NULL,
  uom VARCHAR(100) NOT NULL,
  sequence INT NOT NULL,
  planned_qty DECIMAL(18,4) NOT NULL,
  corrected_qty DECIMAL(18,4) NOT NULL,
  issued_qty DECIMAL(18,4) NOT NULL DEFAULT 0,
  lot_id CHAR(36) NULL,
  potency_used_pct DECIMAL(9,6) NULL,
  potency_compensate TINYINT(1) NOT NULL DEFAULT 0,
  is_balancing TINYINT(1) NOT NULL DEFAULT 0,
  override_reason VARCHAR(2000) NULL,
  override_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_mfg_om_order (workspace_id, order_id, sequence),
  KEY idx_mfg_om_lot (workspace_id, lot_id),
  CONSTRAINT ck_mfg_om_qty CHECK (planned_qty >= 0 AND corrected_qty >= 0),
  CONSTRAINT fk_mfg_om_order FOREIGN KEY (order_id) REFERENCES mfg_orders (id),
  CONSTRAINT fk_mfg_om_item FOREIGN KEY (item_id) REFERENCES md_items (id),
  CONSTRAINT fk_mfg_om_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_batch_steps (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  sequence INT NOT NULL,
  instruction VARCHAR(2000) NOT NULL,
  measure_label VARCHAR(120) NULL,
  measure_unit VARCHAR(40) NULL,
  min_value DECIMAL(18,6) NULL,
  max_value DECIMAL(18,6) NULL,
  value DECIMAL(18,6) NULL,
  within_limits TINYINT(1) NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'pending',
  performed_by CHAR(36) NULL,
  performed_at DATETIME(6) NULL,
  verified_by CHAR(36) NULL,
  verified_at DATETIME(6) NULL,
  signature_id CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_bs_seq (workspace_id, order_id, sequence),
  CONSTRAINT ck_mfg_bs_status CHECK (status IN ('pending','done','verified')),
  CONSTRAINT ck_mfg_bs_verifier CHECK (verified_by IS NULL OR performed_by IS NULL OR verified_by <> performed_by),
  CONSTRAINT fk_mfg_bs_order FOREIGN KEY (order_id) REFERENCES mfg_orders (id),
  CONSTRAINT fk_mfg_bs_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_order_outputs (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  output_type VARCHAR(12) NOT NULL,
  item_id CHAR(36) NOT NULL,
  lot_id CHAR(36) NULL,
  qty DECIMAL(18,4) NOT NULL,
  uom VARCHAR(100) NOT NULL,
  movement_id CHAR(36) NULL,
  idempotency_key CHAR(36) NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_oo_key (workspace_id, idempotency_key),
  KEY idx_mfg_oo_order (workspace_id, order_id),
  CONSTRAINT ck_mfg_oo CHECK (qty > 0 AND output_type IN ('finished','co_product','by_product','scrap','rework')),
  CONSTRAINT fk_mfg_oo_order FOREIGN KEY (order_id) REFERENCES mfg_orders (id),
  CONSTRAINT fk_mfg_oo_item FOREIGN KEY (item_id) REFERENCES md_items (id),
  CONSTRAINT fk_mfg_oo_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_lot_genealogy (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  parent_lot_id CHAR(36) NOT NULL,
  child_lot_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  qty DECIMAL(18,4) NOT NULL,
  uom VARCHAR(100) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_lg (workspace_id, parent_lot_id, child_lot_id, order_id),
  KEY idx_mfg_lg_child (workspace_id, child_lot_id),
  CONSTRAINT fk_mfg_lg_order FOREIGN KEY (order_id) REFERENCES mfg_orders (id),
  CONSTRAINT fk_mfg_lg_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_order_labor (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  work_center_id CHAR(36) NOT NULL,
  hours DECIMAL(10,2) NOT NULL,
  labor_rate DECIMAL(18,2) NOT NULL,
  overhead_rate DECIMAL(18,2) NOT NULL,
  note TEXT NULL,
  idempotency_key CHAR(36) NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_ol_key (workspace_id, idempotency_key),
  KEY idx_mfg_ol_order (workspace_id, order_id),
  CONSTRAINT ck_mfg_ol CHECK (hours > 0 AND hours <= 1000),
  CONSTRAINT fk_mfg_ol_order FOREIGN KEY (order_id) REFERENCES mfg_orders (id),
  CONSTRAINT fk_mfg_ol_wc FOREIGN KEY (work_center_id) REFERENCES mfg_work_centers (id),
  CONSTRAINT fk_mfg_ol_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_order_costs (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  material_cost BIGINT NOT NULL,
  labor_cost BIGINT NOT NULL,
  overhead_cost BIGINT NOT NULL,
  total_cost BIGINT NOT NULL,
  output_qty DECIMAL(18,4) NOT NULL,
  unit_cost BIGINT NOT NULL,
  std_material_cost BIGINT NOT NULL,
  std_conversion_cost BIGINT NOT NULL,
  std_total_cost BIGINT NOT NULL,
  variance BIGINT NOT NULL,
  co_product_allocation JSON NOT NULL,
  computed_by CHAR(36) NULL,
  computed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_oc_order (workspace_id, order_id),
  CONSTRAINT fk_mfg_oc_order FOREIGN KEY (order_id) REFERENCES mfg_orders (id),
  CONSTRAINT fk_mfg_oc_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_account_mappings (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  mapping_key VARCHAR(30) NOT NULL,
  account_code VARCHAR(100) NOT NULL,
  updated_by CHAR(36) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_am (workspace_id, mapping_key),
  CONSTRAINT ck_mfg_am_key CHECK (mapping_key IN ('rm_inventory','wip_material','wip_conversion','fg_inventory','labor_applied','overhead_applied','production_variance','scrap_loss')),
  CONSTRAINT fk_mfg_am_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_journal_events (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  event_code VARCHAR(20) NOT NULL,
  amount BIGINT NOT NULL,
  status VARCHAR(16) NOT NULL,
  entry_id CHAR(36) NULL,
  reverses_event_id CHAR(36) NULL,
  message VARCHAR(1000) NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_je (workspace_id, order_id, event_code),
  CONSTRAINT ck_mfg_je_status CHECK (status IN ('posted','blocked_period','blocked_mapping','skipped_zero','reversed')),
  CONSTRAINT fk_mfg_je_order FOREIGN KEY (order_id) REFERENCES mfg_orders (id),
  CONSTRAINT fk_mfg_je_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hubungan baris penjualan ke lot Production (guard "lot belum dirilis" diterapkan di kode: assertLotSellable).
SET @has_col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sls_document_lines' AND COLUMN_NAME = 'mfg_lot_id');
SET @ddl = IF(@has_col = 0, 'ALTER TABLE sls_document_lines ADD COLUMN mfg_lot_id CHAR(36) NULL, ADD KEY idx_sls_lines_mfg_lot (workspace_id, mfg_lot_id)', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
