-- ===========================================================================
-- 015_audit_trail.sql — Ronde 31 (parity BS New 8/10, fitur `audit_logs`)
--
--  * Tabel `audit_logs`: jejak setiap pembuatan / perubahan / penghapusan data
--    keuangan & master (siapa, kapan, kolom apa yang berubah, nilai sebelum dan
--    sesudah).
--  * **Tanpa trigger/stored function** (aturan repo): baris audit ditulis oleh
--    lapisan aplikasi di `src/lib/data.functions.ts` pada jalur tulis generik
--    (`saveWorkspaceRow`, `deleteWorkspaceRow`, `upsertWorkspaceRows`), sehingga
--    aktor (user yang login) dan diff kolom dihitung di app.
--  * Hanya editor/owner/admin yang bisa MEMBACA (dijaga server fn), sesuai
--    kebijakan New 8/10 (RLS "workspace owners/admins read audit logs").
--
-- Idempotent (`CREATE TABLE IF NOT EXISTS`). Runs once via the migrate runner.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  workspace_id CHAR(36) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id VARCHAR(100),
  action VARCHAR(10) NOT NULL,
  doc_ref VARCHAR(255),
  /* daftar kolom yang berubah (UPDATE) dalam JSON array */
  changed_fields JSON,
  old_data JSON,
  new_data JSON,
  actor_id CHAR(36),
  actor_email VARCHAR(255),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY ix_audit_logs_ws_time (workspace_id, created_at),
  KEY ix_audit_logs_ws_table (workspace_id, table_name, created_at),
  KEY ix_audit_logs_doc_ref (workspace_id, doc_ref),
  CONSTRAINT fk_audit_logs_ws FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
