-- ===========================================================================
-- 002_sales_source_fixture.sql
--  * Fixture untuk e2e `sales-partial-amount.spec.ts` (#7 bagian NILAI):
--    sebuah Delivery Order yang sudah terkirim (`received`) dan BELUM pernah
--    ditagih, sehingga muncul di picker sumber AR Invoice dengan sisa nilai.
--  * Idempotent: memakai id tetap + ON DUPLICATE KEY UPDATE, jadi aman diulang
--    dan tidak menambah baris baru setiap kali seed dijalankan.
--  * Tidak dipakai oleh aplikasi — murni data uji.
-- ===========================================================================

SET @ws = '46bc16a0-56bc-4bd1-a813-fe7f0046a6d9';

INSERT INTO sls_documents
  (id, workspace_id, doc_type, doc_number, doc_date, customer_code, customer_name,
   status, currency, subtotal, discount_amount, tax_amount, total, notes, created_at, updated_at)
VALUES
  ('aaaaaaaa-bbbb-0000-0000-0000000000e1', @ws, 'delivery_order', 'E2E-DO-0001', CURDATE(),
   'C-0001', 'PT Contoh Pelanggan', 'received', 'IDR', 200000, 0, 0, 200000,
   'Fixture e2e partial amount', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  status = VALUES(status), total = VALUES(total), subtotal = VALUES(subtotal), updated_at = NOW();

INSERT INTO sls_document_lines
  (id, document_id, workspace_id, line_no, item_code, description, qty, uom_code,
   unit_price, discount, tax_rate, line_total, qty_fulfilled, created_at, updated_at)
VALUES
  ('aaaaaaaa-bbbb-0000-0000-0000000000e2', 'aaaaaaaa-bbbb-0000-0000-0000000000e1', @ws, 1,
   'SRV-001', 'Jasa contoh (fixture e2e)', 2, 'PCS', 100000, 0, 0, 200000, 2, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  qty = VALUES(qty), qty_fulfilled = VALUES(qty_fulfilled), unit_price = VALUES(unit_price),
  line_total = VALUES(line_total), updated_at = NOW();
