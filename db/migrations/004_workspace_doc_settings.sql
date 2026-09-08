-- ===========================================================================
-- 004_workspace_doc_settings.sql
--  * Workspace document branding columns (doc template + bank + footer note)
--    consumed by the Doc Print v2 templates (lib/doc-print.ts).
--  * Seed the "qalling" add-on catalog entry used by module gating.
-- Runs once via the migrate runner (001..00N in order).
-- ===========================================================================

ALTER TABLE workspaces
  ADD COLUMN doc_template VARCHAR(20) NOT NULL DEFAULT 'classic' AFTER default_costing_method,
  ADD COLUMN bank_info TEXT NULL AFTER doc_template,
  ADD COLUMN doc_footer_note TEXT NULL AFTER bank_info;

INSERT INTO addons (id, code, name, tagline, description, monthly_price, module_id, sort_order)
VALUES (UUID(), 'qalling', 'Qalling CRM', 'Leads, pipeline, follow-up, broadcast & campaigns',
        'CRM add-on module for XPERD One.', 0, 'crm', 10)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  tagline = VALUES(tagline),
  description = VALUES(description),
  module_id = VALUES(module_id),
  sort_order = VALUES(sort_order);
