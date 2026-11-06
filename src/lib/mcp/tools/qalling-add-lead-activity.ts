import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";
import { CRM_ACTIVITY_TYPES } from "@/lib/crm";

const TYPES = CRM_ACTIVITY_TYPES.map((t) => t.id) as [string, ...string[]];

export default defineTool({
  name: "qalling_add_lead_activity",
  title: "Log a note, call or follow-up task for a lead",
  description:
    "Add an activity to a CRM lead: a note, or a call/WhatsApp/email/meeting. With due_at it is a pending follow-up task (complete it later with qalling_complete_activity); with already_done=true it records something that already happened. Optionally sets the lead's next follow-up date. Does not contact the customer.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    lead_id: z.string().uuid().describe("Lead id from qalling_search_leads."),
    type: z.enum(TYPES).default("note").describe("call, whatsapp, email, meeting or note."),
    subject: z.string().trim().min(1).max(255).describe("Short title."),
    body: z.string().max(4000).optional().describe("Details."),
    due_at: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe("When the follow-up is due, ISO 8601 with timezone offset."),
    already_done: z.boolean().default(false).describe("True when logging something already done."),
    outcome: z.string().max(255).optional().describe("Result, when already_done."),
    owner_name: z.string().max(150).optional().describe("Person responsible."),
    set_next_follow_up: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .optional()
      .describe("Also set the lead's next follow-up date."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async (a, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(a.workspace_id, userId, "crm", true);
    const { executeOne, execute, uuid } = await import("@/integrations/mysql/pool");
    const lead = await executeOne<{ id: string }>(
      "SELECT id FROM crm_leads WHERE workspace_id = ? AND id = ?",
      [a.workspace_id, a.lead_id],
    );
    if (!lead) throw new ToolError("Lead not found in this workspace.");
    const id = uuid();
    await execute(
      `INSERT INTO crm_activities (id, workspace_id, lead_id, activity_type, subject, body, due_at, done_at, outcome, owner_name, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ${a.already_done ? "UTC_TIMESTAMP(6)" : "NULL"}, ?, ?, ?)`,
      [
        id,
        a.workspace_id,
        a.lead_id,
        a.type,
        a.subject,
        a.body ?? null,
        a.due_at ? new Date(a.due_at) : null,
        a.already_done ? (a.outcome ?? null) : null,
        a.owner_name ?? null,
        userId,
      ],
    );
    await execute(
      `UPDATE crm_leads SET last_activity_at = UTC_TIMESTAMP(6)${a.set_next_follow_up ? ", next_follow_up_at = ?" : ""}
        WHERE workspace_id = ? AND id = ?`,
      a.set_next_follow_up
        ? [a.set_next_follow_up, a.workspace_id, a.lead_id]
        : [a.workspace_id, a.lead_id],
    );
    return json({
      id,
      lead_id: a.lead_id,
      status: a.already_done ? "done" : "open",
      due_at: a.due_at ?? null,
    });
  },
});
