-- Hibah akses sementara (uji coba fitur / mitra promosi) tanpa mengganti paket tenant.
-- Fitur dari tier yang dipilih digabung ke entitlement tenant selama masa berlaku.
CREATE TABLE IF NOT EXISTS feature_grants (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  tenant_id CHAR(36) NOT NULL,
  addon_code VARCHAR(50) NOT NULL DEFAULT 'qalling',
  tier_id CHAR(36) NULL,
  features JSON NOT NULL,
  limits JSON NOT NULL,
  reason VARCHAR(20) NOT NULL DEFAULT 'trial',
  note VARCHAR(500) NULL,
  email VARCHAR(255) NULL,
  starts_at DATE NOT NULL,
  ends_at DATE NOT NULL,
  revoked_at DATETIME(6) NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_feature_grants_tenant (tenant_id, ends_at),
  CONSTRAINT fk_feature_grants_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
);
