-- Fixture dokumen non-draft untuk e2e (idempotent, id tetap).
--  * `E2E-SO-0001` (sales order approved) → dipakai `draft-delete.spec.ts` untuk
--    memastikan tombol Delete TIDAK muncul pada dokumen non-draft, dan
--    `doc-pdf.spec.ts` (menunjuk id `...000d`) untuk menguji unduh PDF.
--  * `E2E-PR-0001` (purchase request draft) → dipakai `draft-edit.spec.ts` untuk
--    menguji ubah draft di sisi pembelian.
SET @ws = '46bc16a0-56bc-4bd1-a813-fe7f0046a6d9';

INSERT INTO sls_documents
  (id, workspace_id, doc_type, doc_number, doc_date, customer_code, customer_name,
   status, currency, subtotal, discount_amount, tax_amount, total, notes, created_at, updated_at)
VALUES
  ('aaaaaaaa-bbbb-0000-0000-00000000000d', @ws, 'sales_order', 'E2E-SO-0001', CURDATE(),
   'C-0001', 'PT Contoh Pelanggan', 'approved', 'IDR', 150000, 0, 0, 150000,
   'Fixture e2e dokumen non-draft', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  status = VALUES(status), total = VALUES(total), subtotal = VALUES(subtotal), updated_at = NOW();

INSERT INTO sls_document_lines
  (id, document_id, workspace_id, line_no, item_code, description, qty, uom_code,
   unit_price, discount, tax_rate, line_total, qty_fulfilled, created_at, updated_at)
VALUES
  ('aaaaaaaa-bbbb-0000-0000-00000000000e', 'aaaaaaaa-bbbb-0000-0000-00000000000d', @ws, 1,
   'SRV-001', 'Jasa contoh (fixture e2e PDF)', 1, 'PCS', 150000, 0, 0, 150000, 0, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  qty = VALUES(qty), unit_price = VALUES(unit_price), line_total = VALUES(line_total), updated_at = NOW();

INSERT INTO prc_documents
  (id, workspace_id, doc_type, doc_number, doc_date, supplier_code, supplier_name,
   warehouse_code, status, currency, subtotal, discount_amount, tax_amount, total, notes, created_at, updated_at)
VALUES
  ('aaaaaaaa-bbbb-0000-0000-0000000000f3', @ws, 'purchase_request', 'E2E-PR-0001', CURDATE(),
   'E2E-SUP-001', 'PT Contoh Pemasok', 'WH-01', 'draft', 'IDR', 100000, 0, 0, 100000,
   'Fixture e2e draft pembelian', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  status = VALUES(status), total = VALUES(total), subtotal = VALUES(subtotal), updated_at = NOW();

INSERT INTO prc_document_lines
  (id, document_id, workspace_id, line_no, item_code, description, qty, uom_code,
   unit_price, discount, tax_rate, line_total, qty_fulfilled, created_at, updated_at)
VALUES
  ('aaaaaaaa-bbbb-0000-0000-0000000000f4', 'aaaaaaaa-bbbb-0000-0000-0000000000f3', @ws, 1,
   'E2E-ITM-001', 'Item uji e2e', 1, 'PCS', 100000, 0, 0, 100000, 0, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  qty = VALUES(qty), unit_price = VALUES(unit_price), line_total = VALUES(line_total), updated_at = NOW();
