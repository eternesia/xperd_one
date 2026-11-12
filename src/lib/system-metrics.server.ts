/**
 * Riwayat metrik server untuk grafik Kesehatan Sistem (server-only).
 * Sampel diambil penjadwal tiap 5 menit (dan saat halaman dibuka bila sampel terakhir sudah lama),
 * disimpan 14 hari. Sengaja ringan: tanpa memindai folder berkas.
 */
import { cpus, freemem, loadavg, totalmem } from "node:os";
import { statfs } from "node:fs/promises";

import { execute, executeOne } from "@/integrations/mysql/pool";

const KEEP_DAYS = 14;
export const SAMPLE_EVERY_MS = 5 * 60_000;
let lastSampleAt = 0;

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function recordMetricsSample(force = false): Promise<boolean> {
  if (!force && Date.now() - lastSampleAt < SAMPLE_EVERY_MS - 10_000) return false;
  lastSampleAt = Date.now();
  const memPct = ((totalmem() - freemem()) / totalmem()) * 100;
  const cpuPct = (loadavg()[0] / Math.max(1, cpus().length)) * 100;
  let diskPct = 0;
  try {
    const fs = await statfs("/");
    const total = fs.blocks * fs.bsize;
    diskPct = total ? ((total - fs.bavail * fs.bsize) / total) * 100 : 0;
  } catch {
    // statfs tidak tersedia (mis. Windows dev) — biarkan 0.
  }
  const t0 = performance.now();
  await executeOne("SELECT 1 AS ok");
  const ping = performance.now() - t0;
  const conn = await executeOne<{ Value: string }>(
    "SHOW GLOBAL STATUS WHERE Variable_name = 'Threads_connected'",
  ).catch(() => null);
  const size = await executeOne<{ b: number }>(
    "SELECT COALESCE(SUM(DATA_LENGTH + INDEX_LENGTH), 0) AS b FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
  ).catch(() => null);
  // Server render (VPS terpisah) melaporkan metriknya sendiri; ambil bila laporan masih segar (< 10 menit).
  const rw = await executeOne<{ m: unknown; info: unknown; age: number | null }>(
    `SELECT worker_metrics AS m, worker_info AS info,
            TIMESTAMPDIFF(SECOND, worker_seen_at, NOW(6)) AS age
       FROM ai_studio_settings WHERE id = 'platform'`,
  ).catch(() => null);
  let renderCpu: number | null = null;
  let renderMem: number | null = null;
  if (rw?.m && rw.age != null && Number(rw.age) < 600) {
    try {
      const parse = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
      const m = parse(rw.m) as { load?: number[]; mem?: { total: number; free: number } };
      const info = (parse(rw.info) ?? {}) as { cpus?: number };
      if (m.load?.length) renderCpu = round1((m.load[0] / Math.max(1, info.cpus ?? 1)) * 100);
      if (m.mem?.total) renderMem = round1(((m.mem.total - m.mem.free) / m.mem.total) * 100);
    } catch {
      // metrik rusak — lewati
    }
  }
  await execute(
    `INSERT INTO system_metrics (sampled_at, mem_pct, cpu_pct, disk_pct, rss_bytes, db_ping_ms, db_connections, db_size_bytes, render_cpu_pct, render_mem_pct)
     VALUES (UTC_TIMESTAMP(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      round1(memPct),
      round1(Math.min(cpuPct, 9999)),
      round1(diskPct),
      process.memoryUsage().rss,
      round1(ping),
      Number(conn?.Value ?? 0),
      Number(size?.b ?? 0),
      renderCpu,
      renderMem,
    ],
  );
  await execute("DELETE FROM system_metrics WHERE sampled_at < UTC_TIMESTAMP() - INTERVAL ? DAY", [
    KEEP_DAYS,
  ]);
  return true;
}

export interface MetricPoint {
  t: string;
  mem: number;
  cpu: number;
  disk: number;
  rss: number;
  ping: number;
  conn: number;
  dbSize: number;
  renderCpu: number | null;
  renderMem: number | null;
}

/** Riwayat untuk grafik; 7 hari dirata-rata per jam agar ringan. */
export async function metricsHistory(range: "24h" | "7d"): Promise<MetricPoint[]> {
  const hours = range === "24h" ? 24 : 24 * 7;
  const bucket = range === "24h" ? "%Y-%m-%d %H:%i" : "%Y-%m-%d %H:00";
  const rows = await execute<Record<string, string | number | null>>(
    `SELECT DATE_FORMAT(MIN(sampled_at), '%Y-%m-%dT%H:%i:00Z') AS t,
            AVG(mem_pct) AS mem, AVG(cpu_pct) AS cpu, MAX(disk_pct) AS disk, AVG(rss_bytes) AS rss,
            AVG(db_ping_ms) AS ping, MAX(db_connections) AS conn, MAX(db_size_bytes) AS dbSize,
            AVG(render_cpu_pct) AS renderCpu, AVG(render_mem_pct) AS renderMem
       FROM system_metrics
      WHERE sampled_at >= UTC_TIMESTAMP() - INTERVAL ? HOUR
      GROUP BY DATE_FORMAT(sampled_at, ?)
      ORDER BY t`,
    [hours, bucket],
  );
  const n = (v: unknown) => round1(Number(v ?? 0));
  return rows.map((r) => ({
    t: String(r.t),
    mem: n(r.mem),
    cpu: n(r.cpu),
    disk: n(r.disk),
    rss: Number(r.rss ?? 0),
    ping: n(r.ping),
    conn: Number(r.conn ?? 0),
    dbSize: Number(r.dbSize ?? 0),
    renderCpu: r.renderCpu == null ? null : n(r.renderCpu),
    renderMem: r.renderMem == null ? null : n(r.renderMem),
  }));
}
