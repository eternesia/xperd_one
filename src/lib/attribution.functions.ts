import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export const getContentAttribution = createServerFn({ method: "POST" })
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
      throw new Error("Atribusi konten tersedia mulai paket Pro.");
    const { contentAttributionCore } = await import("@/lib/attribution.core.server");
    return contentAttributionCore(data.workspaceId, data.days);
  });
