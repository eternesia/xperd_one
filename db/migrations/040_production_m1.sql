-- BS New 16 · Production M1 (fondasi): pengaturan, peran produksi, kode formulasi, profil item, registrasi produk,
-- pusat kerja, routing, tarif biaya, penomoran, audit. Tanpa trigger/fungsi tersimpan: semua aturan ada di kode server
-- (src/lib/production.server.ts); tabel audit & alokasi nomor hanya di-INSERT (tidak ada jalur UPDATE/DELETE).
-- Idempoten. Add-on katalog `manufacturing` (fitur tier: mfg_basic atau legacy) ditambahkan bila belum ada.

INSERT INTO addons (id, code, name, tagline, description, monthly_price, pricing_unit, module_id, sort_order)
VALUES (UUID(), 'manufacturing', 'Production', 'Formulasi, lot, mutu, perintah produksi & biaya',
        'Modul produksi: formulasi/BOM berversi, lot & stok FEFO, mutu (QC), perintah produksi, biaya produksi dengan jurnal otomatis, traceability & recall, log limbah B3.',
        0, 'month', 'manufacturing', 50)
ON DUPLICATE KEY UPDATE module_id = VALUES(module_id);

CREATE TABLE IF NOT EXISTS mfg_settings (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  numbering JSON NOT NULL,
  costing_method VARCHAR(10) NOT NULL DEFAULT 'actual',
  fefo TINYINT(1) NOT NULL DEFAULT 1,
  min_remaining_shelf_life_days INT NOT NULL DEFAULT 0,
  yield_tolerance_pct DECIMAL(9,6) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_settings_ws (workspace_id),
  CONSTRAINT ck_mfg_settings_cost CHECK (costing_method IN ('actual','standard')),
  CONSTRAINT ck_mfg_settings_shelf CHECK (min_remaining_shelf_life_days >= 0),
  CONSTRAINT ck_mfg_settings_yield CHECK (yield_tolerance_pct BETWEEN 0 AND 100),
  CONSTRAINT fk_mfg_settings_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_workspace_roles (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role VARCHAR(30) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_roles (workspace_id, user_id, role),
  CONSTRAINT ck_mfg_roles_role CHECK (role IN ('production_planner','production_supervisor','operator','warehouse','qc_analyst','qa_manager','cost_accountant','viewer')),
  CONSTRAINT fk_mfg_roles_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_formulation_codes (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code CHAR(2) NOT NULL,
  name_en VARCHAR(200) NOT NULL,
  name_id VARCHAR(200) NOT NULL,
  physical_state VARCHAR(10) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_fcodes (workspace_id, code),
  CONSTRAINT ck_mfg_fcodes_state CHECK (physical_state IN ('liquid','solid','other')),
  CONSTRAINT fk_mfg_fcodes_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_item_profiles (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  item_class VARCHAR(30) NOT NULL,
  cas_no VARCHAR(60) NULL,
  ghs_classes JSON NOT NULL,
  un_number VARCHAR(20) NULL,
  is_b3 TINYINT(1) NOT NULL DEFAULT 0,
  shelf_life_days INT NULL,
  storage_condition VARCHAR(500) NULL,
  incompatible_classes JSON NOT NULL,
  density_g_ml DECIMAL(18,4) NULL,
  potency_basis VARCHAR(10) NOT NULL DEFAULT 'as_is',
  requires_qc_incoming TINYINT(1) NOT NULL DEFAULT 0,
  fefo TINYINT(1) NOT NULL DEFAULT 1,
  sds_file_id VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_profiles (workspace_id, item_id),
  CONSTRAINT ck_mfg_profiles_class CHECK (item_class IN ('active_ingredient','solvent','surfactant','filler','additive','packaging_primary','packaging_secondary','label','intermediate','finished_good','technical')),
  CONSTRAINT ck_mfg_profiles_potency CHECK (potency_basis IN ('as_is','dry')),
  CONSTRAINT fk_mfg_profiles_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_mfg_profiles_item FOREIGN KEY (item_id) REFERENCES md_items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_product_registrations (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  registration_no VARCHAR(120) NOT NULL,
  permit_type VARCHAR(12) NOT NULL,
  holder_supplier_id CHAR(36) NULL,
  holder_customer_id CHAR(36) NULL,
  formulation_code CHAR(2) NULL,
  ai_declared JSON NOT NULL,
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  label_file_id VARCHAR(500) NULL,
  permit_file_id VARCHAR(500) NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'active',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_regs (workspace_id, registration_no),
  KEY idx_mfg_regs_valid (workspace_id, valid_until),
  KEY idx_mfg_regs_item (workspace_id, item_id),
  CONSTRAINT ck_mfg_regs_permit CHECK (permit_type IN ('tetap','percobaan','sementara')),
  CONSTRAINT ck_mfg_regs_status CHECK (status IN ('active','expired','suspended')),
  CONSTRAINT ck_mfg_regs_dates CHECK (valid_until >= valid_from),
  CONSTRAINT ck_mfg_regs_holder CHECK (holder_supplier_id IS NULL OR holder_customer_id IS NULL),
  CONSTRAINT fk_mfg_regs_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_mfg_regs_item FOREIGN KEY (item_id) REFERENCES md_items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_work_centers (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  center_type VARCHAR(20) NOT NULL,
  capacity_per_hour DECIMAL(18,4) NOT NULL DEFAULT 0,
  uom_code VARCHAR(100) NULL,
  labor_rate_per_hour BIGINT NOT NULL DEFAULT 0,
  overhead_rate_per_hour BIGINT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_wc (workspace_id, code),
  CONSTRAINT ck_mfg_wc_type CHECK (center_type IN ('mixing','milling','blending','granulation','filling','packing','qc_lab')),
  CONSTRAINT ck_mfg_wc_nums CHECK (capacity_per_hour >= 0 AND labor_rate_per_hour >= 0 AND overhead_rate_per_hour >= 0),
  CONSTRAINT fk_mfg_wc_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_routings (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_routings (workspace_id, code),
  CONSTRAINT fk_mfg_routings_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_mfg_routings_item FOREIGN KEY (item_id) REFERENCES md_items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_routing_ops (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  routing_id CHAR(36) NOT NULL,
  work_center_id CHAR(36) NOT NULL,
  sequence INT NOT NULL,
  setup_minutes DECIMAL(18,4) NOT NULL DEFAULT 0,
  run_minutes DECIMAL(18,4) NOT NULL DEFAULT 0,
  instructions TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_routing_ops (workspace_id, routing_id, sequence),
  CONSTRAINT ck_mfg_rops CHECK (sequence > 0 AND setup_minutes >= 0 AND run_minutes >= 0),
  CONSTRAINT fk_mfg_rops_routing FOREIGN KEY (routing_id) REFERENCES mfg_routings (id),
  CONSTRAINT fk_mfg_rops_wc FOREIGN KEY (work_center_id) REFERENCES mfg_work_centers (id),
  CONSTRAINT fk_mfg_rops_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_cost_rates (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  work_center_id CHAR(36) NOT NULL,
  valid_from DATE NOT NULL,
  valid_until DATE NULL,
  labor_rate_per_hour BIGINT NOT NULL DEFAULT 0,
  overhead_rate_per_hour BIGINT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_rates (workspace_id, work_center_id, valid_from),
  CONSTRAINT ck_mfg_rates CHECK (labor_rate_per_hour >= 0 AND overhead_rate_per_hour >= 0 AND (valid_until IS NULL OR valid_until >= valid_from)),
  CONSTRAINT fk_mfg_rates_wc FOREIGN KEY (work_center_id) REFERENCES mfg_work_centers (id),
  CONSTRAINT fk_mfg_rates_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_number_counters (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  document_kind VARCHAR(20) NOT NULL,
  period_key VARCHAR(12) NOT NULL,
  counter_value BIGINT NOT NULL DEFAULT 0,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_counters (workspace_id, document_kind, period_key),
  CONSTRAINT ck_mfg_counters CHECK (document_kind IN ('order','lot','inspection','deviation') AND counter_value >= 0),
  CONSTRAINT fk_mfg_counters_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_number_allocations (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  document_kind VARCHAR(20) NOT NULL,
  source_id CHAR(36) NOT NULL,
  idempotency_key CHAR(36) NOT NULL,
  document_number VARCHAR(160) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_alloc_src (workspace_id, document_kind, source_id),
  UNIQUE KEY uq_mfg_alloc_key (workspace_id, idempotency_key),
  UNIQUE KEY uq_mfg_alloc_no (workspace_id, document_number),
  CONSTRAINT fk_mfg_alloc_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfg_audit_log (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  created_by CHAR(36) NULL,
  entity_table VARCHAR(60) NOT NULL,
  entity_id CHAR(36) NOT NULL,
  action VARCHAR(30) NOT NULL,
  old_value JSON NULL,
  new_value JSON NULL,
  reason VARCHAR(2000) NOT NULL,
  signed_at DATETIME(6) NULL,
  signature_method VARCHAR(10) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_mfg_audit_ws (workspace_id, created_at),
  KEY idx_mfg_audit_entity (workspace_id, entity_table, entity_id),
  CONSTRAINT ck_mfg_audit_reason CHECK (CHAR_LENGTH(TRIM(reason)) > 0),
  CONSTRAINT fk_mfg_audit_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
