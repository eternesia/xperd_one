import { defineTool } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { bool, iso, json } from "../qalling-common";

export default defineTool({
  name: "qalling_list_automations",
  title: "List reply automations",
  description:
    "List the workspace's reply automations (DM keyword replies, comment-to-DM, public comment replies) with their settings, enabled state, click counts and recent run counts.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    account_id: z.string().uuid().optional().describe("Only rules of this social account."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, account_id }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "automations");
    const { execute } = await import("@/integrations/mysql/pool");
    const rules = await execute<Record<string, unknown>>(
      `SELECT r.*, a.account_name, a.platform, a.source,
              (SELECT COUNT(*) FROM crm_automation_runs x WHERE x.rule_id = r.id) AS runs_total,
              (SELECT MAX(x.created_at) FROM crm_automation_runs x WHERE x.rule_id = r.id) AS last_run_at
         FROM crm_automation_rules r LEFT JOIN crm_social_accounts a ON a.id = r.account_id
        WHERE r.workspace_id = ? ${account_id ? "AND r.account_id = ?" : ""} ORDER BY r.created_at`,
      account_id ? [workspace_id, account_id] : [workspace_id],
    );
    const automations = rules.map((r) => ({
      id: r.id,
      name: r.name,
      account_id: r.account_id,
      account: r.account_name ?? null,
      platform: r.platform ?? null,
      provider: r.source ?? null,
      trigger: r.trigger_type, // dm | comment
      action: r.action_kind, // reply | comment_to_dm
      keywords: r.keyword,
      reply: r.reply_body,
      public_reply: r.public_reply ?? null,
      link_label: r.link_label ?? null,
      link_url: r.link_url ?? null,
      track_clicks: bool(r.track_clicks),
      follow_gate: bool(r.follow_gate),
      follow_ask: r.follow_ask ?? null,
      follow_button: r.follow_button ?? null,
      follow_retry: r.follow_retry ?? null,
      auto_like: bool(r.auto_like),
      enabled: bool(r.enabled),
      click_count: Number(r.click_count) || 0,
      runs_total: Number(r.runs_total) || 0,
      last_run_at: iso(r.last_run_at),
    }));
    return json({ automations });
  },
});
