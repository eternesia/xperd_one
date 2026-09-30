-- Dev-only (#65): fixture tag produk tenant/invoice.
-- Menambah satu tenant berproduk `qalling` + satu invoice untuk masing-masing
-- produk, supaya halaman Tenancy & Invoices punya data nyata untuk difilter saat
-- pengembangan/e2e. Idempoten (subdomain & invoice_number unik).
SET @tenant_qalling = 'e77b5fd9-cc3f-417b-bed8-75aad0801d47';

INSERT INTO tenants (id, name, subdomain, status, product, industry, started_at, notes)
VALUES (@tenant_qalling, 'Qalling Demo', 'qalling-demo', 'trial', 'qalling', 'Teknologi', CURDATE(), 'dev fixture #65')
ON DUPLICATE KEY UPDATE product = 'qalling';

INSERT INTO invoices (id, invoice_number, tenant_id, status, product, issue_date, due_date, subtotal, tax_amount, total, notes)
VALUES
  ('e77b5fd9-cc3f-417b-bed8-75aad0801d48', 'E2E-INV-XPERD-0001', 'e77b5fd9-cc3f-417b-bed8-75aad0801d46', 'sent', 'xperd', CURDATE(), CURDATE() + INTERVAL 14 DAY, 1000000.00, 110000.00, 1110000.00, 'dev fixture #65'),
  ('e77b5fd9-cc3f-417b-bed8-75aad0801d49', 'E2E-INV-QALLING-0001', @tenant_qalling, 'sent', 'qalling', CURDATE(), CURDATE() + INTERVAL 14 DAY, 500000.00, 55000.00, 555000.00, 'dev fixture #65')
ON DUPLICATE KEY UPDATE id = id;
