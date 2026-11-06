import { defineTool } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

const cap = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export default defineTool({
  name: "qalling_get_publishing_limits",
  title: "Plan limits and usage",
  description:
    "The workspace plan's limits and current usage: connected accounts, users, storage, and posts scheduled/published this calendar month (Asia/Jakarta). null limit = unlimited. Check before bulk scheduling.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id }, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(workspace_id, userId, "publishing");
    const { workspaceLimits, workspaceUsage } = await import("@/lib/entitlements.server");
    const { executeOne } = await import("@/integrations/mysql/pool");
    const [limits, usage] = await Promise.all([
      workspaceLimits(workspace_id),
      workspaceUsage(workspace_id),
    ]);
    const month = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
    const posts = await executeOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM crm_scheduled_posts
        WHERE workspace_id = ?
          AND DATE_FORMAT(CONVERT_TZ(COALESCE(scheduled_at, created_at), '+00:00', '+07:00'), '%Y-%m') = ?`,
      [workspace_id, month],
    );
    const storageGb = cap(limits?.storage_gb);
    return json({
      month,
      accounts: { used: usage.accounts, limit: cap(limits?.max_accounts) },
      users: { used: usage.users, limit: cap(limits?.max_users) },
      storage: {
        used_mb: Math.round(usage.storageBytes / 1_048_576),
        limit_gb: storageGb,
      },
      posts_this_month: { used: Number(posts?.n ?? 0), limit: cap(limits?.monthly_post_limit) },
      max_video_mb: cap(limits?.max_video_mb),
    });
  },
});
