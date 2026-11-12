import { defineTool } from "../framework";
import { z } from "zod/v4";
import { assertQallingSection, getTokenUser, requireAuth } from "../db";

export default defineTool({
  name: "qalling_create_upload_link",
  title: "Create media upload link",
  description:
    "Create a 30-minute upload link for files that live on your own computer (Claude Code or any agent with a terminal). Run the returned curl command once per file for files under 900 KB, or the returned chunked command for anything larger (videos especially: the server proxy rejects single requests above about 1 MB); the final call responds with a media_id for qalling_create_post media_ids. The file bytes never pass through the model, so this suits large images and videos. NOT for ChatGPT: its sandbox has no internet access, so curl to this link always fails. In ChatGPT use the files parameter of qalling_create_post or qalling_upload_media instead.",
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
      chunked_command: `F=FILE.mp4; T=video/mp4; U="${upload_url}"; ID=up$RANDOM$RANDOM; C=524288; S=$(wc -c < "$F"); N=$(( (S + C - 1) / C )); for i in $(seq 0 $((N-1))); do dd if="$F" bs=$C skip=$i count=1 2>/dev/null | curl -sS --fail-with-body --data-binary @- -H "Content-Type: $T" "$U&name=$(basename "$F")&upload=$ID&part=$i&parts=$N" || break; echo; done`,
      message:
        "Files under 900 KB: use curl, replacing FILE.jpg with the real path and Content-Type with the file type (image/png, video/mp4, ...). Larger files and all videos: use chunked_command, setting F to the path and T to the type; it sends 512 KB parts and the last line printed is the JSON with media_id. Do not share this link: it grants uploads to this workspace until it expires.",
    };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});
