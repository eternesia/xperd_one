import { randomUUID } from "node:crypto";
import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { iso, json } from "../qalling-common";
import { replyWindowOpen } from "../../meta-inbox-rules";

export default defineTool({
  name: "qalling_send_dm",
  title: "Send a DM reply (or internal note)",
  description:
    "Reply to a customer in an inbox conversation as the connected account (only within the 24-hour reply window), or add an internal note that is never sent. Sending reaches a real customer: call first with confirm=false to preview, show the exact text and recipient to the user, and only after explicit approval call again with confirm=true. If the result status is 'unknown' or 'sending', the DM may already be delivered: never resend, read qalling_get_conversation instead.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    conversation_id: z.string().uuid().describe("Conversation id from qalling_list_conversations."),
    text: z.string().trim().min(1).max(1000).describe("Message text (plain text)."),
    note: z
      .boolean()
      .default(false)
      .describe("True saves an internal note visible to the team only; nothing is sent."),
    confirm: z
      .boolean()
      .default(false)
      .describe("False previews; true sends after explicit user approval. Ignored for notes."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async ({ workspace_id, conversation_id, text, note, confirm }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "inbox_dm", true);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const c = await executeOne<Record<string, unknown>>(
      `SELECT c.id, c.participant_name, c.reply_window_expires_at, a.account_name, a.platform
         FROM crm_conversations c LEFT JOIN crm_social_accounts a ON a.id = c.account_id
        WHERE c.workspace_id = ? AND c.id = ?`,
      [workspace_id, conversation_id],
    );
    if (!c) throw new ToolError("Conversation not found in this workspace.");
    if (!note && !replyWindowOpen(iso(c.reply_window_expires_at)))
      throw new ToolError("The 24-hour reply window is closed; this customer cannot be messaged.");
    if (!note && !confirm)
      return json({
        status: "awaiting_confirmation",
        to: c.participant_name,
        from_account: c.account_name,
        platform: c.platform,
        text,
        message: "Ask the user to approve this exact DM before calling with confirm=true.",
      });
    const { sendInboxMessageCore } = await import("@/lib/social-interactions.core.server");
    try {
      const r = await sendInboxMessageCore(userId, {
        workspaceId: workspace_id,
        conversationId: conversation_id,
        messageId: randomUUID(),
        body: text,
        note,
      });
      return json({
        status: r.status,
        message:
          r.status === "sent" || r.status === "note"
            ? "Done."
            : "Not confirmed. Do not resend; read qalling_get_conversation for the outcome.",
      });
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
  },
});
