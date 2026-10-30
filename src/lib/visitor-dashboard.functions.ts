/** Statistik pengunjung website untuk Super Admin (BS New 11 `visitor-dashboard.functions.ts`). */
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export const getVisitorDashboard = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { days: 7 | 30 | 90; site: "all" | "xperd" | "qalling" }) => {
    if (![7, 30, 90].includes(d?.days) || !["all", "xperd", "qalling"].includes(d?.site))
      throw new Error("Input tidak valid");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { hasRole } = await import("@/lib/auth-context.server");
    if (!(await hasRole(context.userId, "admin"))) throw new Error("Hanya Super Admin.");
    const { execute } = await import("@/integrations/mysql/pool");
    const { sqlDateTime } = await import("@/lib/datetime");
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - data.days + 1);
    const rows = (
      await execute<{
        site: string;
        path: string;
        session_id: string;
        referrer_host: string;
        device: string;
        created_at: string;
      }>(
        `SELECT site, path, session_id, referrer_host, device, created_at FROM website_visits
          WHERE created_at >= ? ${data.site === "all" ? "" : "AND site = ?"} ORDER BY created_at`,
        data.site === "all" ? [sqlDateTime(since)] : [sqlDateTime(since), data.site],
      )
    ).map((r) => ({
      ...r,
      created_at: new Date(String(r.created_at).replace(" ", "T") + "Z").toISOString(),
    }));
    const today = new Date().toISOString().slice(0, 10);
    const rank = (key: (r: (typeof rows)[number]) => string) => {
      const counts = new Map<string, number>();
      rows.forEach((r) => counts.set(key(r), (counts.get(key(r)) ?? 0) + 1));
      return [...counts]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    };
    return {
      views: rows.length,
      sessions: new Set(rows.map((r) => r.session_id)).size,
      today: rows.filter((r) => r.created_at.startsWith(today)).length,
      mobile: rows.filter((r) => r.device === "mobile").length,
      trend: Array.from({ length: data.days }, (_, i) => {
        const d = new Date(since);
        d.setUTCDate(d.getUTCDate() + i);
        const date = d.toISOString().slice(0, 10);
        const dayRows = rows.filter((r) => r.created_at.startsWith(date));
        return {
          date: date.slice(5),
          views: dayRows.length,
          sessions: new Set(dayRows.map((r) => r.session_id)).size,
        };
      }),
      pages: rank((r) => r.path),
      sources: rank((r) => r.referrer_host || "Langsung"),
      sites: rank((r) => r.site),
    };
  });
