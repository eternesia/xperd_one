-- Dev-only: saldo awal wallet Omnix untuk tenant demo supaya e2e dapat menguji
-- pemotongan biaya per transaksi (produksi: saldo diisi lewat top up yang
-- disetujui Super Admin).
SET @tenant = 'e77b5fd9-cc3f-417b-bed8-75aad0801d46';

INSERT INTO omnix_wallets (tenant_id, balance, bundle_quota, bundle_used, bundle_ends_at)
VALUES (@tenant, 100000, 0, 0, NULL)
ON DUPLICATE KEY UPDATE balance = 100000, bundle_quota = 0, bundle_used = 0, bundle_ends_at = NULL;

INSERT INTO omnix_wallet_ledger (id, tenant_id, kind, status, amount, balance_after, note)
SELECT 'aaaaaaaa-bbbb-0000-0000-0000000000d1', @tenant, 'topup', 'posted', 100000, 100000, 'Saldo awal fixture dev'
WHERE NOT EXISTS (
  SELECT 1 FROM omnix_wallet_ledger WHERE id = 'aaaaaaaa-bbbb-0000-0000-0000000000d1'
);
