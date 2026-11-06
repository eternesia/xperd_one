import { defineTool, ToolError } from "../framework";
import { z } from "zod/v4";
import { assertQallingAccess, getTokenUser, requireAuth } from "../db";
import { json } from "../qalling-common";

const t = (v: string | undefined) => (v?.trim() ? v.trim() : null);

export default defineTool({
  name: "qalling_create_automation",
  title: "Create a reply automation",
  description:
    "Create an automatic reply rule on a connected Instagram, Facebook or Threads account. trigger 'dm' answers incoming DMs (action reply). trigger 'comment' with action 'comment_to_dm' sends a DM (optionally with a link button and a follow gate) to people who comment, and with action 'reply' posts public replies. The rule messages real customers, so it is created DISABLED by default: show the user the rule and only set enabled=true after explicit approval. Needs a Meta or Tebar-connected account.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id from list_workspaces."),
    account_id: z.string().uuid().describe("Account id from qalling_list_social_accounts."),
    name: z.string().trim().min(1).max(100).describe("Rule name."),
    trigger: z.enum(["dm", "comment"]).describe("What starts the rule."),
    action: z
      .enum(["reply", "comment_to_dm"])
      .default("reply")
      .describe(
        "For trigger=comment: 'comment_to_dm' sends a DM, 'reply' replies publicly. Ignored for dm.",
      ),
    keywords: z
      .string()
      .max(100)
      .default("")
      .describe("Comma-separated keywords; empty matches everything (default reply)."),
    reply: z.string().trim().min(1).max(2000).describe("Reply / DM text."),
    public_reply: z
      .string()
      .max(2200)
      .optional()
      .describe("comment_to_dm only: optional public reply posted under the comment."),
    link_label: z.string().max(20).optional().describe("Link button title (max 20 chars)."),
    link_url: z
      .string()
      .max(2000)
      .optional()
      .describe("Link button URL, must start with https://."),
    track_clicks: z.boolean().default(true).describe("Count link clicks."),
    follow_gate: z
      .boolean()
      .default(false)
      .describe("Ask the person to follow before sending the DM."),
    follow_ask: z.string().max(1000).optional().describe("Required with follow_gate."),
    follow_button: z.string().max(20).optional().describe("Required with follow_gate."),
    follow_retry: z
      .string()
      .max(1000)
      .optional()
      .describe("Sent again if they have not followed yet."),
    auto_like: z.boolean().default(false).describe("Also like new comments (Facebook/TikTok)."),
    enabled: z
      .boolean()
      .default(false)
      .describe("Keep false until the user approves; true makes the rule live immediately."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async (a, ctx) => {
    requireAuth(ctx);
    const { userId } = await getTokenUser(ctx);
    await assertQallingAccess(a.workspace_id, userId, "automations", true);
    const { validateAutomation } = await import("@/lib/automation-payload");
    const action = a.trigger === "dm" ? ("reply" as const) : a.action;
    const data = {
      workspaceId: a.workspace_id,
      accountId: a.account_id,
      name: a.name,
      trigger: a.trigger,
      action,
      keyword: a.keywords.trim(),
      reply: a.reply,
      publicReply: t(a.public_reply),
      linkLabel: t(a.link_label),
      linkUrl: t(a.link_url),
      trackClicks: a.track_clicks,
      followGate: a.follow_gate,
      followAsk: t(a.follow_ask),
      followButton: t(a.follow_button),
      followRetry: t(a.follow_retry),
      autoLike: a.auto_like,
      enabled: a.enabled,
    };
    const err = validateAutomation({ ...data, keyword: data.keyword });
    if (err) throw new ToolError(err);
    const { manageAutomationCore } = await import("@/lib/social-interactions.core.server");
    try {
      await manageAutomationCore(data);
    } catch (e) {
      throw new ToolError((e as Error).message);
    }
    return json({
      ok: true,
      enabled: a.enabled,
      message: a.enabled
        ? "Automation created and live."
        : "Automation created but disabled. Enable it with qalling_update_automation after user approval. Find its id with qalling_list_automations.",
    });
  },
});
