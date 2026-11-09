-- Bayar paket langsung: top-up gateway (QRIS/kartu) yang membawa niat beli paket.
-- Setelah gateway mengonfirmasi pembayaran, paket dibeli otomatis dari saldo hasil top-up itu.
ALTER TABLE topups
  ADD COLUMN purchase_intent JSON NULL,
  ADD COLUMN purchase_applied_at DATETIME(6) NULL;
