import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

const ws = z.object({ workspaceId: z.string().uuid() });

async function gate(workspaceId: string, userId: string, feature: string, write: boolean) {
  const { isWorkspaceMember, canWriteWorkspace } = await import("@/lib/auth-context.server");
  const { workspaceHasFeature } = await import("@/lib/entitlements.server");
  if (!(await isWorkspaceMember(workspaceId, userId)))
    throw new Error("Anda tidak memiliki akses ke workspace ini.");
  if (!(await workspaceHasFeature(workspaceId, feature)))
    throw new Error("Fitur ini tersedia di paket Agency. Upgrade paket untuk mengaktifkannya.");
  if (write && !(await canWriteWorkspace(workspaceId, userId)))
    throw new Error("Anda tidak memiliki akses ubah di workspace ini.");
}
const actorOf = (c: { userId: string; user?: { email?: string | null } | null }) => ({
  id: c.userId,
  email: c.user?.email ?? null,
});

export const requestPostApproval = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    ws
      .extend({
        postId: z.string().uuid(),
        clientLabel: z.string().max(120).optional(),
        message: z.string().max(2000).optional(),
        days: z.number().int().min(1).max(60).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, "client_approval", true);
    const { requestApprovalCore } = await import("@/lib/agency.core.server");
    return requestApprovalCore(data.workspaceId, data.postId, data, actorOf(context));
  });

export const listPostApprovals = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.extend({ postId: z.string().uuid().optional() }).parse(v))
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, "client_approval", false);
    const { listApprovalsCore } = await import("@/lib/agency.core.server");
    return listApprovalsCore(data.workspaceId, data.postId);
  });

export const cancelPostApproval = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.extend({ approvalId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, "client_approval", true);
    const { cancelApprovalCore } = await import("@/lib/agency.core.server");
    await cancelApprovalCore(data.workspaceId, data.approvalId, actorOf(context));
    return { ok: true };
  });

/* Publik (tanpa login): dipakai klien lewat link. */
export const getApprovalPublic = createServerFn({ method: "POST" })
  .validator((v: unknown) => z.object({ token: z.string().max(64) }).parse(v))
  .handler(async ({ data }) => {
    const { getPublicApproval } = await import("@/lib/agency.core.server");
    return getPublicApproval(data.token);
  });

export const decideApprovalPublic = createServerFn({ method: "POST" })
  .validator((v: unknown) =>
    z
      .object({
        token: z.string().max(64),
        decision: z.enum(["approved", "changes_requested"]),
        name: z.string().max(120),
        comment: z.string().max(2000).default(""),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { decideApproval } = await import("@/lib/agency.core.server");
    return decideApproval(data.token, data.decision, data.name, data.comment);
  });

export const createReportLink = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    ws
      .extend({
        title: z.string().min(1).max(150),
        brandName: z.string().min(1).max(120),
        brandColor: z.string().max(9).optional(),
        logoUrl: z.string().max(500).nullable().optional(),
        clientGroupId: z.string().uuid().nullable().optional(),
        periodDays: z.number().int().min(7).max(365).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, "white_label_reports", true);
    const { createReportLinkCore } = await import("@/lib/agency.core.server");
    return createReportLinkCore(data.workspaceId, data, actorOf(context));
  });

export const listReportLinks = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.parse(v))
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, "white_label_reports", false);
    const { listReportLinksCore } = await import("@/lib/agency.core.server");
    return listReportLinksCore(data.workspaceId);
  });

export const revokeReportLink = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.extend({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, "white_label_reports", true);
    const { revokeReportLinkCore } = await import("@/lib/agency.core.server");
    await revokeReportLinkCore(data.workspaceId, data.id, actorOf(context));
    return { ok: true };
  });

export const getReportPublic = createServerFn({ method: "POST" })
  .validator((v: unknown) => z.object({ token: z.string().max(64) }).parse(v))
  .handler(async ({ data }) => {
    const { getPublicReport } = await import("@/lib/agency.core.server");
    return getPublicReport(data.token);
  });
