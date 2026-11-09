-- Riwayat susut produksi per order (selisih output barang jadi vs output yang diharapkan).
-- Susut normal (dalam toleransi) tetap menjadi bagian HPP barang jadi; susut di atas toleransi dibebankan (akun scrap_loss).
CREATE TABLE IF NOT EXISTS mfg_order_waste (
  id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  planned_qty DECIMAL(18,4) NOT NULL DEFAULT 0,
  expected_qty DECIMAL(18,4) NOT NULL DEFAULT 0,
  actual_qty DECIMAL(18,4) NOT NULL DEFAULT 0,
  waste_qty DECIMAL(18,4) NOT NULL DEFAULT 0,
  normal_qty DECIMAL(18,4) NOT NULL DEFAULT 0,
  abnormal_qty DECIMAL(18,4) NOT NULL DEFAULT 0,
  tolerance_pct DECIMAL(9,4) NOT NULL DEFAULT 0,
  total_cost BIGINT NOT NULL DEFAULT 0,
  abnormal_cost BIGINT NOT NULL DEFAULT 0,
  loss_material BIGINT NOT NULL DEFAULT 0,
  loss_conversion BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_ow_order (workspace_id, order_id),
  KEY idx_mfg_ow_ws (workspace_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
