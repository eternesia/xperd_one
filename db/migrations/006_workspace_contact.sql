-- ===========================================================================
-- 006_workspace_contact.sql
--  * Workspace contact details shown on documents (and edited in
--    Settings -> Company profile). Parity with Business Suite, whose
--    public.workspaces table already has phone + email TEXT columns.
-- Runs once via the migrate runner (001..00N in order).
-- ===========================================================================

ALTER TABLE workspaces
  ADD COLUMN phone TEXT NULL AFTER tax_id,
  ADD COLUMN email TEXT NULL AFTER phone;
