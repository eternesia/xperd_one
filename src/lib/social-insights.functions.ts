/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export interface InsightSeries { key: string; total: number | null; prev: number | null; daily: { date: string; value: number | null }[] }
export interface InsightPost { id: string; text: string; url: string | null; date: string; views: number | null; likes: number | null; comments: number | null; shares: number | null; interactions: number | null }
export interface InsightResult { available: boolean; reason?: string; metrics: InsightSeries[]; postsPerDay: Record<string, number>; posts: InsightPost[] }

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Tolerant normaliser: Tebar answers "daily values and totals per metric". */
function readMetrics(j: any): Map<string, { total: number | null; daily: { date: string; value: number | null }[] }> {
  const out = new Map<string, { total: number | null; daily: { date: string; value: number | null }[] }>();
  const root = j?.data ?? j;
  const m = root?.metrics ?? root;
  const put = (key: string, v: any) => {
    if (!v || typeof v !== "object" || ["posts_per_day", "missing_permission"].includes(key)) return;
    const arr = Array.isArray(v) ? v : (v.daily ?? v.values ?? v.series ?? []);
    const daily = (Array.isArray(arr) ? arr : []).map((p: any) => ({ date: String(p.date ?? p.day ?? "").slice(0, 10), value: num(p.value ?? p.count) })).filter((p: any) => p.date);
    let total = num(v.total ?? v.sum ?? v.value);
    if (total === null && daily.length) total = key.startsWith("followers") ? daily.filter((d) => d.value !== null).at(-1)?.value ?? null : daily.reduce((s, d) => s + (d.value ?? 0), 0);
    out.set(key, { total, daily });
  };
  if (Array.isArray(m)) m.forEach((x: any) => put(String(x.metric ?? x.name ?? x.key), x));
  else if (m && typeof m === "object") for (const [k, v] of Object.entries(m)) put(k, v);
  const totals = root?.totals;
  if (totals && typeof totals === "object") for (const [k, v] of Object.entries(totals)) { const cur = out.get(k) ?? { total: null, daily: [] }; cur.total = num(v); out.set(k, cur); }
  return out;
}

function readPostsPerDay(j: any): Record<string, number> {
  const r = (j?.data ?? j)?.posts_per_day ?? (j?.data ?? j)?.post_counts;
  const out: Record<string, number> = {};
  if (Array.isArray(r)) r.forEach((p: any) => { if (p?.date) out[String(p.date).slice(0, 10)] = Number(p.count ?? p.value ?? 0); });
  else if (r && typeof r === "object") for (const [k, v] of Object.entries(r)) out[k.slice(0, 10)] = Number(v) || 0;
  return out;
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
    const { executeOne } = await import("@/integrations/mysql/pool");
    const acc = await executeOne<{ id: string; external_id: string | null; source: string }>(
      "SELECT id, external_id, source FROM crm_social_accounts WHERE id = ? AND workspace_id = ?",
      [data.accountId, data.workspaceId],
    );
    const empty: InsightResult = { available: false, metrics: [], postsPerDay: {}, posts: [] };
    if (!acc) throw new Error("Akun tidak ditemukan.");
    if (acc.source !== "tebar" || !acc.external_id) return { ...empty, reason: "source" };
    const { getTebarKey, tebarFetch } = await import("./tebar.server");
    const key = await getTebarKey();
    if (!key) return { ...empty, reason: "config" };
    const headers = { "Tebar-Profile": data.workspaceId };
    const now = new Date();
    const from = new Date(now.getTime() - (data.days - 1) * 864e5);
    const pFrom = new Date(from.getTime() - data.days * 864e5);
    const pTo = new Date(from.getTime() - 864e5);
    const id = encodeURIComponent(acc.external_id);
    // One summary call per period (stored daily values, no platform call) — cheaper than per-account insight calls.
    const q = (f: Date, t: Date) =>
      `/insights/summary?account_ids=${id}&from=${day(f)}&to=${day(t)}&tz=Asia/Jakarta`;
    const pick = (j: any) => {
      const root = j?.data ?? j;
      const list = Array.isArray(root?.accounts) ? root.accounts : Array.isArray(root) ? root : null;
      if (list)
        return list.find((a: any) => String(a?.account_id ?? a?.id) === acc.external_id) ?? list[0] ?? {};
      if (root?.accounts && typeof root.accounts === "object")
        return root.accounts[acc.external_id as string] ?? {};
      return root;
    };
    const [cur, prev, posts] = await Promise.all([
      tebarFetch(key, q(from, now), { headers }),
      tebarFetch(key, q(pFrom, pTo), { headers }).catch(() => null),
      tebarFetch(key, `/accounts/${id}/post-insights?from=${day(from)}&to=${day(now)}&tz=Asia/Jakarta`, {
        headers,
      }).catch(() => null),
    ]);
    const c = readMetrics(pick(cur)),
      p = prev ? readMetrics(pick(prev)) : new Map();
    const topPosts = ((cur as any)?.data ?? cur)?.top_posts;
    const metrics: InsightSeries[] = [...c.entries()].map(([k, v]) => ({
      key: k,
      total: v.total,
      prev: p.get(k)?.total ?? null,
      daily: v.daily,
    }));
    const plist = (
      Array.isArray(posts?.data) ? posts.data : Array.isArray(posts) ? posts : Array.isArray(topPosts) ? topPosts : []
    ) as any[];
    const g = (x: any, k: string) => num(x?.[k] ?? x?.metrics?.[k] ?? x?.totals?.[k]);
    return {
      available: true,
      reason: pick(cur)?.missing_permission ? "permission" : undefined,
      metrics,
      postsPerDay: readPostsPerDay(pick(cur)),
      posts: plist.slice(0, 100).map((x) => ({
        id: String(x.id),
        text: String(x.text ?? x.caption ?? "").slice(0, 300),
        url: x.permalink ?? x.url ?? null,
        date: String(x.published_at ?? x.created_at ?? ""),
        views: g(x, "views"),
        likes: g(x, "likes"),
        comments: g(x, "comments") ?? g(x, "replies"),
        shares: g(x, "shares") ?? g(x, "reposts"),
        interactions: g(x, "total_interactions"),
      })),
    };
  });
