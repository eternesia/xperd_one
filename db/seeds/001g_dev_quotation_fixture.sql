-- Dev-only: satu dokumen **draft** penawaran (`QUO/...`) untuk e2e.
--
-- Sebelumnya `draft-delete.spec.ts` & `draft-edit.spec.ts` bergantung pada
-- dokumen `QUO/` yang terbentuk tidak sengaja dari e2e CRM (konversi lead →
-- penawaran). Di DB bersih dokumen itu tidak ada, sehingga kedua spec gagal dan
-- fitur "hanya draft yang boleh dihapus / diedit" tidak pernah teruji.
--
-- Idempotent: id & nomor tetap + ON DUPLICATE KEY UPDATE. Nomor sengaja memakai
-- format produksi (`QUO/<tahun><bulan>/<urut>`) tetapi dengan urutan `9001`
-- supaya tidak bertabrakan dengan penomoran otomatis aplikasi.
SET @ws = '46bc16a0-56bc-4bd1-a813-fe7f0046a6d9';

INSERT INTO sls_documents
  (id, workspace_id, doc_type, doc_number, doc_date, customer_code, customer_name,
   status, currency, subtotal, discount_amount, tax_amount, total, notes, created_at, updated_at)
VALUES
  ('aaaaaaaa-bbbb-0000-0000-0000000000c1', @ws, 'quotation', 'QUO/E2E/9001', CURDATE(),
   'C-0001', 'PT Contoh Pelanggan', 'draft', 'IDR', 100000, 0, 0, 100000,
   'Fixture e2e draft penawaran', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  status = VALUES(status), total = VALUES(total), subtotal = VALUES(subtotal), updated_at = NOW();

INSERT INTO sls_document_lines
  (id, document_id, workspace_id, line_no, item_code, description, qty, uom_code,
   unit_price, discount, tax_rate, line_total, qty_fulfilled, created_at, updated_at)
VALUES
  ('aaaaaaaa-bbbb-0000-0000-0000000000c2', 'aaaaaaaa-bbbb-0000-0000-0000000000c1', @ws, 1,
   'SRV-001', 'Jasa contoh (fixture e2e draft)', 1, 'PCS', 100000, 0, 0, 100000, 0, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  qty = VALUES(qty), unit_price = VALUES(unit_price), line_total = VALUES(line_total), updated_at = NOW();
