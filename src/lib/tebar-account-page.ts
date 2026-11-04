import { z } from "zod";
export const tebarAccountPageSchema = z.object({
  cursor: z.string().max(2000).nullable().default(null),
  limit: z.number().int().min(1).max(100).default(25),
});
export function accountPagePath(cursor: string | null, limit: number) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return `/accounts?${params}`;
}
export function normalizeAccountPage(json: Record<string, any>) {
  const rows = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
  return {
    accounts: rows.map((r: any) => ({
      id: String(r.id),
      platform: String(r.platform ?? r.provider ?? "other").toLowerCase(),
      name: String(r.name ?? r.display_name ?? r.username ?? r.id),
      handle: r.username ?? r.handle ?? (null as string | null),
      profile_url: r.profile_url ?? r.url ?? (null as string | null),
    })),
    nextCursor: typeof json.next_cursor === "string" && json.next_cursor ? json.next_cursor : null,
  };
}
