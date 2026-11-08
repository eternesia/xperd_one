import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export const getFunnelReport = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        days: z.number().int().min(7).max(730).default(90),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    const { workspaceHasFeature } = await import("@/lib/entitlements.server");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId)))
      throw new Error("Anda tidak memiliki akses ke workspace ini.");
    if (!(await workspaceHasFeature(data.workspaceId, "crm")))
      throw new Error("Funnel penjualan tersedia mulai paket Pro.");
    const { funnelReportCore } = await import("@/lib/funnel.core.server");
    return funnelReportCore(data.workspaceId, data.days);
  });
