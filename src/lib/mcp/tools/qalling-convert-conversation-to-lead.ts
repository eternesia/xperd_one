import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

export default defineTool({
  name: "qalling_convert_conversation_to_lead",
  title: "Save a DM conversation as a lead",
  description:
    "Turn an inbox DM conversation into a CRM lead (name and source taken from the conversation, last message saved as the note) and link them. If the conversation already has a lead, that lead is returned instead of creating a duplicate. Requires a plan with CRM.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    conversation_id: z.string().uuid().describe("Conversation id from qalling_list_conversations."),
    phone: z.string().max(40).optional().describe("Phone / WhatsApp number, if known."),
    notes: z.string().max(2000).optional().describe("Note; defaults to the last message."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ workspace_id, conversation_id, phone, notes }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "crm", true);
    await assertQallingAccess(workspace_id, userId, "inbox_dm");
    const { convertConversationToLeadCore } = await import("@/lib/inbox-lead.core.server");
    try {
      const r = await convertConversationToLeadCore(userId, {
        workspaceId: workspace_id,
        conversationId: conversation_id,
        phone,
        notes,
      });
      return json({
        lead_id: r.leadId,
        already_existed: r.existing,
        message: r.existing
          ? "This conversation was already linked to a lead."
          : "Lead created and linked to the conversation.",
      });
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
  },
});
