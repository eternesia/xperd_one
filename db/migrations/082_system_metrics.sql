-- Riwayat metrik server (sampel tiap 5 menit, disimpan 14 hari) untuk grafik Kesehatan Sistem. Idempoten.
CREATE TABLE IF NOT EXISTS system_metrics (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  sampled_at datetime NOT NULL,
  mem_pct decimal(5,1) NOT NULL DEFAULT 0,
  cpu_pct decimal(6,1) NOT NULL DEFAULT 0,
  disk_pct decimal(5,1) NOT NULL DEFAULT 0,
  rss_bytes bigint unsigned NOT NULL DEFAULT 0,
  db_ping_ms decimal(8,1) NOT NULL DEFAULT 0,
  db_connections int NOT NULL DEFAULT 0,
  db_size_bytes bigint unsigned NOT NULL DEFAULT 0,
  render_cpu_pct decimal(6,1) NULL,
  render_mem_pct decimal(5,1) NULL,
  PRIMARY KEY (id),
  KEY ix_system_metrics_at (sampled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
