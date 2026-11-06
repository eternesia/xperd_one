import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

export default defineTool({
  name: "qalling_get_account_insights",
  title: "Account insights",
  description:
    "Account-level analytics (followers, reach, views, interactions… whichever the platform provides) for the last 7, 30 or 90 days, with the previous period for comparison and daily values. Available only for Tebar-connected accounts; other accounts return available=false with a reason.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    account_id: z.string().uuid().describe("Account id from qalling_list_social_accounts."),
    days: z
      .union([z.literal(7), z.literal(30), z.literal(90)])
      .default(30)
      .describe("Period length in days: 7, 30 or 90."),
    include_daily: z
      .boolean()
      .default(false)
      .describe("Include the per-day series (larger output)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ workspace_id, account_id, days, include_daily }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "insights");
    const { getSocialInsightsCore } = await import("@/lib/social-insights.core.server");
    let r;
    try {
      r = await getSocialInsightsCore(workspace_id, account_id, days);
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
    return json({
      available: r.available,
      reason: r.reason ?? null,
      days,
      metrics: r.metrics.map((m) => ({
        key: m.key,
        total: m.total,
        previous_period: m.prev,
        change_pct:
          m.total !== null && m.prev
            ? Math.round(((m.total - m.prev) / Math.abs(m.prev)) * 1000) / 10
            : null,
        ...(include_daily ? { daily: m.daily } : {}),
      })),
      posts_per_day: r.postsPerDay,
    });
  },
});
