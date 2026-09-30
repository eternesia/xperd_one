-- ===========================================================================
-- 012_item_stock_flags.sql
--  * Batch 3 item #41: samakan penanda `is_stocked` dengan tipe item.
--    Migration 010 menambahkan kolom `md_items.is_stocked` dengan DEFAULT 1,
--    sehingga item JASA yang sudah ada (`item_type = 'service'`) ikut tertandai
--    sebagai persediaan. Form Master Data menampilkan kolom ini read-only dan
--    menurunkannya dari `item_type`, jadi nilainya disamakan agar tampilan tidak
--    menyesatkan (logika stok & jurnal sendiri sudah memakai `item_type` sebagai
--    penentu utama).
--  * Idempotent: hanya baris yang nilainya masih salah yang diubah.
-- Runs once via the migrate runner (001..00N in order).
-- ===========================================================================

UPDATE md_items SET is_stocked = 0 WHERE item_type <> 'goods' AND is_stocked <> 0;
UPDATE md_items SET is_stocked = 1 WHERE item_type = 'goods' AND is_stocked <> 1;
