INSERT IGNORE INTO packages (id, code, name, product_line, tagline, description, monthly_price, is_public_signup, max_workspace, max_company, max_users, features, sort_order, is_active) VALUES
(UUID(), 'one-starter', 'XPERD One Starter', 'one', 'Smart ERP Solution', 'Cloud ERP siap pakai untuk UMKM yang baru merapikan operasional.', 249000, 1, 1, 1, 3,
 JSON_ARRAY('1 Workspace','1 Company','3 User','Accounting & Laporan Keuangan','Sales & Purchasing','Inventory Dasar','Customer & Vendor','Backup Harian','Support Email'), 1, 1),
(UUID(), 'one-professional', 'XPERD One Professional', 'one', 'Smart ERP Solution', 'Untuk bisnis berkembang dengan beberapa entitas dan tim lebih besar.', 599000, 1, 1, 3, 10,
 JSON_ARRAY('1 Workspace','3 Company','10 User','Semua fitur Starter','Approval Workflow','Asset Management','Advanced Report & Analytics','User Management','Support Prioritas'), 2, 1),
(UUID(), 'business', 'XPERD Business', 'business', 'Powering Growth. Managing Success.', 'ERP untuk perusahaan menengah multi cabang, multi gudang, multi departemen.', NULL, 0, NULL, NULL, NULL,
 JSON_ARRAY('Multi Company & Multi Branch','Multi Warehouse','Role & Permission granular','Budget, Asset, Cash & Bank','CRM & Customer Portal','Project & Manufacturing Lite','KPI Dashboard & Approval Workflow','REST API, Webhook, WhatsApp, Marketplace','Payment Gateway Integration'), 3, 1),
(UUID(), 'enterprise', 'XPERD Enterprise', 'enterprise', 'Built for Enterprise. Designed for Scale.', 'Enterprise Digital Business Platform untuk holding, manufaktur, dan BUMN.', NULL, 0, NULL, NULL, NULL,
 JSON_ARRAY('Financial Consolidation & Intercompany','Treasury, Budget, Procurement','Manufacturing, Project, Asset, HR','BI Dashboard & AI Analytics','API Gateway, SSO, IAM','Audit Trail & Workflow Engine','High Availability & Disaster Recovery','AI Forecast, AI Accounting, OCR','Dedicated Success Manager'), 4, 1);

INSERT IGNORE INTO site_content (id, section, `key`, title_en, title_id, body_en, body_id, sort_order, is_published) VALUES
(UUID(), 'home', 'hero', 'One ERP platform for every scale of business', 'Satu platform ERP untuk setiap skala bisnis', 'From SME to enterprise, XPERD unifies finance, operations, and growth in one cloud platform.', 'Dari UMKM hingga korporasi, XPERD menyatukan keuangan, operasional, dan pertumbuhan dalam satu platform cloud.', 1, 1),
(UUID(), 'home', 'cta', 'Ready to simplify your business?', 'Siap menyederhanakan bisnis Anda?', 'Start with XPERD One today or talk to our team about Business and Enterprise.', 'Mulai dengan XPERD One hari ini atau bicara dengan tim kami untuk Business dan Enterprise.', 2, 1),
(UUID(), 'announcement', 'banner', 'XPERD 2026 release is live', 'Rilis XPERD 2026 telah hadir', 'New AI forecasting, faster reporting, and a redesigned customer portal.', 'Forecast AI baru, pelaporan lebih cepat, dan portal pelanggan yang didesain ulang.', 1, 1);

-- ===========================================================================
-- Roles used by the app (reference — roles are plain strings, no catalog table)
--   user_roles.role            : admin, customer          (platform / global)
--   workspace_members.role     : owner, admin, staff, viewer
--   workspace_role_access.role : admin, staff, viewer     (per-module access)
--   "superadmin"               = a user_roles row with role='admin'
-- ===========================================================================

-- Platform superadmin (kata sandi awal tidak dicatat di repo; ganti setelah pemasangan).
-- Password hash is PBKDF2-SHA256 (100k iterations, 16-byte salt, 256-bit key) —
-- the same format produced by src/lib/auth-jwt.server.ts hashPassword().
INSERT INTO app_users (id, email, full_name, password_hash, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'dnicorp.id@gmail.com', 'Xperd Superadmin',
        'pbkdf2$100000$97bd4799f153a5613f06908a7a6acc50$064085a62814a7539d4ac03c67c3a922e3a8ef58bab6291bd295a9a70426360e', 1)
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), password_hash = VALUES(password_hash), is_active = 1;

-- Keep the profiles row in sync (the team page reads full_name/email from profiles).
INSERT IGNORE INTO profiles (id, email, full_name, company_name)
SELECT id, email, full_name, 'XPERD' FROM app_users WHERE email = 'dnicorp.id@gmail.com';

-- Grant the platform 'admin' role (requireAdmin() / superadmin).
INSERT INTO user_roles (id, user_id, role)
SELECT UUID(), id, 'admin' FROM app_users WHERE email = 'dnicorp.id@gmail.com'
ON DUPLICATE KEY UPDATE role = VALUES(role);

-- Second admin account (kata sandi awal tidak dicatat di repo).
-- (PBKDF2-SHA256, 100k iterations — same format as auth-jwt.server.ts)
INSERT INTO app_users (id, email, full_name, password_hash, is_active)
VALUES ('00000000-0000-0000-0000-000000000002', 'hakimtop.id@gmail.com', 'Hakim Top',
        'pbkdf2$100000$8c48de26136ca03f4faba064949f3ee6$0dc08403200181cb1e66dccd646e3234ecb88671e4c3ceefb0a65eee1a502445', 1)
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), password_hash = VALUES(password_hash), is_active = 1;

-- Keep the profiles row in sync.
INSERT IGNORE INTO profiles (id, email, full_name, company_name)
SELECT id, email, full_name, 'XPERD' FROM app_users WHERE email = 'hakimtop.id@gmail.com';

-- Grant the platform 'admin' role.
INSERT INTO user_roles (id, user_id, role)
SELECT UUID(), id, 'admin' FROM app_users WHERE email = 'hakimtop.id@gmail.com'
ON DUPLICATE KEY UPDATE role = VALUES(role);
