import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";
import { CRM_STAGES } from "@/lib/crm";

const STAGE_IDS = CRM_STAGES.map((s) => s.id) as [string, ...string[]];

export default defineTool({
  name: "qalling_update_lead",
  title: "Update a lead or move it in the pipeline",
  description: `Edit a CRM lead and/or move it to another pipeline stage. Stages: ${CRM_STAGES.map((s) => `${s.id} (${s.id_})`).join(", ")}. Moving to 'won' or 'lost' closes the lead (status follows the stage); lost_reason is only kept for 'lost'. Only the fields you pass change; pass an empty string to clear an optional text field or next_follow_up_at.`,
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    lead_id: z.string().uuid().describe("Lead id from qalling_search_leads."),
    name: z.string().trim().min(1).max(150).optional(),
    company_name: z.string().max(150).optional(),
    email: z.union([z.string().email(), z.literal("")]).optional(),
    phone: z.string().max(40).optional(),
    source: z.string().max(60).optional(),
    stage: z.enum(STAGE_IDS).optional().describe("New pipeline stage."),
    estimated_value: z.number().int().min(0).optional().describe("Deal value in IDR."),
    probability: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe("Defaults to the stage's probability when the stage changes."),
    owner_name: z.string().max(150).optional().describe("Person in charge."),
    next_follow_up_at: z
      .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"), z.literal("")])
      .optional()
      .describe("Next follow-up date, YYYY-MM-DD."),
    notes: z.string().max(2000).optional(),
    lost_reason: z.string().max(255).optional().describe("Why the lead was lost (stage lost)."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (a, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(a.workspace_id, userId, "crm", true);
    const { executeOne, result } = await import("@/integrations/mysql/pool");
    const cur = await executeOne<{ stage: string }>(
      "SELECT stage FROM crm_leads WHERE workspace_id = ? AND id = ?",
      [a.workspace_id, a.lead_id],
    );
    if (!cur) throw new ToolError("Lead not found in this workspace.");
    const sets: string[] = [];
    const params: unknown[] = [];
    const put = (col: string, v: unknown) => {
      sets.push(`${col} = ?`);
      params.push(v);
    };
    const text = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
    if (a.name !== undefined) put("name", a.name);
    for (const [col, v] of [
      ["company_name", a.company_name],
      ["email", a.email],
      ["phone", a.phone],
      ["source", a.source],
      ["owner_name", a.owner_name],
      ["notes", a.notes],
    ] as const) {
      const t = text(v);
      if (t !== undefined) put(col, t);
    }
    if (a.estimated_value !== undefined) put("estimated_value", a.estimated_value);
    if (a.next_follow_up_at !== undefined) put("next_follow_up_at", a.next_follow_up_at || null);
    if (a.stage !== undefined && a.stage !== cur.stage) {
      const stage = CRM_STAGES.find((s) => s.id === a.stage)!;
      put("stage", a.stage);
      put("status", a.stage === "won" ? "won" : a.stage === "lost" ? "lost" : "open");
      sets.push("stage_changed_at = UTC_TIMESTAMP(6)");
      if (a.probability === undefined) put("probability", stage.probability);
      if (a.stage !== "lost") put("lost_reason", null);
    }
    if (a.probability !== undefined) put("probability", a.probability);
    const stageNow = a.stage ?? cur.stage;
    if (a.lost_reason !== undefined && stageNow === "lost") put("lost_reason", text(a.lost_reason));
    if (!sets.length) throw new ToolError("Nothing to change: pass at least one field.");
    await result(`UPDATE crm_leads SET ${sets.join(", ")} WHERE workspace_id = ? AND id = ?`, [
      ...params,
      a.workspace_id,
      a.lead_id,
    ]);
    const lead = await executeOne<Record<string, unknown>>(
      "SELECT id, code, name, stage, status, estimated_value, probability, next_follow_up_at FROM crm_leads WHERE id = ?",
      [a.lead_id],
    );
    return json({
      lead: {
        ...lead,
        estimated_value: Number(lead?.estimated_value),
        next_follow_up_at: lead?.next_follow_up_at
          ? String(lead.next_follow_up_at).slice(0, 10)
          : null,
      },
    });
  },
});
