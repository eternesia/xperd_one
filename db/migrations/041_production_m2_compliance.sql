-- BS New 16 · Production M2 (kepatuhan): tautan dokumen SDS/izin/label (berkas privat di storage lokal, append-only).
-- Guard kepemilikan dokumen, identitas item, dan kepatuhan lain ada di kode server (production-compliance.functions.ts).
CREATE TABLE IF NOT EXISTS mfg_document_links (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  entity_id CHAR(36) NOT NULL,
  kind VARCHAR(10) NOT NULL,
  path VARCHAR(500) NOT NULL,
  filename VARCHAR(200) NOT NULL,
  mime VARCHAR(40) NOT NULL,
  size_bytes INT NOT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mfg_doc_path (path),
  KEY idx_mfg_doc_entity (workspace_id, entity_id, created_at),
  CONSTRAINT ck_mfg_doc_kind CHECK (kind IN ('sds','permit','label')),
  CONSTRAINT ck_mfg_doc_mime CHECK (mime IN ('application/pdf','image/png','image/jpeg')),
  CONSTRAINT ck_mfg_doc_size CHECK (size_bytes BETWEEN 1 AND 5242880),
  CONSTRAINT fk_mfg_doc_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
