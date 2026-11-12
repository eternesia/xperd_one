import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

/** Superadmin: ringkasan kesehatan server aplikasi, database, penyimpanan berkas, dan backup. */
export const adminSystemHealth = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => (input ?? {}) as { rescanStorage?: boolean })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    await requireAdmin(context.userId);
    const { collectSystemHealth } = await import("@/lib/system-health.server");
    return collectSystemHealth({ rescanStorage: data.rescanStorage });
  });
