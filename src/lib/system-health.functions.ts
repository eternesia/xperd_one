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

/** Riwayat metrik untuk grafik (24 jam per 5 menit, 7 hari per jam). */
export const adminHealthHistory = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => {
    const r = (input as { range?: string } | null)?.range;
    return { range: r === "7d" ? ("7d" as const) : ("24h" as const) };
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    await requireAdmin(context.userId);
    const { metricsHistory, recordMetricsSample } = await import("@/lib/system-metrics.server");
    // Pastikan ada titik terbaru walau penjadwal mati / baru menyala.
    await recordMetricsSample().catch(() => false);
    return metricsHistory(data.range);
  });

/* ------------------------------ backup ------------------------------ */

export const adminListBackups = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    await requireAdmin(context.userId);
    const { listBackups } = await import("@/lib/backup.server");
    return listBackups();
  });

export const adminRunBackup = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as { kind: "db" | "files" })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    await requireAdmin(context.userId);
    if (data.kind !== "db" && data.kind !== "files") throw new Error("Jenis backup tidak valid.");
    const { runBackup } = await import("@/lib/backup.server");
    return runBackup(data.kind, context.userId);
  });

export const adminDeleteBackup = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as { id: string })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/auth-context.server");
    await requireAdmin(context.userId);
    const { deleteBackup } = await import("@/lib/backup.server");
    await deleteBackup(data.id);
    return { ok: true };
  });
