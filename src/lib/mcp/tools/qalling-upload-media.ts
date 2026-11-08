import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingSection, getTokenUser, requireAuth } from "../db";
import {
  CHAT_FILE_META,
  MEDIA_TYPES,
  chatFilesSchema,
  downloadMedia,
  importChatFiles,
  storeMedia,
} from "../qalling-media";
import { remoteMediaUrl } from "../qalling-rules";
import { validateMediaFile } from "../../media-upload-policy";

export default defineTool({
  name: "qalling_upload_media",
  title: "Upload media to library",
  description:
    "Upload images/videos attached in ChatGPT with files (each item has download_url), or one image/video into the private Qalling workspace media library and return its media_id for qalling_create_post media_ids. Provide either url (HTTPS on supported OpenAI/Google Storage/Cloudinary/Unsplash/Replicate/Fal CDNs) or file_base64 with mime_type (use this for generated files that have no public URL). Call once per carousel slide; configured size limits and plan quotas apply.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace ID from list_workspaces."),
    url: z
      .string()
      .url()
      .optional()
      .describe("HTTPS media URL on a supported CDN. Omit when sending file_base64."),
    file_base64: z
      .string()
      .max(28_000_000)
      .optional()
      .describe("Raw base64 file bytes (no data: prefix). Omit when sending url."),
    mime_type: z
      .enum(MEDIA_TYPES as unknown as [string, ...string[]])
      .optional()
      .describe("Required with file_base64."),
    name: z.string().max(120).optional().describe("Optional file name shown in the library."),
    files: chatFilesSchema
      .optional()
      .describe(
        "Files attached or generated in the ChatGPT conversation (up to 10, e.g. carousel slides). Returns media_ids in order.",
      ),
  },
  meta: CHAT_FILE_META,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async ({ workspace_id, url, file_base64, mime_type, name, files }, ctx) => {
    requireAuth(ctx);
    if (files?.length) {
      if (url || file_base64) throw new ToolError("Use files alone, without url or file_base64.");
      const { userId } = await getTokenUser(ctx);
      await assertQallingSection(workspace_id, userId, "media", true);
      const items = await importChatFiles(workspace_id, userId, files, name);
      const result = {
        media_ids: items.map((i) => i.media_id),
        items,
        message: "Uploaded to Qalling media library; pass media_ids in qalling_create_post.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }
    if (!!url === !!file_base64)
      throw new ToolError("Provide exactly one of files, url or file_base64.");
    const { userId } = await getTokenUser(ctx);
    await assertQallingSection(workspace_id, userId, "media", true);
    const { loadMediaPolicy } = await import("@/lib/media-policy.server");
    const policy = await loadMediaPolicy();
    let bytes: Buffer;
    let type: string;
    if (url) {
      try {
        remoteMediaUrl(url);
      } catch (e) {
        throw new ToolError((e as Error).message);
      }
      ({ bytes, type } = await downloadMedia(url, policy));
    } else {
      if (!mime_type) throw new ToolError("mime_type is required with file_base64.");
      const raw = file_base64!.replace(/^data:[^,]*,/, "").replace(/\s/g, "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw))
        throw new ToolError("file_base64 is not valid base64.");
      bytes = Buffer.from(raw, "base64");
      type = mime_type;
      if (!bytes.length) throw new ToolError("Media file is empty.");
      try {
        validateMediaFile({ type, size: bytes.length }, policy);
      } catch {
        throw new ToolError("Media exceeds the configured upload limit or format.");
      }
    }
    const row = await storeMedia(workspace_id, userId, bytes, type, name);
    const result = {
      media_id: row.id,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      message: "Uploaded to Qalling media library; pass media_id in qalling_create_post media_ids.",
    };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
