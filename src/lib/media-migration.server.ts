/**
 * Pemindahan berkas lama dari disk server ke bucket media (R2) — server-only.
 *
 * Berjalan di latar belakang dalam proses aplikasi; progres disimpan di
 * `platform_storage_settings.media_migration` agar tampil di Super Admin.
 * Aman diulang: objek yang sudah ada dengan ukuran sama dilewati. Salinan lokal
 * hanya dihapus bila diminta dan setelah ukuran di bucket terverifikasi.
 */
import { readdir, stat, unlink } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { execute, executeOne } from "@/integrations/mysql/pool";
import { mimeFromPath, storageRoot } from "@/lib/files.server";

/** Folder di root penyimpanan yang bukan berkas pengguna. */
const SKIP_DIRS = new Set(["_backups", ".chunk-uploads"]);

export interface MediaMigrationState {
  status: "idle" | "running" | "done" | "failed" | "interrupted";
  deleteLocal: boolean;
  total: number;
  totalBytes: number;
  done: number;
  doneBytes: number;
  skipped: number;
  failed: number;
  freedBytes: number;
  lastError: string | null;
  current: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
}

const EMPTY: MediaMigrationState = {
  status: "idle",
  deleteLocal: false,
  total: 0,
  totalBytes: 0,
  done: 0,
  doneBytes: 0,
  skipped: 0,
  failed: 0,
  freedBytes: 0,
  lastError: null,
  current: null,
  startedAt: null,
  updatedAt: null,
  finishedAt: null,
};

let running = false;

async function saveState(s: MediaMigrationState) {
  s.updatedAt = new Date().toISOString();
  await execute("UPDATE platform_storage_settings SET media_migration = ? WHERE singleton = 1", [
    JSON.stringify(s),
  ]);
}

export async function getMediaMigrationState(): Promise<MediaMigrationState> {
  const r = await executeOne<{ media_migration: unknown }>(
    "SELECT media_migration FROM platform_storage_settings WHERE singleton = 1",
  ).catch(() => null);
  const raw = r?.media_migration;
  const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as MediaMigrationState | null;
  const s = { ...EMPTY, ...(parsed ?? {}) };
  // Proses aplikasi dimulai ulang di tengah jalan (deploy) → tandai terputus.
  if (s.status === "running" && !running) s.status = "interrupted";
  return s;
}

/** Daftar berkas pengguna di disk (path relatif + ukuran). */
async function listLocalFiles() {
  const root = storageRoot();
  const out: { rel: string; full: string; size: number }[] = [];
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (dir === root && SKIP_DIRS.has(e.name)) continue;
        await walk(full);
      } else if (e.isFile()) {
        const st = await stat(full).catch(() => null);
        if (st) out.push({ rel: relative(root, full).split(sep).join("/"), full, size: st.size });
      }
    }
  }
  await walk(root);
  return out;
}

/** Ringkasan berkas yang masih di disk (untuk tampilan sebelum memindahkan). */
export async function localFilesSummary() {
  const files = await listLocalFiles();
  return { count: files.length, bytes: files.reduce((a, f) => a + f.size, 0) };
}

/** Mulai pemindahan di latar belakang. Mengembalikan state awal. */
export async function startMediaMigration(deleteLocal: boolean): Promise<MediaMigrationState> {
  if (running) throw new Error("Pemindahan sedang berjalan");
  const { loadStorageConfig } = await import("@/lib/object-storage.server");
  const cfg = await loadStorageConfig();
  if (!cfg?.bucket) throw new Error("Object storage belum diatur");
  const { headBucket } = await import("@/lib/object-storage.server");
  await headBucket(cfg, cfg.bucket);

  const files = await listLocalFiles();
  const state: MediaMigrationState = {
    ...EMPTY,
    status: "running",
    deleteLocal,
    total: files.length,
    totalBytes: files.reduce((a, f) => a + f.size, 0),
    startedAt: new Date().toISOString(),
  };
  running = true;
  await saveState(state);
  void run(files, state, cfg).finally(() => {
    running = false;
  });
  return state;
}

async function run(
  files: { rel: string; full: string; size: number }[],
  state: MediaMigrationState,
  cfg: import("@/lib/object-storage.server").StorageConfig,
) {
  const { headObject, putFile } = await import("@/lib/object-storage.server");
  let lastSave = Date.now();
  try {
    for (const f of files) {
      state.current = f.rel;
      try {
        const existing = await headObject(cfg, cfg.bucket, f.rel);
        if (existing === f.size) {
          state.skipped += 1;
        } else {
          await putFile(cfg, cfg.bucket, f.rel, f.full, mimeFromPath(f.rel));
          const size = await headObject(cfg, cfg.bucket, f.rel);
          if (size !== f.size) throw new Error("ukuran di bucket tidak cocok");
        }
        state.done += 1;
        state.doneBytes += f.size;
        if (state.deleteLocal) {
          await unlink(f.full);
          state.freedBytes += f.size;
        }
      } catch (e) {
        state.failed += 1;
        state.lastError = `${f.rel}: ${(e as Error).message}`.slice(0, 300);
      }
      if (Date.now() - lastSave > 3000) {
        await saveState(state).catch(() => {});
        lastSave = Date.now();
      }
    }
    state.status = state.failed ? "failed" : "done";
  } catch (e) {
    state.status = "failed";
    state.lastError = (e as Error).message.slice(0, 300);
  }
  state.current = null;
  state.finishedAt = new Date().toISOString();
  await saveState(state).catch(() => {});
}
