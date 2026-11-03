import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { nextLeadCode } from "@/lib/crm";

export default defineTool({
  name: "qalling_create_lead",
  title: "Create lead",
  description: "Create a new CRM lead in a Qalling workspace (requires a plan with CRM).",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    name: z.string().min(1).max(150).describe("Lead / contact name."),
    company_name: z.string().max(150).optional().describe("Company name."),
    email: z.string().email().optional().describe("Email address."),
    phone: z.string().max(40).optional().describe("Phone / WhatsApp number."),
    source: z.string().max(60).optional().describe("Where the lead came from."),
    estimated_value: z.number().int().min(0).optional().describe("Estimated deal value in IDR."),
    notes: z.string().max(2000).optional().describe("Initial note."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ workspace_id, ...lead }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "crm", true);
    const { executeOne, transaction, uuid } = await import("@/integrations/mysql/pool");
    const id = uuid();
    // Kode berikutnya dihitung di dalam transaksi (kunci baris workspace) agar tidak bentrok.
    const code = await transaction(async (conn) => {
      await conn.execute("SELECT id FROM workspaces WHERE id = ? FOR UPDATE", [workspace_id]);
      const [rows] = await conn.execute("SELECT code FROM crm_leads WHERE workspace_id = ?", [
        workspace_id,
      ]);
      const c = nextLeadCode((rows as { code: string }[]).map((r) => r.code));
      await conn.execute(
        `INSERT INTO crm_leads (id, workspace_id, code, name, company_name, email, phone, source, estimated_value, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          workspace_id,
          c,
          lead.name,
          lead.company_name ?? null,
          lead.email ?? null,
          lead.phone ?? null,
          lead.source ?? null,
          lead.estimated_value ?? 0,
          lead.notes ?? null,
          userId,
        ],
      );
      return c;
    }).catch((e: Error) => {
      throw new ToolError(e.message);
    });
    const row = (await (
      await import("@/integrations/mysql/pool")
    ).executeOne<{ id: string; code: string; name: string; stage: string }>(
      "SELECT id, code, name, stage FROM crm_leads WHERE id = ?",
      [id],
    )) ?? { id, code, name: lead.name, stage: "new" };
    return {
      content: [{ type: "text", text: JSON.stringify(row) }],
      structuredContent: { lead: row },
    };
  },
});
