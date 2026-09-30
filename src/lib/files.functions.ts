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

export const uploadWorkspaceFile = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: UploadFileInput) => {
    if (!data?.workspaceId || !data.fileName || !data.dataUrl) throw new Error("Missing file");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ path: string; size: number }> => {
    const { canWriteWorkspace } = await import("@/lib/auth-context.server");
    if (!(await canWriteWorkspace(data.workspaceId, context.userId))) throw new Error("Forbidden");

    const { buildFilePath, saveWorkspaceFile, ALLOWED_UPLOAD_EXT, MAX_UPLOAD_BYTES } = await import("@/lib/files.server");

    const ext = data.fileName.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_UPLOAD_EXT.includes(ext)) throw new Error(`Jenis berkas .${ext} tidak diizinkan`);

    const bytes = parseDataUrl(data.dataUrl);
    if (bytes.length > MAX_UPLOAD_BYTES) {
      throw new Error(`Ukuran berkas melebihi ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`);
    }

    const { uuid } = await import("@/integrations/mysql/pool");
    const path = buildFilePath(data.folder, data.fileName, uuid());
    await saveWorkspaceFile(path, bytes);
    return { path, size: bytes.length };
  });

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
