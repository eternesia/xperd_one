-- BS New 16 · Production M4 (lot & stok): lot (status QC), profil gudang, pemilihan lot FEFO teraudit, kolom lot pada inv_movements.
-- Tanpa trigger: guard (karantina awal, immutabilitas lot bergerak, tiket pemilihan FEFO untuk pengeluaran, GRN→lot) ada di
-- src/lib/production-lots.server.ts. mfg_lot_selections hanya di-INSERT. Idempoten.

CREATE TABLE IF NOT EXISTS mfg_lots (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  lot_no VARCHAR(120) NOT NULL,
  supplier_lot_no VARCHAR(255) NULL,
  partner_id CHAR(36) NULL,
  mfg_date DATE NULL,
  expiry_date DATE NULL,
  retest_date DATE NULL,
  qc_status VARCHAR(12) NOT NULL DEFAULT 'quarantine',
  assay_pct DECIMAL(9,6) NULL,
  lod_pct DECIMAL(9,6) NULL,
  density_g_ml DECIMAL(18,4) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_lots_no (workspace_id, item_id, lot_no),
  KEY idx_mfg_lots_expiry (workspace_id, item_id, expiry_date, id),
  KEY idx_mfg_lots_status (workspace_id, qc_status),
  CONSTRAINT ck_mfg_lots_status CHECK (qc_status IN ('quarantine','hold','released','rejected','expired')),
  CONSTRAINT ck_mfg_lots_no CHECK (CHAR_LENGTH(TRIM(lot_no)) BETWEEN 1 AND 120),
  CONSTRAINT ck_mfg_lots_assay CHECK (assay_pct IS NULL OR (assay_pct > 0 AND assay_pct <= 100)),
  CONSTRAINT ck_mfg_lots_lod CHECK (lod_pct IS NULL OR (lod_pct >= 0 AND lod_pct < 100)),
  CONSTRAINT ck_mfg_lots_density CHECK (density_g_ml IS NULL OR density_g_ml > 0),
  CONSTRAINT ck_mfg_lots_dates CHECK (expiry_date IS NULL OR mfg_date IS NULL OR expiry_date >= mfg_date),
  CONSTRAINT fk_mfg_lots_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_mfg_lots_item FOREIGN KEY (item_id) REFERENCES md_items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_warehouse_profiles (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  warehouse_id CHAR(36) NOT NULL,
  warehouse_status VARCHAR(12) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_wh_profiles (workspace_id, warehouse_id),
  CONSTRAINT ck_mfg_wh_status CHECK (warehouse_status IN ('rm','wip','fg','quarantine','reject')),
  CONSTRAINT fk_mfg_wh_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_mfg_wh_wh FOREIGN KEY (warehouse_id) REFERENCES md_warehouses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_lot_selections (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  lot_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  warehouse_code VARCHAR(100) NOT NULL,
  qty DECIMAL(18,4) NOT NULL,
  idempotency_key CHAR(36) NOT NULL,
  reason VARCHAR(2000) NOT NULL,
  non_fefo TINYINT(1) NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_selections_key (workspace_id, idempotency_key),
  KEY idx_mfg_selections_lot (workspace_id, lot_id),
  CONSTRAINT ck_mfg_selections_qty CHECK (qty > 0),
  CONSTRAINT fk_mfg_selections_lot FOREIGN KEY (lot_id) REFERENCES mfg_lots (id),
  CONSTRAINT fk_mfg_selections_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kolom lot pada buku stok (idempoten lewat information_schema).
SET @c1 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movements' AND COLUMN_NAME = 'mfg_lot_id');
SET @ddl := IF(@c1 = 0, 'ALTER TABLE inv_movements ADD COLUMN mfg_lot_id CHAR(36) NULL, ADD COLUMN mfg_idempotency_key CHAR(36) NULL, ADD COLUMN mfg_reverses_id CHAR(36) NULL', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl;
EXECUTE mfg_stmt;
DEALLOCATE PREPARE mfg_stmt;

SET @i1 := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movements' AND INDEX_NAME = 'uq_inv_mfg_idem');
SET @ddl := IF(@i1 = 0, 'ALTER TABLE inv_movements ADD UNIQUE KEY uq_inv_mfg_idem (workspace_id, mfg_idempotency_key)', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl;
EXECUTE mfg_stmt;
DEALLOCATE PREPARE mfg_stmt;

SET @i2 := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inv_movements' AND INDEX_NAME = 'idx_inv_mfg_lot');
SET @ddl := IF(@i2 = 0, 'ALTER TABLE inv_movements ADD KEY idx_inv_mfg_lot (workspace_id, mfg_lot_id, movement_date)', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl;
EXECUTE mfg_stmt;
DEALLOCATE PREPARE mfg_stmt;
