// Media untuk tool posting Qalling (BS New 17): media_ids dari pustaka workspace + impor media_urls dari CDN yang diizinkan.
// Berkas masuk ke pustaka privat workspace (crm_media) dengan kebijakan unggah & kuota; kegagalan membersihkan impor.
import { ToolError } from "./framework";
import { validateMediaFile, type MediaUploadPolicy } from "../media-upload-policy";
import { remoteMediaUrl } from "./qalling-rules";

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime", "video/webm"];

export async function downloadMedia(url: string, policy: MediaUploadPolicy) {
  let response: Response;
  try {
    response = await fetch(remoteMediaUrl(url), { redirect: "error", signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new ToolError(e instanceof Error && /^Use a supported/.test(e.message) ? e.message : "Media could not be downloaded.");
  }
  if (!response.ok || !response.body) throw new ToolError("Media could not be downloaded.");
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!TYPES.includes(type)) throw new ToolError("Unsupported media format.");
  const max = (type.startsWith("image/") ? policy.photo_mb : policy.video_mb) * 1048576;
  const length = Number(response.headers.get("content-length"));
  if (length > max) {
    await response.body.cancel();
    throw new ToolError("Media exceeds the configured upload limit.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new ToolError("Media exceeds the configured upload limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (!size) throw new ToolError("Media file is empty.");
  try {
    validateMediaFile({ type, size }, policy);
  } catch (e) {
    throw new ToolError((e as Error).message);
  }
  return { bytes: Buffer.concat(chunks.map((c) => Buffer.from(c))), type, size };
}

export interface ResolvedMedia {
  id: string;
  file_path: string;
  mime_type: string;
}

export async function resolveMedia(workspaceId: string, userId: string, ids: string[], urls: string[]) {
  const { execute, uuid } = await import("@/integrations/mysql/pool");
  const uniqueIds = [...new Set(ids)];
  const existing = uniqueIds.length
    ? await execute<ResolvedMedia>(
        `SELECT id, file_path, mime_type FROM crm_media WHERE workspace_id = ? AND id IN (${uniqueIds.map(() => "?").join(",")})`,
        [workspaceId, ...uniqueIds],
      )
    : [];
  if (existing.length !== uniqueIds.length) throw new ToolError("Media not found in this workspace.");
  const byId = new Map(existing.map((m) => [m.id, m]));
  const media: ResolvedMedia[] = uniqueIds.map((id) => byId.get(id)!);
  const imported: { id: string; path: string }[] = [];
  const { deleteWorkspaceFile } = await import("@/lib/files.server");
  const cleanup = async () => {
    for (const m of imported.splice(0)) {
      await execute("DELETE FROM crm_media WHERE workspace_id = ? AND id = ?", [workspaceId, m.id]).catch(() => undefined);
      await deleteWorkspaceFile(m.path).catch(() => undefined);
    }
  };
  try {
    if (urls.length) {
      try {
        urls.forEach(remoteMediaUrl);
      } catch (e) {
        throw new ToolError((e as Error).message);
      }
      const { loadMediaPolicy } = await import("@/lib/media-policy.server");
      const { saveWorkspaceFile, buildFilePath, MEDIA_FOLDER } = await import("@/lib/files.server");
      const { assertMediaQuota } = await import("@/lib/qalling-quota.server");
      const policy = await loadMediaPolicy();
      for (const url of urls) {
        const { bytes, type, size } = await downloadMedia(url, policy);
        try {
          await assertMediaQuota(workspaceId, { size_bytes: size, mime_type: type });
        } catch {
          throw new ToolError("Media upload failed; check workspace storage quota.");
        }
        const ext = type === "image/jpeg" ? "jpg" : type === "video/quicktime" ? "mov" : type.split("/")[1];
        const id = uuid();
        const name = `mcp-${id}.${ext}`;
        const path = buildFilePath(`${MEDIA_FOLDER}/${workspaceId}`, name, id);
        await saveWorkspaceFile(path, bytes);
        try {
          await execute(
            "INSERT INTO crm_media (id, workspace_id, name, file_path, mime_type, size_bytes, created_by) VALUES (?,?,?,?,?,?,?)",
            [id, workspaceId, name, path, type, size, userId],
          );
        } catch {
          await deleteWorkspaceFile(path).catch(() => undefined);
          throw new ToolError("Media could not be saved; check upload limits and workspace quota.");
        }
        imported.push({ id, path });
        media.push({ id, file_path: path, mime_type: type });
      }
    }
    return { media, cleanup };
  } catch (e) {
    await cleanup();
    throw e;
  }
}
