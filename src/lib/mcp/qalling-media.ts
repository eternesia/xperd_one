// Media untuk tool posting Qalling (BS New 17): media_ids dari pustaka workspace + impor media_urls dari CDN yang diizinkan.
// Berkas masuk ke pustaka privat workspace (crm_media) dengan kebijakan unggah & kuota; kegagalan membersihkan impor.
import { z } from "zod/v4";
import { ToolError } from "./framework";
import { validateMediaFile, type MediaUploadPolicy } from "../media-upload-policy";
import { remoteMediaUrl } from "./qalling-rules";

export const MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

/** Kenali tipe dari byte awal (unduhan berkas ChatGPT sering bertipe application/octet-stream). */
export function sniffMediaType(b: Buffer): string | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (
    b.length > 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (
    b.length > 12 &&
    b.subarray(0, 4).toString() === "RIFF" &&
    b.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  if (b.length > 6 && b.subarray(0, 3).toString() === "GIF") return "image/gif";
  if (b.length > 12 && b.subarray(4, 8).toString() === "ftyp")
    return b.subarray(8, 12).toString() === "qt  " ? "video/quicktime" : "video/mp4";
  if (b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3)
    return "video/webm";
  return null;
}

/** Host unduhan berkas ChatGPT (lampiran & gambar hasil generate). Hanya milik OpenAI. */
const CHAT_FILE_HOSTS = ["oaiusercontent.com", "openai.com", "chatgpt.com", "oaistatic.com"];
export function chatFileUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ToolError(
      "files[].download_url must be the temporary download URL ChatGPT provides for an attached file, not a file id.",
    );
  }
  const h = url.hostname.toLowerCase();
  const ok =
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    (!url.port || url.port === "443") &&
    (CHAT_FILE_HOSTS.some((d) => h === d || h.endsWith(`.${d}`)) ||
      /^oai[a-z0-9-]*\.blob\.core\.windows\.net$/.test(h));
  if (!ok) {
    console.warn("[mcp] chat file host rejected:", h);
    throw new ToolError(
      `ChatGPT file host not accepted (${h}). Please report this host to Qalling support.`,
    );
  }
  return url.href;
}

/** Unduh dengan mengikuti maks. 3 redirect; setiap hop diperiksa ulang host-nya. */
async function fetchChecked(url: string, check: (u: string) => string) {
  let current = check(url);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel().catch(() => undefined);
      current = check(new URL(res.headers.get("location")!, current).href);
      continue;
    }
    return res;
  }
  throw new ToolError("Too many redirects while downloading media.");
}

export async function downloadMedia(
  url: string,
  policy: MediaUploadPolicy,
  opts: { sniff?: boolean; chatFile?: boolean } = {},
) {
  let response: Response;
  try {
    response = opts.chatFile
      ? await fetchChecked(url, chatFileUrl)
      : await fetch(remoteMediaUrl(url), {
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        });
  } catch (e) {
    if (e instanceof ToolError) throw e;
    throw new ToolError(
      e instanceof Error && /^Use a supported/.test(e.message)
        ? e.message
        : "Media could not be downloaded.",
    );
  }
  if (!response.ok || !response.body) throw new ToolError("Media could not be downloaded.");
  let type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!MEDIA_TYPES.includes(type)) {
    if (!opts.sniff) throw new ToolError("Unsupported media format.");
    type = ""; // ditentukan dari isi berkas setelah diunduh
  }
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
  const bytes = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  if (!type) {
    const sniffed = sniffMediaType(bytes);
    if (!sniffed) throw new ToolError("Unsupported media format.");
    type = sniffed;
    if (size > (type.startsWith("image/") ? policy.photo_mb : policy.video_mb) * 1048576)
      throw new ToolError("Media exceeds the configured upload limit.");
  }
  try {
    validateMediaFile({ type, size }, policy);
  } catch (e) {
    throw new ToolError((e as Error).message);
  }
  return { bytes, type, size };
}

export interface ResolvedMedia {
  id: string;
  file_path: string;
  mime_type: string;
}

/** Simpan satu berkas ke pustaka media workspace (kuota + kebijakan unggah dicek); mengembalikan baris yang tersimpan. */
export async function storeMedia(
  workspaceId: string,
  userId: string,
  bytes: Buffer,
  type: string,
  name?: string,
): Promise<{ id: string; path: string; mime_type: string; size_bytes: number }> {
  const { execute, uuid } = await import("@/integrations/mysql/pool");
  const { saveWorkspaceFile, buildFilePath, deleteWorkspaceFile, MEDIA_FOLDER } =
    await import("@/lib/files.server");
  const { assertMediaQuota } = await import("@/lib/qalling-quota.server");
  const size = bytes.length;
  try {
    await assertMediaQuota(workspaceId, { size_bytes: size, mime_type: type });
  } catch {
    throw new ToolError("Media upload failed; check workspace storage quota.");
  }
  const ext =
    type === "image/jpeg" ? "jpg" : type === "video/quicktime" ? "mov" : type.split("/")[1];
  const id = uuid();
  const fileName = `mcp-${id}.${ext}`;
  const path = buildFilePath(`${MEDIA_FOLDER}/${workspaceId}`, fileName, id);
  await saveWorkspaceFile(path, bytes);
  try {
    await execute(
      "INSERT INTO crm_media (id, workspace_id, name, file_path, mime_type, size_bytes, created_by) VALUES (?,?,?,?,?,?,?)",
      [id, workspaceId, name?.trim() || fileName, path, type, size, userId],
    );
  } catch {
    await deleteWorkspaceFile(path).catch(() => undefined);
    throw new ToolError("Media could not be saved; check upload limits and workspace quota.");
  }
  return { id, path, mime_type: type, size_bytes: size };
}

export async function resolveMedia(
  workspaceId: string,
  userId: string,
  ids: string[],
  urls: string[],
) {
  const { execute, uuid } = await import("@/integrations/mysql/pool");
  const uniqueIds = [...new Set(ids)];
  const existing = uniqueIds.length
    ? await execute<ResolvedMedia>(
        `SELECT id, file_path, mime_type FROM crm_media WHERE workspace_id = ? AND id IN (${uniqueIds.map(() => "?").join(",")})`,
        [workspaceId, ...uniqueIds],
      )
    : [];
  if (existing.length !== uniqueIds.length)
    throw new ToolError("Media not found in this workspace.");
  const byId = new Map(existing.map((m) => [m.id, m]));
  const media: ResolvedMedia[] = uniqueIds.map((id) => byId.get(id)!);
  const imported: { id: string; path: string }[] = [];
  const { deleteWorkspaceFile } = await import("@/lib/files.server");
  const cleanup = async () => {
    for (const m of imported.splice(0)) {
      await execute("DELETE FROM crm_media WHERE workspace_id = ? AND id = ?", [
        workspaceId,
        m.id,
      ]).catch(() => undefined);
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
      const policy = await loadMediaPolicy();
      for (const url of urls) {
        const { bytes, type } = await downloadMedia(url, policy);
        const stored = await storeMedia(workspaceId, userId, bytes, type);
        const { id, path } = stored;
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

/** Parameter `files` untuk ChatGPT: berkas yang dilampirkan/dihasilkan di percakapan dikirim sebagai tautan unduhan sementara. */
export const chatFilesSchema = z
  .array(
    z.object({
      download_url: z.string().url().describe("Temporary download URL of the attached file."),
      file_id: z.string().optional(),
      name: z.string().max(120).optional(),
    }),
  )
  .max(10);
export const CHAT_FILE_META = { "openai/fileParams": ["files"] };

/** Unduh berkas ChatGPT satu per satu ke pustaka workspace; mengembalikan id media berurutan. */
export async function importChatFiles(
  workspaceId: string,
  userId: string,
  files: z.infer<typeof chatFilesSchema>,
  name?: string,
) {
  const { loadMediaPolicy } = await import("@/lib/media-policy.server");
  const policy = await loadMediaPolicy();
  const items: { media_id: string; mime_type: string; size_bytes: number; name?: string }[] = [];
  for (const f of files) {
    try {
      chatFileUrl(f.download_url);
    } catch (e) {
      throw new ToolError(
        `${(e as Error).message}${items.length ? ` (${items.length} file(s) were already saved: ${items.map((i) => i.media_id).join(", ")})` : ""}`,
      );
    }
    const dl = await downloadMedia(f.download_url, policy, { sniff: true, chatFile: true });
    const row = await storeMedia(workspaceId, userId, dl.bytes, dl.type, f.name ?? name);
    items.push({
      media_id: row.id,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      name: f.name,
    });
  }
  return items;
}
