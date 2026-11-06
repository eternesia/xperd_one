import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

export default defineTool({
  name: "qalling_set_conversation_status",
  title: "Resolve, reopen or mark a conversation read",
  description:
    "Change an inbox conversation's status to open or resolved and/or mark it as read. Does not message the customer.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    conversation_id: z.string().uuid().describe("Conversation id from qalling_list_conversations."),
    status: z.enum(["open", "resolved"]).optional().describe("New status."),
    mark_read: z.boolean().default(false).describe("Reset the unread counter to zero."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ workspace_id, conversation_id, status, mark_read }, ctx) => {
    requireAuth(ctx);
    if (!status && !mark_read) throw new ToolError("Provide status and/or mark_read=true.");
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "inbox_dm", true);
    const { result } = await import("@/integrations/mysql/pool");
    const sets: string[] = [];
    const params: unknown[] = [];
    if (status) {
      sets.push("status = ?");
      params.push(status);
    }
    if (mark_read) sets.push("unread_count = 0");
    const r = await result(
      `UPDATE crm_conversations SET ${sets.join(", ")} WHERE workspace_id = ? AND id = ?`,
      [...params, workspace_id, conversation_id],
    );
    if (!r.affectedRows) throw new ToolError("Conversation not found in this workspace.");
    return json({ id: conversation_id, status: status ?? undefined, marked_read: mark_read });
  },
});
