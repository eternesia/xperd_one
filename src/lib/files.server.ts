/**
 * #51 (BS New 3): penyimpanan berkas workspace di disk lokal.
 *
 * Old tidak punya object storage seperti Supabase Storage; berkas disimpan pada
 * volume `local-storage` (dipasang di `/app/storage` pada image produksi — lihat
 * `docker-compose.prod.yml`). Bentuk `file_path` di database = path relatif
 * terhadap root tersebut, mis. `crm/tender-library/<uuid>-nib.pdf`.
 *
 * Hanya boleh diimpor dari kode server.
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";

/** Root penyimpanan; bisa ditimpa lewat `STORAGE_DIR` (mis. saat dev). */
export function storageRoot(): string {
  return process.env.STORAGE_DIR ?? (process.env.NODE_ENV === "production" ? "/app/storage" : resolve(process.cwd(), "storage"));
}

/** Membersihkan satu segmen path agar tidak bisa keluar dari root. */
function safeSegment(value: string, fallback: string): string {
  const cleaned = value
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.replace(/[^\w.\-]+/g, "_").replace(/^\.+$/, ""))
    .filter(Boolean)
    .join("-");
  return cleaned.slice(0, 120) || fallback;
}

/** Menyusun path relatif untuk berkas baru (folder `<module>/<section>`). */
export function buildFilePath(folder: string, fileName: string, id: string): string {
  const parts = folder
    .split("/")
    .filter(Boolean)
    .map((part) => safeSegment(part, "files"));
  return [...parts, `${id}-${safeSegment(fileName, "file")}`].join("/");
}

/** Path absolut dari path relatif, dijamin berada di dalam root. */
function absolutePath(relPath: string): string {
  const root = storageRoot();
  const target = resolve(root, normalize(relPath).replace(/^([/\\])+/, ""));
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error("Path berkas tidak valid");
  }
  return target;
}

/*
 * Lapisan object storage (#R2): bila Super Admin menyalakan "Simpan berkas di R2",
 * unggahan baru ditulis ke bucket media dengan key = path relatif. Pembacaan selalu
 * mencoba disk lokal dulu lalu bucket, sehingga berkas lama tetap terbaca selama /
 * sesudah dipindahkan, dan mematikan sakelar tidak membuat berkas di R2 hilang.
 */
type MediaStore = {
  cfg: import("./object-storage.server").StorageConfig;
  bucket: string;
};
let storeCache: { at: number; value: MediaStore | null } | null = null;

/** Konfigurasi bucket media (cache 30 detik). `null` = object storage belum diatur. */
async function mediaStore(): Promise<MediaStore | null> {
  if (storeCache && Date.now() - storeCache.at < 30_000) return storeCache.value;
  const { loadStorageConfig } = await import("./object-storage.server");
  const cfg = await loadStorageConfig().catch(() => null);
  const value = cfg?.bucket ? { cfg, bucket: cfg.bucket } : null;
  storeCache = { at: Date.now(), value };
  return value;
}

/** Dipanggil setelah pengaturan penyimpanan diubah. */
export function resetMediaStoreCache() {
  storeCache = null;
}

/** Key objek = path relatif yang sudah dinormalkan (tanpa `..`). */
function objectKey(relPath: string): string {
  const abs = absolutePath(relPath);
  return abs
    .slice(storageRoot().length + 1)
    .split(sep)
    .join("/");
}

export async function saveWorkspaceFile(relPath: string, bytes: Buffer): Promise<void> {
  const target = absolutePath(relPath);
  const store = await mediaStore();
  if (store?.cfg.mediaOnR2) {
    const { putBytes } = await import("./object-storage.server");
    await putBytes(store.cfg, store.bucket, objectKey(relPath), bytes, mimeFromPath(relPath));
    return;
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

export async function readWorkspaceFile(relPath: string): Promise<Buffer> {
  try {
    return await readFile(absolutePath(relPath));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const store = await mediaStore();
    if (!store) throw e;
    const { getObject } = await import("./object-storage.server");
    const bytes = await getObject(store.cfg, store.bucket, objectKey(relPath));
    if (!bytes) throw e;
    return bytes;
  }
}

export async function deleteWorkspaceFile(relPath: string): Promise<void> {
  try {
    await unlink(absolutePath(relPath));
  } catch {
    // Berkas memang sudah tidak ada — tidak perlu menggagalkan aksi pengguna.
  }
  try {
    const store = await mediaStore();
    if (store) {
      const { deleteObject } = await import("./object-storage.server");
      await deleteObject(store.cfg, store.bucket, objectKey(relPath));
    }
  } catch {
    // Objek tidak ada / bucket tidak terjangkau — catatan di DB tetap dihapus.
  }
}

/** URI absolut (dipakai saat menempel gambar ke dokumen HTML/PDF). */
export function workspaceFileUrl(relPath: string): string {
  return `/api/workspace-files?path=${encodeURIComponent(relPath)}`;
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
  txt: "text/plain",
};

/** Perkiraan MIME dari ekstensi berkas. */
export function mimeFromPath(relPath: string): string {
  const ext = relPath.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** Menyaring jenis berkas yang boleh diunggah (dokumen & gambar). */
export const ALLOWED_UPLOAD_EXT = Object.keys(MIME_BY_EXT).filter((e) => !["mp4", "mov", "webm", "mp3", "m4a", "wav"].includes(e));

/** Batas ukuran berkas (20 MB — sama dengan BS New 3). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Pustaka Media Qalling (gambar/video untuk postingan). */
export const MEDIA_FOLDER = "crm/media";
/** Rekaman narasi untuk video Template Studio AI (bukan bagian pustaka Media). */
export const NARRATION_FOLDER = "ai/narration";
export const NARRATION_EXT = ["mp3", "m4a", "wav"];
export const NARRATION_MAX_BYTES = 10 * 1024 * 1024;
/** Batas keras unggahan Media; batas sebenarnya diatur Super Admin (`media_upload_settings`). */
export const MEDIA_MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const MEDIA_UPLOAD_EXT = ["png", "jpg", "jpeg", "webp", "gif", "mp4", "mov", "webm"];
