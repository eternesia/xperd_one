-- BS New 16 · Production M3 (BOM/formulasi berversi): boms, versions (draft→in_review→approved→obsolete), lines, transitions
-- (append-only), tantangan persetujuan (kode OTP email). Tanpa trigger: kunci versi, pemisahan tugas, dan validasi komposisi
-- ditegakkan di src/lib/production-bom.functions.ts dengan SELECT … FOR UPDATE. Tanpa FK ke tabel tahap lain.
CREATE TABLE IF NOT EXISTS mfg_boms (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  code VARCHAR(80) NOT NULL,
  formulation_code CHAR(2) NULL,
  target_content DECIMAL(18,4) NULL,
  target_unit VARCHAR(5) NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_boms_code (workspace_id, code),
  KEY idx_mfg_boms_ws (workspace_id, created_at),
  CONSTRAINT ck_mfg_boms_unit CHECK (target_unit IS NULL OR target_unit IN ('%w/w','g/L')),
  CONSTRAINT fk_mfg_boms_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_mfg_boms_item FOREIGN KEY (item_id) REFERENCES md_items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_bom_versions (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  bom_id CHAR(36) NOT NULL,
  version_no INT NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'draft',
  base_batch_qty DECIMAL(18,4) NOT NULL,
  base_uom VARCHAR(100) NOT NULL,
  std_yield_pct DECIMAL(9,6) NOT NULL DEFAULT 100,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  registration_id CHAR(36) NULL,
  approved_by CHAR(36) NULL,
  approved_at DATETIME(6) NULL,
  change_reason VARCHAR(2000) NOT NULL,
  created_by CHAR(36) NOT NULL,
  last_modified_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_bomv (workspace_id, bom_id, version_no),
  KEY idx_mfg_bomv_bom (bom_id),
  CONSTRAINT ck_mfg_bomv_status CHECK (status IN ('draft','in_review','approved','obsolete')),
  CONSTRAINT ck_mfg_bomv_nums CHECK (version_no > 0 AND base_batch_qty > 0 AND std_yield_pct > 0 AND std_yield_pct <= 100),
  CONSTRAINT ck_mfg_bomv_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT fk_mfg_bomv_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_mfg_bomv_bom FOREIGN KEY (bom_id) REFERENCES mfg_boms (id),
  CONSTRAINT fk_mfg_bomv_reg FOREIGN KEY (registration_id) REFERENCES mfg_product_registrations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_bom_lines (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  bom_version_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  line_type VARCHAR(12) NOT NULL,
  qty_per_base DECIMAL(18,4) NOT NULL,
  uom VARCHAR(100) NOT NULL,
  basis VARCHAR(18) NOT NULL DEFAULT 'gross',
  ai_target_pct DECIMAL(9,6) NULL,
  potency_compensate TINYINT(1) NOT NULL DEFAULT 0,
  tolerance_pct DECIMAL(9,6) NOT NULL DEFAULT 0,
  is_critical TINYINT(1) NOT NULL DEFAULT 0,
  sequence INT NOT NULL,
  add_step_note TEXT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_bomline_seq (workspace_id, bom_version_id, sequence),
  UNIQUE KEY uq_mfg_bomline_item (workspace_id, bom_version_id, item_id),
  CONSTRAINT ck_mfg_bomline CHECK (line_type IN ('ingredient','packaging','co_product','by_product') AND basis IN ('gross','active_equivalent')
    AND qty_per_base > 0 AND sequence > 0 AND tolerance_pct BETWEEN 0 AND 100 AND (ai_target_pct IS NULL OR ai_target_pct BETWEEN 0 AND 100)),
  CONSTRAINT fk_mfg_bomline_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_mfg_bomline_ver FOREIGN KEY (bom_version_id) REFERENCES mfg_bom_versions (id),
  CONSTRAINT fk_mfg_bomline_item FOREIGN KEY (item_id) REFERENCES md_items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_bom_transitions (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  version_id CHAR(36) NOT NULL,
  from_status VARCHAR(10) NOT NULL,
  to_status VARCHAR(10) NOT NULL,
  idempotency_key CHAR(36) NOT NULL,
  reason VARCHAR(2000) NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_bomt_key (workspace_id, idempotency_key),
  KEY idx_mfg_bomt_ver (version_id),
  CONSTRAINT fk_mfg_bomt_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_mfg_bomt_ver FOREIGN KEY (version_id) REFERENCES mfg_bom_versions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_approval_challenges (
  id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  version_id CHAR(36) NOT NULL,
  actor CHAR(36) NOT NULL,
  code_hash VARCHAR(64) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expires_at DATETIME(6) NOT NULL,
  verified_at DATETIME(6) NULL,
  consumed_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  KEY idx_mfg_appr_actor (actor, created_at),
  CONSTRAINT fk_mfg_appr_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_mfg_appr_ver FOREIGN KEY (version_id) REFERENCES mfg_bom_versions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Toleransi komposisi bahan aktif (regulatori: tanpa toleransi positif implisit → default 0). Idempoten lewat information_schema.
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mfg_settings' AND COLUMN_NAME = 'bom_ai_tolerance_pct');
SET @ddl := IF(@has_col = 0, 'ALTER TABLE mfg_settings ADD COLUMN bom_ai_tolerance_pct DECIMAL(9,6) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl;
EXECUTE mfg_stmt;
DEALLOCATE PREPARE mfg_stmt;
