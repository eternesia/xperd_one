import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

const ws = z.object({ workspaceId: z.string().uuid() });

async function gate(workspaceId: string, userId: string, write: boolean) {
  const { isWorkspaceMember, canWriteWorkspace } = await import("@/lib/auth-context.server");
  const { workspaceHasFeature } = await import("@/lib/entitlements.server");
  if (!(await isWorkspaceMember(workspaceId, userId)))
    throw new Error("Anda tidak memiliki akses ke workspace ini.");
  if (!(await workspaceHasFeature(workspaceId, "crm")))
    throw new Error("Fitur ini tersedia mulai paket Pro.");
  if (write && !(await canWriteWorkspace(workspaceId, userId)))
    throw new Error("Anda tidak memiliki akses ubah di workspace ini.");
}

export const getLeadHealth = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.parse(v))
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, false);
    const { leadHealthCore, STALE_DAYS } = await import("@/lib/lead-followup.core.server");
    return { staleDays: STALE_DAYS, items: await leadHealthCore(data.workspaceId) };
  });

export const getLeadDetail = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.extend({ leadId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, false);
    const { leadDetailCore } = await import("@/lib/lead-followup.core.server");
    return leadDetailCore(data.workspaceId, data.leadId);
  });

export const logLeadActivity = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    ws
      .extend({
        leadId: z.string().uuid(),
        type: z.enum(["note", "call", "message", "meeting", "task"]),
        subject: z.string().trim().min(1).max(255),
        body: z.string().max(5000).nullable().optional(),
        dueAt: z.string().max(40).nullable().optional(),
        followUpDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, true);
    const { logLeadActivityCore } = await import("@/lib/lead-followup.core.server");
    const dueAt = data.dueAt ? new Date(data.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("Tanggal tidak valid.");
    const { sqlDateTime } = await import("@/lib/datetime");
    return logLeadActivityCore(
      data.workspaceId,
      { ...data, dueAt: dueAt ? sqlDateTime(dueAt) : null },
      { id: context.userId },
    );
  });

export const completeLeadTask = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) => ws.extend({ activityId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, true);
    const { completeTaskCore } = await import("@/lib/lead-followup.core.server");
    await completeTaskCore(data.workspaceId, data.activityId);
    return { ok: true };
  });

export const snoozeLeadFollowUp = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    ws
      .extend({
        leadId: z.string().uuid(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await gate(data.workspaceId, context.userId, true);
    const { setFollowUpCore } = await import("@/lib/lead-followup.core.server");
    await setFollowUpCore(data.workspaceId, data.leadId, data.date);
    return { ok: true };
  });
