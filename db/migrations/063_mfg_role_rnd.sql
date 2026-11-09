-- Peran departemen R&D (BoM & formulasi) pada peran produksi.
SET @c := (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'ck_mfg_roles_role' AND CHECK_CLAUSE LIKE '%rnd_formulator%');
SET @ddl := IF(@c = 0, 'ALTER TABLE mfg_workspace_roles DROP CHECK ck_mfg_roles_role', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl; EXECUTE mfg_stmt; DEALLOCATE PREPARE mfg_stmt;
SET @c := (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'ck_mfg_roles_role');
SET @ddl := IF(@c = 0, 'ALTER TABLE mfg_workspace_roles ADD CONSTRAINT ck_mfg_roles_role CHECK (role IN (''production_planner'',''production_supervisor'',''operator'',''warehouse'',''qc_analyst'',''qa_manager'',''cost_accountant'',''rnd_formulator'',''viewer''))', 'SELECT 1');
PREPARE mfg_stmt FROM @ddl; EXECUTE mfg_stmt; DEALLOCATE PREPARE mfg_stmt;
