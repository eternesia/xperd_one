import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";

const MAX_BYTES = 50 * 1024 * 1024;

export default defineTool({
  name: "qalling_create_idea",
  title: "Create content idea",
  description:
    "Add a content idea card to the Qalling Ideas board (first column, usually Todo). Optionally pass public https image/video URLs (e.g. AI-generated images); they are downloaded into the workspace Media library and listed on the card.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    title: z.string().min(1).max(150).describe("Idea title."),
    body: z.string().max(5000).optional().describe("Idea details, draft caption or notes."),
    media_urls: z
      .array(z.string().url())
      .max(5)
      .optional()
      .describe("Public https URLs of images or videos to save (max 50 MB each)."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async ({ workspace_id, title, body, media_urls }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "ideas_campaigns", true);
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const { saveWorkspaceFile, deleteWorkspaceFile, buildFilePath, MEDIA_FOLDER } =
      await import("@/lib/files.server");
    const { assertMediaQuota } = await import("@/lib/qalling-quota.server");

    let columnId = (
      await executeOne<{ id: string }>(
        "SELECT id FROM crm_idea_columns WHERE workspace_id = ? ORDER BY position LIMIT 1",
        [workspace_id],
      )
    )?.id;
    if (!columnId) {
      const ids = [uuid(), uuid(), uuid()];
      for (const [i, name] of ["Todo", "Progress", "Done"].entries())
        await execute(
          "INSERT INTO crm_idea_columns (id, workspace_id, name, position) VALUES (?, ?, ?, ?)",
          [ids[i], workspace_id, name, i],
        );
      columnId = ids[0];
    }
    const saved: string[] = [];
    for (const url of media_urls ?? []) {
      if (!url.startsWith("https://")) throw new ToolError(`Only https URLs are allowed: ${url}`);
      const res = await fetch(url);
      if (!res.ok) throw new ToolError(`Could not download ${url} (${res.status}).`);
      const type = (res.headers.get("content-type") || "").split(";")[0];
      if (!/^(image|video)\//.test(type)) throw new ToolError(`${url} is not an image or video.`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) throw new ToolError(`${url} is larger than 50 MB.`);
      try {
        await assertMediaQuota(workspace_id, { size_bytes: buf.byteLength, mime_type: type });
      } catch {
        throw new ToolError("Storage quota of this plan is full.");
      }
      const ext = type.split("/")[1].replace(/[^a-z0-9]/g, "") || "bin";
      const mediaId = uuid();
      const name = `ai-${mediaId}.${ext}`;
      const path = buildFilePath(`${MEDIA_FOLDER}/${workspace_id}`, name, mediaId);
      await saveWorkspaceFile(path, buf);
      try {
        await execute(
          "INSERT INTO crm_media (id, workspace_id, name, file_path, mime_type, size_bytes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [mediaId, workspace_id, name, path, type, buf.byteLength, userId],
        );
      } catch (e) {
        await deleteWorkspaceFile(path).catch(() => undefined);
        throw new ToolError((e as Error).message);
      }
      saved.push(name);
    }
    const fullBody = [body ?? "", saved.length ? `Media: ${saved.join(", ")}` : ""]
      .filter(Boolean)
      .join("\n\n");
    const id = uuid();
    await execute(
      "INSERT INTO crm_ideas (id, workspace_id, column_id, title, body) VALUES (?, ?, ?, ?, ?)",
      [id, workspace_id, columnId, title, fullBody],
    );
    const result = {
      id,
      media_saved: saved,
      message: "Idea added to Qalling → Ideas (Todo). Media is in Qalling → Media.",
    };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
