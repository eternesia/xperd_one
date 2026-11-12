/**
 * Superadmin — Kesehatan Sistem (server-only).
 * Metrik server diambil dari mesin tempat aplikasi berjalan; metrik database lewat koneksi MySQL,
 * jadi tetap benar bila nanti database dipindah ke server terpisah.
 */
import { cpus, freemem, hostname, loadavg, platform, release, totalmem, uptime } from "node:os";
import { readdir, stat, statfs } from "node:fs/promises";
import { join } from "node:path";

import { execute, executeOne } from "@/integrations/mysql/pool";
import { storageRoot } from "@/lib/files.server";

const STARTED_AT = new Date().toISOString();

export interface DiskInfo {
  path: string;
  total: number;
  free: number;
  used: number;
  pct: number;
}

async function disk(path: string): Promise<DiskInfo | null> {
  try {
    const s = await statfs(path);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    const used = total - free;
    return { path, total, free, used, pct: total ? Math.round((used / total) * 1000) / 10 : 0 };
  } catch {
    return null;
  }
}

/** Ukuran folder (rekursif) dengan batas jumlah entri agar tidak membebani server. */
async function folderSize(
  dir: string,
  budget: { left: number },
): Promise<{ bytes: number; files: number; partial: boolean }> {
  let bytes = 0;
  let files = 0;
  let partial = false;
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return { bytes, files, partial };
  }
  for (const e of entries) {
    if (budget.left-- <= 0) return { bytes, files, partial: true };
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const sub = await folderSize(p, budget);
      bytes += sub.bytes;
      files += sub.files;
      partial ||= sub.partial;
    } else if (e.isFile()) {
      try {
        bytes += (await stat(p)).size;
        files += 1;
      } catch {
        /* berkas hilang saat dihitung */
      }
    }
  }
  return { bytes, files, partial };
}

let storageCache: { at: number; data: Awaited<ReturnType<typeof scanStorage>> } | null = null;

async function scanStorage() {
  const root = storageRoot();
  const budget = { left: 200_000 };
  const folders: { name: string; bytes: number; files: number }[] = [];
  let partial = false;
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return { root, exists: false, total: 0, files: 0, folders, partial };
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === "_backups") continue;
    const r = await folderSize(join(root, e.name), budget);
    folders.push({ name: e.name, bytes: r.bytes, files: r.files });
    partial ||= r.partial;
  }
  folders.sort((a, b) => b.bytes - a.bytes);
  return {
    root,
    exists: true,
    total: folders.reduce((s, f) => s + f.bytes, 0),
    files: folders.reduce((s, f) => s + f.files, 0),
    folders,
    partial,
  };
}

/** Pemindaian folder disimpan 10 menit (bisa dipaksa ulang). */
async function storageUsage(force: boolean) {
  if (!force && storageCache && Date.now() - storageCache.at < 10 * 60_000)
    return { ...storageCache.data, cachedAt: storageCache.at };
  const data = await scanStorage();
  storageCache = { at: Date.now(), data };
  return { ...data, cachedAt: storageCache.at };
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function collectSystemHealth(opts: { rescanStorage?: boolean } = {}) {
  /* ---------- server aplikasi ---------- */
  const cpuList = cpus();
  const mem = { total: totalmem(), free: freemem() };
  const pm = process.memoryUsage();
  const [rootDisk, storageDisk] = await Promise.all([disk("/"), disk(storageRoot())]);
  const server = {
    hostname: hostname(),
    platform: `${platform()} ${release()}`,
    node: process.version,
    cpuCount: cpuList.length,
    cpuModel: cpuList[0]?.model ?? "",
    load: loadavg().map((x) => Math.round(x * 100) / 100),
    uptimeSec: Math.round(uptime()),
    processUptimeSec: Math.round(process.uptime()),
    startedAt: STARTED_AT,
    mem: {
      ...mem,
      used: mem.total - mem.free,
      pct: Math.round(((mem.total - mem.free) / mem.total) * 1000) / 10,
    },
    process: { rss: pm.rss, heapUsed: pm.heapUsed, heapTotal: pm.heapTotal },
    // Folder berkas di disk yang sama dengan sistem (umum di Docker) cukup ditampilkan sekali.
    disks: [
      rootDisk,
      storageDisk &&
      !(rootDisk && rootDisk.total === storageDisk.total && rootDisk.free === storageDisk.free)
        ? storageDisk
        : null,
    ].filter(Boolean) as DiskInfo[],
    env: process.env.NODE_ENV ?? "development",
    version: process.env.APP_VERSION || process.env.GIT_SHA || process.env.IMAGE_TAG || null,
    schedulerDisabled:
      process.env.SCHEDULER_DISABLED === "1" || process.env.SCHEDULER_DISABLED === "true",
  };

  /* ---------- database ---------- */
  const t0 = performance.now();
  await executeOne("SELECT 1 AS ok");
  const pingMs = Math.round((performance.now() - t0) * 10) / 10;
  const status = await safe(
    () =>
      execute<{ Variable_name: string; Value: string }>(
        "SHOW GLOBAL STATUS WHERE Variable_name IN ('Uptime','Threads_connected','Threads_running','Max_used_connections','Slow_queries','Questions','Aborted_connects')",
      ),
    [],
  );
  const vars = await safe(
    () =>
      execute<{ Variable_name: string; Value: string }>(
        "SHOW GLOBAL VARIABLES WHERE Variable_name IN ('max_connections','version','innodb_buffer_pool_size','long_query_time')",
      ),
    [],
  );
  const st = Object.fromEntries(status.map((r) => [r.Variable_name, r.Value]));
  const vr = Object.fromEntries(vars.map((r) => [r.Variable_name, r.Value]));
  const tables = await safe(
    () =>
      execute<{ name: string; rows_est: number; data_bytes: number; index_bytes: number }>(
        `SELECT TABLE_NAME AS name, TABLE_ROWS AS rows_est, DATA_LENGTH AS data_bytes, INDEX_LENGTH AS index_bytes
           FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
          ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC`,
      ),
    [],
  );
  const lastMigration = await safe(
    () =>
      executeOne<{ name: string; applied_at: string }>(
        "SELECT name, applied_at FROM db_apply_log ORDER BY applied_at DESC, name DESC LIMIT 1",
      ),
    null,
  );
  const counts = await safe(
    () =>
      executeOne<{ tenants: number; workspaces: number; users: number }>(
        `SELECT (SELECT COUNT(*) FROM tenants) AS tenants, (SELECT COUNT(*) FROM workspaces) AS workspaces,
                (SELECT COUNT(*) FROM app_users) AS users`,
      ),
    null,
  );
  const dbSize = tables.reduce((s, t) => s + Number(t.data_bytes) + Number(t.index_bytes), 0);
  const database = {
    pingMs,
    version: vr.version ?? null,
    uptimeSec: Number(st.Uptime ?? 0),
    threadsConnected: Number(st.Threads_connected ?? 0),
    threadsRunning: Number(st.Threads_running ?? 0),
    maxUsedConnections: Number(st.Max_used_connections ?? 0),
    maxConnections: Number(vr.max_connections ?? 0),
    slowQueries: Number(st.Slow_queries ?? 0),
    questions: Number(st.Questions ?? 0),
    bufferPoolBytes: Number(vr.innodb_buffer_pool_size ?? 0),
    host: process.env.MYSQL_HOST || "127.0.0.1",
    sizeBytes: dbSize,
    tableCount: tables.length,
    topTables: tables.slice(0, 15).map((t) => ({
      name: t.name,
      rows: Number(t.rows_est ?? 0),
      bytes: Number(t.data_bytes) + Number(t.index_bytes),
    })),
    lastMigration: lastMigration
      ? { name: lastMigration.name, appliedAt: String(lastMigration.applied_at) }
      : null,
    counts: counts
      ? {
          tenants: Number(counts.tenants),
          workspaces: Number(counts.workspaces),
          users: Number(counts.users),
        }
      : null,
  };

  /* ---------- penyimpanan berkas ---------- */
  const files = await storageUsage(Boolean(opts.rescanStorage));
  // Berkas yang tercatat di database per tenant (media Qalling, dokumen proyek, dokumen produksi).
  const perTenant = await safe(
    () =>
      execute<{ tenant: string; bytes: number; files: number }>(
        `SELECT COALESCE(t.name, '(tanpa tenant)') AS tenant, SUM(x.bytes) AS bytes, SUM(x.n) AS files
           FROM (
             SELECT workspace_id, SUM(size_bytes) AS bytes, COUNT(*) AS n FROM crm_media GROUP BY workspace_id
             UNION ALL
             SELECT workspace_id, SUM(COALESCE(file_size, 0)), COUNT(*) FROM prj_documents GROUP BY workspace_id
             UNION ALL
             SELECT workspace_id, SUM(size_bytes), COUNT(*) FROM mfg_document_links GROUP BY workspace_id
           ) x
           LEFT JOIN workspaces w ON w.id = x.workspace_id
           LEFT JOIN tenants t ON t.id = w.tenant_id
          GROUP BY t.name ORDER BY bytes DESC LIMIT 10`,
      ),
    [],
  );
  const objectStorage = await safe(
    () =>
      executeOne<{ provider: string | null; bucket: string | null }>(
        "SELECT provider, bucket FROM platform_storage_settings LIMIT 1",
      ),
    null,
  );
  const emailGateway = await safe(
    () =>
      executeOne<{ enabled: number; provider: string }>(
        "SELECT enabled, provider FROM email_gateway_settings WHERE scope_key = 'platform' LIMIT 1",
      ),
    null,
  );
  const storage = {
    ...files,
    perTenant: perTenant.map((r) => ({
      tenant: r.tenant,
      bytes: Number(r.bytes ?? 0),
      files: Number(r.files ?? 0),
    })),
    objectStorageConfigured: Boolean(objectStorage?.bucket),
    objectStorageProvider: objectStorage?.provider ?? null,
  };

  /* ---------- backup ---------- */
  const lastBackup = await safe(
    () =>
      executeOne<{ finished_at: string; status: string; size_bytes: number; target: string }>(
        "SELECT finished_at, status, size_bytes, target FROM system_backups WHERE kind = 'db' AND status = 'success' ORDER BY finished_at DESC LIMIT 1",
      ),
    null,
  );
  const lastFilesBackup = await safe(
    () =>
      executeOne<{ finished_at: string }>(
        "SELECT finished_at FROM system_backups WHERE kind = 'files' AND status = 'success' ORDER BY finished_at DESC LIMIT 1",
      ),
    null,
  );
  const lastFailed = await safe(
    () =>
      executeOne<{ kind: string; detail: string | null; started_at: string }>(
        `SELECT kind, detail, started_at FROM system_backups WHERE status = 'failed'
          AND started_at > UTC_TIMESTAMP() - INTERVAL 2 DAY ORDER BY started_at DESC LIMIT 1`,
      ),
    null,
  );

  /* ---------- server render video (Studio AI) ---------- */
  const rw = await safe(
    () =>
      executeOne<{
        enabled: number;
        template_enabled: number;
        has_token: number;
        seen_at: string | null;
        age_sec: number | null;
        info: string | null;
        metrics: unknown;
      }>(
        `SELECT enabled, template_enabled, worker_token_hash IS NOT NULL AS has_token,
                worker_seen_at AS seen_at, TIMESTAMPDIFF(SECOND, worker_seen_at, NOW(6)) AS age_sec,
                worker_info AS info, worker_metrics AS metrics
           FROM ai_studio_settings WHERE id = 'platform'`,
      ),
    null,
  );
  const rq = await safe(
    () =>
      executeOne<{
        queued: number | null;
        processing: number | null;
        done24: number | null;
        failed24: number | null;
        avg_sec: number | null;
        oldest_min: number | null;
      }>(
        `SELECT SUM(status = 'queued') AS queued,
                SUM(status IN ('processing','saving')) AS processing,
                SUM(status = 'done' AND finished_at > NOW(6) - INTERVAL 1 DAY) AS done24,
                SUM(status = 'failed' AND updated_at > NOW(6) - INTERVAL 1 DAY) AS failed24,
                AVG(CASE WHEN status = 'done' AND finished_at > NOW(6) - INTERVAL 7 DAY AND claimed_at IS NOT NULL
                         THEN TIMESTAMPDIFF(SECOND, claimed_at, finished_at) END) AS avg_sec,
                TIMESTAMPDIFF(MINUTE, MIN(CASE WHEN status = 'queued' THEN created_at END), NOW(6)) AS oldest_min
           FROM ai_jobs WHERE provider = 'render'`,
      ),
    null,
  );
  type RenderMetrics = {
    load?: number[];
    mem?: { total: number; free: number };
    disk?: { total: number; free: number } | null;
    uptimeSec?: number;
    workerUptimeSec?: number;
    node?: string;
    rendered?: number;
    failed?: number;
    lastRenderMs?: number | null;
  };
  let rMetrics: RenderMetrics | null = null;
  try {
    rMetrics = rw?.metrics
      ? ((typeof rw.metrics === "string" ? JSON.parse(rw.metrics) : rw.metrics) as RenderMetrics)
      : null;
  } catch {
    rMetrics = null;
  }
  const age = rw?.age_sec === null || rw?.age_sec === undefined ? null : Number(rw.age_sec);
  const processing = Number(rq?.processing ?? 0);
  const renderState: "never" | "online" | "rendering" | "offline" = !rw?.seen_at
    ? "never"
    : age !== null && age <= 90
      ? "online"
      : processing > 0 && age !== null && age <= 15 * 60
        ? "rendering"
        : "offline";
  const pctOf = (x?: { total: number; free: number } | null) =>
    x?.total ? Math.round(((x.total - x.free) / x.total) * 1000) / 10 : null;
  const render = rw
    ? {
        configured: Boolean(Number(rw.has_token)) || Boolean(rw.seen_at),
        enabled: Boolean(Number(rw.enabled)) && Boolean(Number(rw.template_enabled)),
        state: renderState,
        seenAt: rw.seen_at ? String(rw.seen_at) : null,
        ageSec: age,
        info: rw.info,
        metrics: rMetrics
          ? { ...rMetrics, memPct: pctOf(rMetrics.mem), diskPct: pctOf(rMetrics.disk) }
          : null,
        queue: {
          queued: Number(rq?.queued ?? 0),
          processing,
          done24: Number(rq?.done24 ?? 0),
          failed24: Number(rq?.failed24 ?? 0),
          avgSec:
            rq?.avg_sec === null || rq?.avg_sec === undefined
              ? null
              : Math.round(Number(rq.avg_sec)),
          oldestQueuedMin:
            rq?.oldest_min === null || rq?.oldest_min === undefined ? null : Number(rq.oldest_min),
        },
      }
    : null;

  /* ---------- peringatan ---------- */
  type Level = "critical" | "warning" | "info";
  const alerts: { level: Level; title: string; detail: string }[] = [];
  for (const d of server.disks) {
    if (d.pct >= 90)
      alerts.push({
        level: "critical",
        title: `Disk ${d.path} hampir penuh (${d.pct}%)`,
        detail: "Hapus berkas lama, perbesar disk, atau pindahkan unggahan ke object storage.",
      });
    else if (d.pct >= 80)
      alerts.push({
        level: "warning",
        title: `Disk ${d.path} ${d.pct}% terpakai`,
        detail: "Rencanakan penambahan kapasitas sebelum mencapai 90%.",
      });
  }
  if (server.mem.pct >= 92)
    alerts.push({
      level: "warning",
      title: `RAM server ${server.mem.pct}% terpakai`,
      detail: "Periksa proses yang boros memori atau tambah RAM.",
    });
  if (server.load[0] > server.cpuCount * 1.5)
    alerts.push({
      level: "warning",
      title: "Beban CPU tinggi",
      detail: `Load 1 menit ${server.load[0]} untuk ${server.cpuCount} inti.`,
    });
  if (database.maxConnections && database.threadsConnected / database.maxConnections >= 0.8)
    alerts.push({
      level: "critical",
      title: "Koneksi database hampir habis",
      detail: `${database.threadsConnected} dari ${database.maxConnections} koneksi terpakai.`,
    });
  if (database.pingMs > 200)
    alerts.push({
      level: "warning",
      title: `Database lambat merespons (${database.pingMs} ms)`,
      detail: "Periksa beban server database atau jaringan antar-server.",
    });
  if (!lastBackup)
    alerts.push({
      level: "critical",
      title: "Belum ada backup otomatis",
      detail:
        "Database dan berkas hanya ada di satu server. Aktifkan backup harian ke lokasi lain (mis. R2/S3).",
    });
  else if (
    Date.now() - Date.parse(String(lastBackup.finished_at).replace(" ", "T") + "Z") >
    36 * 3600_000
  )
    alerts.push({
      level: "critical",
      title: "Backup terakhir lebih dari 36 jam lalu",
      detail: "Periksa tugas backup.",
    });
  if (lastFailed)
    alerts.push({
      level: "warning",
      title: `Backup ${lastFailed.kind === "db" ? "database" : "berkas"} gagal`,
      detail: lastFailed.detail ?? "Lihat riwayat backup.",
    });
  if (lastBackup)
    alerts.push({
      level: "info",
      title: "Backup tersimpan di server yang sama",
      detail:
        "Unduh backup terbaru secara rutin dan simpan di komputer/drive lain agar aman bila server rusak.",
    });
  if (render?.configured) {
    if ((render.state === "offline" || render.state === "never") && render.queue.queued > 0)
      alerts.push({
        level: "critical",
        title: `Server render video tidak aktif, ${render.queue.queued} video antre`,
        detail:
          "Periksa VPS render (docker logs -f qalling-render). Antre > 20 menit akan gagal dan kredit dikembalikan.",
      });
    else if (render.state === "offline" && render.enabled)
      alerts.push({
        level: "warning",
        title: "Server render video tidak melapor",
        detail: `Terakhir aktif ${render.ageSec !== null ? Math.round(render.ageSec / 60) : "?"} menit lalu.`,
      });
    if (render.queue.failed24 >= 3)
      alerts.push({
        level: "warning",
        title: `${render.queue.failed24} video gagal dirender dalam 24 jam`,
        detail: "Lihat Studio AI → riwayat pekerjaan.",
      });
    if (render.metrics?.diskPct != null && render.metrics.diskPct >= 85)
      alerts.push({
        level: "warning",
        title: `Disk server render ${render.metrics.diskPct}% terpakai`,
        detail: "Bersihkan image Docker lama: docker image prune.",
      });
  }
  if (!storage.objectStorageConfigured)
    alerts.push({
      level: "info",
      title: "Unggahan berkas masih di disk server",
      detail: "Object storage (R2/S3) belum dipakai; berkas ikut hilang bila server rusak.",
    });
  else
    alerts.push({
      level: "info",
      title: "Object storage sudah diatur, tetapi unggahan masih ke disk lokal",
      detail: "Kode unggahan belum memakai R2/S3; berkas baru tetap disimpan di server.",
    });
  if (server.schedulerDisabled)
    alerts.push({
      level: "warning",
      title: "Penjadwal (scheduler) dimatikan",
      detail: "Pengingat, email otomatis, dan posting terjadwal tidak berjalan di server ini.",
    });
  if (!emailGateway?.enabled)
    alerts.push({
      level: "warning",
      title: "Gateway email platform tidak aktif",
      detail: "Email OTP, pengingat, dan pemberitahuan tidak terkirim.",
    });

  const order: Record<Level, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);

  return {
    checkedAt: new Date().toISOString(),
    server,
    database,
    storage,
    backup: lastBackup
      ? {
          finishedAt: String(lastBackup.finished_at),
          status: lastBackup.status,
          sizeBytes: Number(lastBackup.size_bytes ?? 0),
          target: lastBackup.target,
          filesFinishedAt: lastFilesBackup ? String(lastFilesBackup.finished_at) : null,
        }
      : null,
    render,
    alerts,
  };
}

export type SystemHealth = Awaited<ReturnType<typeof collectSystemHealth>>;
