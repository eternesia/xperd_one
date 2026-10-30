-- Dev: langganan ERP nyata untuk tenant demo (XPERD Demo) supaya billing wallet (ganti paket prorata,
-- bayar invoice, perpanjangan otomatis) bisa diuji end-to-end tanpa fixture sementara.
-- Idempoten: hanya dibuat bila tenant belum punya langganan. Periode relatif terhadap hari seed dijalankan.
INSERT INTO subscriptions (id, tenant_id, package_id, status, billing_cycle, unit_price, current_period_start, current_period_end)
SELECT UUID(), t.id, p.id, 'active', 'monthly', p.monthly_price, CURDATE() - INTERVAL 10 DAY, CURDATE() + INTERVAL 20 DAY
  FROM tenants t
  JOIN packages p ON p.code = 'one-professional'
 WHERE t.name = 'XPERD Demo'
   AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.tenant_id = t.id);
UPDATE tenants t JOIN packages p ON p.code = 'one-professional'
   SET t.package_id = p.id, t.status = 'active'
 WHERE t.name = 'XPERD Demo' AND t.package_id IS NULL;
