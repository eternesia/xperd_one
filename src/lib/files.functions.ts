/**
 * #51 (BS New 3): server fn unggah/hapus berkas workspace.
 *
 * Berkas dikirim dari browser sebagai data URL (base64) lalu ditulis ke disk
 * oleh `lib/files.server.ts`. Pengunduhan memakai rute
 * `/api/workspace-files?path=...` yang memeriksa cookie sesi.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export interface UploadFileInput {
  workspaceId: string;
  /** folder relatif di dalam storage, mis. `crm/tender-library`. */
  folder: string;
  fileName: string;
  dataUrl: string;
}

function parseDataUrl(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) throw new Error("Format berkas tidak dikenali");
  const base64 = dataUrl.slice(comma + 1);
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) throw new Error("Berkas kosong");
  return buffer;
}

/** Validasi + simpan berkas unggahan yang sudah utuh (dipakai unggahan sekali kirim dan berpotongan). */
async function saveUploadedBytes(
  userId: string,
  input: { workspaceId: string; folder: string; fileName: string },
  bytes: Buffer,
): Promise<{ path: string; size: number }> {
  const { canWriteWorkspace } = await import("@/lib/auth-context.server");
  if (!(await canWriteWorkspace(input.workspaceId, userId))) throw new Error("Forbidden");

  const {
    buildFilePath,
    saveWorkspaceFile,
    ALLOWED_UPLOAD_EXT,
    MAX_UPLOAD_BYTES,
    MEDIA_FOLDER,
    MEDIA_MAX_UPLOAD_BYTES,
    MEDIA_UPLOAD_EXT,
    NARRATION_EXT,
    NARRATION_FOLDER,
    NARRATION_MAX_BYTES,
  } = await import("@/lib/files.server");
  const isMedia = input.folder === MEDIA_FOLDER;
  const isNarration = input.folder === NARRATION_FOLDER;

  const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  const allowed = isNarration ? NARRATION_EXT : isMedia ? MEDIA_UPLOAD_EXT : ALLOWED_UPLOAD_EXT;
  if (!allowed.includes(ext)) throw new Error(`Jenis berkas .${ext} tidak diizinkan`);

  const maxBytes = isNarration
    ? NARRATION_MAX_BYTES
    : isMedia
      ? MEDIA_MAX_UPLOAD_BYTES
      : MAX_UPLOAD_BYTES;
  if (bytes.length > maxBytes) {
    throw new Error(`Ukuran berkas melebihi ${Math.round(maxBytes / 1024 / 1024)} MB`);
  }

  const { uuid } = await import("@/integrations/mysql/pool");
  const path = buildFilePath(input.folder, input.fileName, uuid());
  await saveWorkspaceFile(path, bytes);
  return { path, size: bytes.length };
}

export const uploadWorkspaceFile = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: UploadFileInput) => {
    if (!data?.workspaceId || !data.fileName || !data.dataUrl) throw new Error("Missing file");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ path: string; size: number }> => {
    return saveUploadedBytes(context.userId, data, parseDataUrl(data.dataUrl));
  });

/**
 * Unggah berpotongan: proxy di depan aplikasi (nginx) sering membatasi body ±1 MB, sedangkan data URL base64
 * membengkak 33%, sehingga gambar >±750 KB ditolak (413) sebelum sampai ke aplikasi. Klien memecah berkas menjadi
 * potongan kecil; potongan terakhir merakit dan menyimpannya lewat jalur validasi yang sama.
 */
export interface UploadChunkInput {
  workspaceId: string;
  folder: string;
  fileName: string;
  uploadId: string;
  index: number;
  total: number;
  /** Isi potongan, base64 tanpa awalan data URL. */
  chunk: string;
}
const CHUNK_MAX_B64 = 700_000;
const CHUNK_MAX_COUNT = 400;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uploadWorkspaceFileChunk = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: UploadChunkInput) => {
    if (!d?.workspaceId || !d.folder || !d.fileName || typeof d.chunk !== "string")
      throw new Error("Missing file");
    if (!UUID_RE.test(d.uploadId)) throw new Error("uploadId tidak valid");
    if (
      !Number.isInteger(d.index) ||
      !Number.isInteger(d.total) ||
      d.total < 1 ||
      d.total > CHUNK_MAX_COUNT ||
      d.index < 0 ||
      d.index >= d.total
    )
      throw new Error("Potongan tidak valid");
    if (!d.chunk || d.chunk.length > CHUNK_MAX_B64) throw new Error("Potongan terlalu besar");
    return d;
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ done: false } | { done: true; path: string; size: number }> => {
      const { canWriteWorkspace } = await import("@/lib/auth-context.server");
      if (!(await canWriteWorkspace(data.workspaceId, context.userId)))
        throw new Error("Forbidden");
      const fs = await import("node:fs/promises");
      const { storageRoot } = await import("@/lib/files.server");
      const nodePath = await import("node:path");
      const root = nodePath.join(storageRoot(), ".chunk-uploads");
      const dir = nodePath.join(
        root,
        `${context.userId.replace(/[^0-9a-zA-Z-]/g, "")}-${data.uploadId}`,
      );
      await fs.mkdir(dir, { recursive: true });
      if (data.index === 0) {
        // Bersihkan sisa unggahan yang terbengkalai (>1 jam).
        for (const name of await fs.readdir(root).catch(() => [] as string[])) {
          const st = await fs.stat(nodePath.join(root, name)).catch(() => null);
          if (st && Date.now() - st.mtimeMs > 3_600_000)
            await fs
              .rm(nodePath.join(root, name), { recursive: true, force: true })
              .catch(() => undefined);
        }
      }
      await fs.writeFile(nodePath.join(dir, String(data.index)), Buffer.from(data.chunk, "base64"));
      if (data.index < data.total - 1) return { done: false };
      try {
        const parts: Buffer[] = [];
        for (let i = 0; i < data.total; i++) {
          try {
            parts.push(await fs.readFile(nodePath.join(dir, String(i))));
          } catch {
            throw new Error("Unggahan belum lengkap, silakan ulangi");
          }
        }
        const bytes = Buffer.concat(parts);
        if (!bytes.length) throw new Error("Berkas kosong");
        const saved = await saveUploadedBytes(context.userId, data, bytes);
        return { done: true, ...saved };
      } finally {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  );

export const deleteWorkspaceFile = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: { workspaceId: string; path: string }) => {
    if (!data?.workspaceId || !data.path) throw new Error("Missing file path");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { canWriteWorkspace } = await import("@/lib/auth-context.server");
    if (!(await canWriteWorkspace(data.workspaceId, context.userId))) throw new Error("Forbidden");
    const { deleteWorkspaceFile: remove } = await import("@/lib/files.server");
    await remove(data.path);
    return { ok: true };
  });
