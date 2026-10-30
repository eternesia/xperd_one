-- Ronde 46: selaraskan data katalog dengan situs live xperd-new.lovable.app (akun Starter, dibaca 2026-10-30).
-- Add-on: harga bulanan & tagline mengikuti live (Qalling 349.000, Slipp HR 149.000, Omnix 249.000, XPro 199.000).
UPDATE addons SET tagline = 'Prospek, pipeline & media sosial', monthly_price = 349000, pricing_unit = 'month' WHERE code = 'qalling';
UPDATE addons SET tagline = 'Payroll, BPJS & PPh 21', monthly_price = 149000, pricing_unit = 'month' WHERE code = 'slipp_hr';
UPDATE addons SET tagline = 'Marketplace & food delivery', monthly_price = 249000, pricing_unit = 'month' WHERE code = 'omnix';
UPDATE addons SET tagline = 'Proyek, RAB & termin', monthly_price = 199000, pricing_unit = 'month' WHERE code = 'xpro';

-- Paket: Professional 3 workspace, Business 10 workspace / 50 pengguna (tampilan paket di live).
UPDATE packages SET max_workspace = 3 WHERE code = 'one-professional';
UPDATE packages SET max_workspace = 10, max_users = 50 WHERE code = 'business';

-- Opsi Qalling di live: WhatsApp channel Rp100.000, Extra user Rp30.000, Extra storage 5 GB Rp10.000 (tanpa opsi akun).
-- Hibah/maks tidak terlihat dari sisi pelanggan → disimpulkan dari nama (WhatsApp = fitur `whatsapp`, user = +1 max_users,
-- storage = +5 GB); Super Admin dapat menyesuaikan.
DELETE FROM addon_options WHERE code = 'qalling_extra_account'
  AND NOT EXISTS (SELECT 1 FROM tenant_addon_options o WHERE o.option_id = addon_options.id);
UPDATE addon_options SET name = 'Extra user', monthly_price = 30000 WHERE code = 'qalling_extra_user';
UPDATE addon_options SET name = 'Extra storage 5 GB', monthly_price = 10000 WHERE code = 'qalling_extra_storage';
INSERT IGNORE INTO addon_options (id, addon_id, code, name, monthly_price, max_quantity, grants, requires_features, is_active)
SELECT UUID(), a.id, 'qalling_whatsapp', 'WhatsApp channel', 100000, 5, CAST('{"features":{"whatsapp":true}}' AS JSON), CAST('["crm"]' AS JSON), 1
  FROM addons a WHERE a.code = 'qalling';
