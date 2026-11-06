import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { bool, json } from "../qalling-common";

const nul = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

export default defineTool({
  name: "qalling_update_automation",
  title: "Update, enable or disable a reply automation",
  description:
    "Change fields of an existing reply automation, or enable/disable it. Only the fields you pass are changed; pass an empty string to clear an optional text field. Turning enabled=true makes the rule message real customers: only do that after explicit user approval. The account and trigger of a rule cannot be changed.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    automation_id: z.string().uuid().describe("Rule id from qalling_list_automations."),
    name: z.string().trim().min(1).max(100).optional(),
    action: z.enum(["reply", "comment_to_dm"]).optional(),
    keywords: z.string().max(100).optional(),
    reply: z.string().trim().min(1).max(2000).optional(),
    public_reply: z.string().max(2200).optional(),
    link_label: z.string().max(20).optional(),
    link_url: z.string().max(2000).optional(),
    track_clicks: z.boolean().optional(),
    follow_gate: z.boolean().optional(),
    follow_ask: z.string().max(1000).optional(),
    follow_button: z.string().max(20).optional(),
    follow_retry: z.string().max(1000).optional(),
    auto_like: z.boolean().optional(),
    enabled: z.boolean().optional().describe("True makes the rule live; ask the user first."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async (a, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(a.workspace_id, userId, "automations", true);
    const { executeOne } = await import("@/integrations/mysql/pool");
    const r = await executeOne<Record<string, unknown>>(
      "SELECT * FROM crm_automation_rules WHERE workspace_id = ? AND id = ?",
      [a.workspace_id, a.automation_id],
    );
    if (!r) throw new ToolError("Automation not found in this workspace.");
    const pick = <T>(next: T | undefined, current: T) => (next === undefined ? current : next);
    const trigger = String(r.trigger_type) as "dm" | "comment";
    const data = {
      workspaceId: a.workspace_id,
      id: a.automation_id,
      accountId: String(r.account_id),
      name: pick(a.name, String(r.name)),
      trigger,
      action:
        trigger === "dm"
          ? ("reply" as const)
          : (pick(a.action, String(r.action_kind)) as "reply" | "comment_to_dm"),
      keyword: pick(a.keywords?.trim(), String(r.keyword ?? "")),
      reply: pick(a.reply, String(r.reply_body ?? "")),
      publicReply: a.public_reply === undefined ? nul(r.public_reply) : nul(a.public_reply?.trim()),
      linkLabel: a.link_label === undefined ? nul(r.link_label) : nul(a.link_label?.trim()),
      linkUrl: a.link_url === undefined ? nul(r.link_url) : nul(a.link_url?.trim()),
      trackClicks: pick(a.track_clicks, bool(r.track_clicks)),
      followGate: pick(a.follow_gate, bool(r.follow_gate)),
      followAsk: a.follow_ask === undefined ? nul(r.follow_ask) : nul(a.follow_ask?.trim()),
      followButton:
        a.follow_button === undefined ? nul(r.follow_button) : nul(a.follow_button?.trim()),
      followRetry: a.follow_retry === undefined ? nul(r.follow_retry) : nul(a.follow_retry?.trim()),
      autoLike: pick(a.auto_like, bool(r.auto_like)),
      enabled: pick(a.enabled, bool(r.enabled)),
    };
    const { validateAutomation } = await import("@/lib/automation-payload");
    const err = validateAutomation(data);
    if (err) throw new ToolError(err);
    const { manageAutomationCore } = await import("@/lib/social-interactions.core.server");
    try {
      await manageAutomationCore(data);
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
    return json({ ok: true, id: a.automation_id, enabled: data.enabled });
  },
});
