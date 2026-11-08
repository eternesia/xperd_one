import { defineTool } from "../framework";
import { z } from "zod/v4";
import { assertQallingSection, getTokenUser, requireAuth } from "../db";

export default defineTool({
  name: "qalling_create_upload_link",
  title: "Create media upload link",
  description:
    "Create a 30-minute upload link for files that live on your own computer (Claude Code or any agent with a terminal). Run the returned curl command once per file; each call responds with a media_id for qalling_create_post media_ids. The file bytes never pass through the model, so this suits large images and videos. NOT for ChatGPT: its sandbox has no internet access, so curl to this link always fails. In ChatGPT use the files parameter of qalling_create_post or qalling_upload_media instead.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace ID from list_workspaces."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ workspace_id }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingSection(workspace_id, userId, "media", true);
    const { signUploadToken, uploadOrigin } = await import("@/lib/mcp-upload.server");
    const token = signUploadToken(workspace_id, userId);
    const upload_url = `${uploadOrigin()}/api/public/mcp-upload?token=${encodeURIComponent(token)}`;
    const result = {
      upload_url,
      expires_in_seconds: 1800,
      curl: `curl -sS --data-binary @FILE.jpg -H "Content-Type: image/jpeg" "${upload_url}&name=FILE.jpg"`,
      message:
        "Replace FILE.jpg with the real path and set Content-Type to the file type (image/png, video/mp4, ...). Each call returns JSON with media_id. Do not share this link: it grants uploads to this workspace until it expires.",
    };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
