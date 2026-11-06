import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

export default defineTool({
  name: "qalling_save_contact",
  title: "Create or update a contact",
  description:
    "Create a contact (omit contact_id; name required) or update fields of an existing one (only passed fields change; tags replace the whole tag list). Does not contact the customer.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    contact_id: z.string().uuid().optional().describe("Omit to create a new contact."),
    name: z.string().trim().min(1).max(255).optional(),
    phone: z.string().max(50).nullable().optional(),
    email: z.string().max(255).nullable().optional(),
    company_name: z.string().max(255).nullable().optional(),
    tags: z.array(z.string().max(30)).max(20).optional(),
    notes: z.string().max(5000).nullable().optional(),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ workspace_id, contact_id, ...fields }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "crm", true);
    const core = await import("@/lib/crm-contacts.core.server");
    try {
      if (contact_id) {
        await core.updateContactCore(workspace_id, contact_id, fields);
        return json({ id: contact_id, updated: true });
      }
      const r = await core.createContactCore(workspace_id, userId, fields);
      return json({ id: r.id, created: true });
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
  },
});
