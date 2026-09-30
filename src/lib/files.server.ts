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

export async function saveWorkspaceFile(relPath: string, bytes: Buffer): Promise<void> {
  const target = absolutePath(relPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

export async function readWorkspaceFile(relPath: string): Promise<Buffer> {
  return readFile(absolutePath(relPath));
}

export async function deleteWorkspaceFile(relPath: string): Promise<void> {
  try {
    await unlink(absolutePath(relPath));
  } catch {
    // Berkas memang sudah tidak ada — tidak perlu menggagalkan aksi pengguna.
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
export const ALLOWED_UPLOAD_EXT = Object.keys(MIME_BY_EXT);

/** Batas ukuran berkas (20 MB — sama dengan BS New 3). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
