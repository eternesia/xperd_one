/**
 * Backup otomatis (server-only).
 *  - Database: dump SQL logis (DROP/CREATE + INSERT per 200 baris) lewat koneksi MySQL aplikasi,
 *    dikompres gzip. Tidak butuh mysqldump di kontainer dan tetap jalan bila DB di server lain.
 *    Pulihkan: gunzip -c db-*.sql.gz | mysql -u USER -p NAMA_DB
 *  - Berkas: arsip .tar.gz folder penyimpanan (tanpa _backups). Pulihkan: tar -xzf files-*.tar.gz -C /app/storage
 * File disimpan di <STORAGE_DIR>/_backups; riwayat di tabel system_backups.
 * Jadwal (scheduler per jam): DB tiap hari ≥ 02.00 WIB (simpan 14), berkas tiap 7 hari (simpan 4).
 */
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat, statfs } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { once } from "node:events";
import { createGzip } from "node:zlib";
import type { Writable } from "node:stream";
import { escape, escapeId } from "mysql2";

import { execute, executeOne, query, uuid } from "@/integrations/mysql/pool";
import { storageRoot } from "@/lib/files.server";

export const BACKUP_FOLDER = "_backups";
const KEEP = { db: 14, files: 4 } as const;
export type BackupKind = keyof typeof KEEP;

export function backupDir() {
  return join(storageRoot(), BACKUP_FOLDER);
}

const stamp = () => {
  const d = new Date(Date.now() + 7 * 3600_000); // WIB
  return d.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
};

async function write(out: Writable, chunk: string | Buffer) {
  if (!out.write(chunk)) await once(out, "drain");
}

async function finish(out: Writable, gz: NodeJS.WritableStream, file: Writable) {
  out.end();
  await once(file, "finish");
  void gz;
}

/* ------------------------------ database ------------------------------ */

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (Buffer.isBuffer(v)) return v.length ? `X'${v.toString("hex")}'` : "''";
  if (typeof v === "object") return escape(JSON.stringify(v)); // kolom JSON di-parse mysql2
  if (typeof v === "boolean") return v ? "1" : "0";
  return escape(v as string | number);
}

async function dumpDatabase(path: string) {
  const file = createWriteStream(path);
  const gz = createGzip({ level: 6 });
  gz.pipe(file);
  const db = (await executeOne<{ d: string }>("SELECT DATABASE() AS d"))?.d ?? "";
  await write(
    gz,
    `-- XPERD One backup database \`${db}\` · ${new Date().toISOString()}\n` +
      "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\nSET UNIQUE_CHECKS = 0;\nSET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n\n",
  );
  const tables = await execute<{ name: string; type: string }>(
    `SELECT TABLE_NAME AS name, TABLE_TYPE AS type FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_TYPE, TABLE_NAME`,
  );
  let rowsTotal = 0;
  for (const t of tables.filter((x) => x.type === "BASE TABLE")) {
    const create = await executeOne<Record<string, string>>(
      `SHOW CREATE TABLE ${escapeId(t.name)}`,
    );
    await write(gz, `DROP TABLE IF EXISTS ${escapeId(t.name)};\n${create?.["Create Table"]};\n`);
    // Kolom virtual/stored generated tidak di-INSERT. (DEFAULT_GENERATED = default ekspresi, mis. uuid()/CURRENT_TIMESTAMP — tetap disalin.)
    const cols = (
      await execute<{ c: string }>(
        `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND EXTRA NOT LIKE '%VIRTUAL GENERATED%' AND EXTRA NOT LIKE '%STORED GENERATED%'
          ORDER BY ORDINAL_POSITION`,
        [t.name],
      )
    ).map((r) => r.c);
    const pk = (
      await execute<{ c: string }>(
        `SELECT COLUMN_NAME AS c FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
          ORDER BY ORDINAL_POSITION`,
        [t.name],
      )
    ).map((r) => r.c);
    const colList = cols.map((c) => escapeId(c)).join(", ");
    const order = pk.length ? ` ORDER BY ${pk.map((c) => escapeId(c)).join(", ")}` : "";
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      // Protokol teks (query): nilai tanggal/desimal tiba sebagai teks persis seperti di database.
      const rows = await query<Record<string, unknown>>(
        `SELECT ${colList} FROM ${escapeId(t.name)}${order} LIMIT ${PAGE} OFFSET ${offset}`,
      );
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const values = batch
          .map((r) => `(${cols.map((c) => sqlValue(r[c])).join(",")})`)
          .join(",\n");
        await write(gz, `INSERT INTO ${escapeId(t.name)} (${colList}) VALUES\n${values};\n`);
      }
      rowsTotal += rows.length;
      if (rows.length < PAGE) break;
    }
    await write(gz, "\n");
  }
  for (const v of tables.filter((x) => x.type === "VIEW")) {
    const create = await executeOne<Record<string, string>>(`SHOW CREATE VIEW ${escapeId(v.name)}`);
    await write(gz, `DROP VIEW IF EXISTS ${escapeId(v.name)};\n${create?.["Create View"]};\n\n`);
  }
  await write(gz, "SET FOREIGN_KEY_CHECKS = 1;\nSET UNIQUE_CHECKS = 1;\n");
  await finish(gz, gz, file);
  return `${tables.length} tabel, ${rowsTotal.toLocaleString("id-ID")} baris`;
}

/* ------------------------------ berkas (tar.gz) ------------------------------ */

function octal(n: number, len: number) {
  return n.toString(8).padStart(len - 1, "0") + "\0";
}

function tarHeader(name: string, size: number, mtime: number, type: "0" | "5" | "x") {
  const h = Buffer.alloc(512);
  h.write(name.slice(0, 100), 0, "utf8");
  h.write(octal(type === "5" ? 0o755 : 0o644, 8), 100);
  h.write(octal(0, 8), 108);
  h.write(octal(0, 8), 116);
  h.write(octal(size, 12), 124);
  h.write(octal(Math.floor(mtime / 1000), 12), 136);
  h.write("        ", 148); // checksum diisi spasi dulu
  h.write(type, 156);
  h.write("ustar\0", 257);
  h.write("00", 263);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(octal(sum, 7) + " ", 148);
  return h;
}

/** Header PAX untuk nama berkas > 100 byte. */
function paxHeader(name: string, mtime: number) {
  const rec = (k: string, v: string) => {
    const body = ` ${k}=${v}\n`;
    let len = Buffer.byteLength(body) + 1;
    len += String(len).length - 1;
    while (String(len).length + Buffer.byteLength(body) !== len) len += 1;
    return `${len}${body}`;
  };
  const data = Buffer.from(rec("path", name));
  return Buffer.concat([
    tarHeader("PaxHeader", data.length, mtime, "x"),
    data,
    Buffer.alloc((512 - (data.length % 512)) % 512),
  ]);
}

async function archiveFiles(path: string) {
  const root = storageRoot();
  const file = createWriteStream(path);
  const gz = createGzip({ level: 6 });
  gz.pipe(file);
  let count = 0;
  let bytes = 0;
  const walk = async (dir: string) => {
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      const rel = relative(root, full).split(sep).join("/");
      if (rel === BACKUP_FOLDER || rel.startsWith(`${BACKUP_FOLDER}/`)) continue;
      if (e.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!e.isFile()) continue;
      let st;
      try {
        st = await stat(full);
      } catch {
        continue;
      }
      if (Buffer.byteLength(rel) > 100) await write(gz, paxHeader(rel, st.mtimeMs));
      await write(gz, tarHeader(rel, st.size, st.mtimeMs, "0"));
      let written = 0;
      for await (const chunk of createReadStream(full)) {
        // Berkas bisa berubah saat dibaca; patuhi ukuran yang tertulis di header.
        const c = chunk as Buffer;
        const take = c.subarray(0, Math.max(0, st.size - written));
        if (take.length) await write(gz, take);
        written += take.length;
        if (written >= st.size) break;
      }
      if (written < st.size) await write(gz, Buffer.alloc(st.size - written));
      const pad = (512 - (st.size % 512)) % 512;
      if (pad) await write(gz, Buffer.alloc(pad));
      count += 1;
      bytes += st.size;
    }
  };
  await walk(root);
  await write(gz, Buffer.alloc(1024)); // penutup arsip
  await finish(gz, gz, file);
  return { count, bytes };
}

/* ------------------------------ jalankan & kelola ------------------------------ */

export async function runBackup(kind: BackupKind, triggeredBy: string | null) {
  const running = await executeOne<{ id: string }>(
    "SELECT id FROM system_backups WHERE kind = ? AND status = 'running' AND started_at > UTC_TIMESTAMP() - INTERVAL 2 HOUR LIMIT 1",
    [kind],
  );
  if (running) throw new Error("Backup jenis ini sedang berjalan.");
  await mkdir(backupDir(), { recursive: true });
  const id = uuid();
  const fileName = kind === "db" ? `db-${stamp()}.sql.gz` : `files-${stamp()}.tar.gz`;
  const path = join(backupDir(), fileName);
  await execute(
    "INSERT INTO system_backups (id, kind, status, file_name, target, triggered_by, started_at) VALUES (?, ?, 'running', ?, 'server', ?, UTC_TIMESTAMP(6))",
    [id, kind, fileName, triggeredBy],
  );
  try {
    let detail: string;
    if (kind === "files") {
      // Pastikan ruang disk cukup (perkiraan: ukuran berkas + 1 GB cadangan).
      const fs = await statfs(storageRoot());
      const free = fs.bavail * fs.bsize;
      const { scanBytes } = await estimateStorage();
      if (free < scanBytes + 1024 ** 3)
        throw new Error("Ruang disk tidak cukup untuk arsip berkas.");
      const r = await archiveFiles(path);
      detail = `${r.count.toLocaleString("id-ID")} berkas`;
    } else {
      detail = await dumpDatabase(path);
    }
    const size = (await stat(path)).size;
    await execute(
      "UPDATE system_backups SET status = 'success', size_bytes = ?, detail = ?, finished_at = UTC_TIMESTAMP(6) WHERE id = ?",
      [size, detail, id],
    );
    await prune(kind);
    return { id, fileName, size, detail };
  } catch (e) {
    await rm(path, { force: true }).catch(() => {});
    await execute(
      "UPDATE system_backups SET status = 'failed', detail = ?, finished_at = UTC_TIMESTAMP(6) WHERE id = ?",
      [String(e instanceof Error ? e.message : e).slice(0, 1000), id],
    );
    throw e;
  }
}

async function estimateStorage() {
  let bytes = 0;
  const walk = async (dir: string) => {
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (dir === storageRoot() && e.name === BACKUP_FOLDER) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) bytes += (await stat(p).catch(() => ({ size: 0 }))).size;
    }
  };
  await walk(storageRoot());
  return { scanBytes: bytes };
}

/** Hapus backup lama di luar jumlah simpanan. */
async function prune(kind: BackupKind) {
  const old = await execute<{ id: string; file_name: string | null }>(
    `SELECT id, file_name FROM system_backups WHERE kind = ? AND status = 'success'
      ORDER BY started_at DESC LIMIT 1000 OFFSET ${KEEP[kind]}`,
    [kind],
  );
  for (const b of old) await deleteBackup(b.id);
  // Riwayat gagal lebih dari 30 hari dibuang.
  await execute(
    "DELETE FROM system_backups WHERE status = 'failed' AND started_at < UTC_TIMESTAMP() - INTERVAL 30 DAY",
  );
}

export async function deleteBackup(id: string) {
  const b = await executeOne<{ file_name: string | null }>(
    "SELECT file_name FROM system_backups WHERE id = ?",
    [id],
  );
  if (!b) return;
  if (b.file_name && !b.file_name.includes("/") && !b.file_name.includes("..")) {
    await rm(join(backupDir(), b.file_name), { force: true });
  }
  await execute("DELETE FROM system_backups WHERE id = ?", [id]);
}

export async function backupFilePath(id: string) {
  const b = await executeOne<{ file_name: string | null; status: string }>(
    "SELECT file_name, status FROM system_backups WHERE id = ?",
    [id],
  );
  if (
    !b?.file_name ||
    b.status !== "success" ||
    b.file_name.includes("/") ||
    b.file_name.includes("..")
  )
    return null;
  return { path: join(backupDir(), b.file_name), fileName: b.file_name };
}

export async function listBackups() {
  const rows = await execute<{
    id: string;
    kind: BackupKind;
    status: string;
    file_name: string | null;
    size_bytes: number;
    detail: string | null;
    started_at: string;
    finished_at: string | null;
  }>(
    `SELECT id, kind, status, file_name, size_bytes, detail, started_at, finished_at
       FROM system_backups ORDER BY started_at DESC LIMIT 40`,
  );
  return rows.map((r) => ({ ...r, size_bytes: Number(r.size_bytes ?? 0) }));
}

/** Dipanggil scheduler tiap jam: DB harian ≥ 02.00 WIB, berkas tiap 7 hari. */
export async function runScheduledBackups() {
  const wib = new Date(Date.now() + 7 * 3600_000);
  if (wib.getUTCHours() < 2) return { db: false, files: false };
  const today = wib.toISOString().slice(0, 10);
  const lastDb = await executeOne<{ d: string }>(
    `SELECT DATE(started_at + INTERVAL 7 HOUR) AS d FROM system_backups
      WHERE kind = 'db' AND status IN ('success','running') ORDER BY started_at DESC LIMIT 1`,
  );
  const out = { db: false, files: false };
  if (!lastDb || String(lastDb.d).slice(0, 10) < today) {
    await runBackup("db", null).catch((e) => console.error("[backup] db failed", e));
    out.db = true;
  }
  const lastFiles = await executeOne<{ ok: number }>(
    `SELECT COUNT(*) AS ok FROM system_backups
      WHERE kind = 'files' AND status IN ('success','running') AND started_at > UTC_TIMESTAMP() - INTERVAL 7 DAY`,
  );
  if (!Number(lastFiles?.ok ?? 0)) {
    await runBackup("files", null).catch((e) => console.error("[backup] files failed", e));
    out.files = true;
  }
  return out;
}
