import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export interface InsightSeries {
  key: string;
  total: number | null;
  prev: number | null;
  daily: { date: string; value: number | null }[];
}
export interface InsightPost {
  id: string;
  text: string;
  url: string | null;
  date: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  interactions: number | null;
}
export interface InsightResult {
  available: boolean;
  reason?: string;
  metrics: InsightSeries[];
  postsPerDay: Record<string, number>;
  posts: InsightPost[];
}

export const getSocialInsights = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        accountId: z.string().uuid(),
        days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<InsightResult> => {
    const { isWorkspaceMember } = await import("@/lib/auth-context.server");
    if (!(await isWorkspaceMember(data.workspaceId, context.userId)))
      throw new Error("Tidak memiliki akses.");
    const { getSocialInsightsCore } = await import("@/lib/social-insights.core.server");
    return getSocialInsightsCore(data.workspaceId, data.accountId, data.days);
  });
