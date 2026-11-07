/** Atribusi prospek ke konten: postingan/kampanye mana yang menghasilkan prospek dan closing. */
import { execute, executeOne } from "@/integrations/mysql/pool";
import { sqlDateTime } from "./datetime";

export type AttributionRow = {
  id: string;
  title: string;
  at: string | null;
  leads: number;
  won: number;
  lost: number;
  open: number;
  wonValue: number;
  pipelineValue: number;
  winRate: number | null;
};

const num = (v: unknown) => Number(v ?? 0);

function shape(r: Record<string, unknown>): AttributionRow {
  const leads = num(r.leads);
  const won = num(r.won);
  const lost = num(r.lost);
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    at: r.at ? String(r.at) : null,
    leads,
    won,
    lost,
    open: leads - won - lost,
    wonValue: num(r.won_value),
    pipelineValue: num(r.pipeline_value),
    winRate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
  };
}

const AGG = `COUNT(l.id) AS leads,
       SUM(l.status = 'won') AS won,
       SUM(l.status = 'lost') AS lost,
       COALESCE(SUM(CASE WHEN l.status = 'won' THEN l.estimated_value END), 0) AS won_value,
       COALESCE(SUM(CASE WHEN l.status = 'open' THEN l.estimated_value END), 0) AS pipeline_value`;

export async function contentAttributionCore(workspaceId: string, days = 90) {
  const since = sqlDateTime(new Date(Date.now() - Math.min(Math.max(days, 7), 730) * 86400000));
  const [posts, campaigns, totals] = await Promise.all([
    execute<Record<string, unknown>>(
      `SELECT p.id, p.title, COALESCE(p.published_at, p.scheduled_at) AS at, ${AGG}
         FROM crm_leads l JOIN crm_scheduled_posts p ON p.id = l.source_post_id AND p.workspace_id = l.workspace_id
        WHERE l.workspace_id = ? AND l.created_at >= ?
        GROUP BY p.id, p.title, p.published_at, p.scheduled_at
        ORDER BY leads DESC, won_value DESC LIMIT 50`,
      [workspaceId, since],
    ),
    execute<Record<string, unknown>>(
      `SELECT c.id, c.name AS title, c.start_date AS at, ${AGG}
         FROM crm_leads l JOIN crm_campaigns c ON c.id = l.source_campaign_id AND c.workspace_id = l.workspace_id
        WHERE l.workspace_id = ? AND l.created_at >= ?
        GROUP BY c.id, c.name, c.start_date
        ORDER BY leads DESC, won_value DESC LIMIT 50`,
      [workspaceId, since],
    ),
    executeOne<Record<string, unknown>>(
      `SELECT COUNT(*) AS total,
              SUM(source_post_id IS NOT NULL OR source_campaign_id IS NOT NULL) AS attributed
         FROM crm_leads WHERE workspace_id = ? AND created_at >= ?`,
      [workspaceId, since],
    ),
  ]);
  const total = num(totals?.total);
  const attributed = num(totals?.attributed);
  return {
    days,
    totalLeads: total,
    attributedLeads: attributed,
    unattributedLeads: total - attributed,
    attributionRate: total ? Math.round((attributed / total) * 100) : null,
    posts: posts.map(shape),
    campaigns: campaigns.map(shape),
  };
}

/** Pastikan postingan/kampanye milik workspace yang sama; kembalikan null bila kosong. */
export async function validateLeadSource(
  workspaceId: string,
  postId?: string | null,
  campaignId?: string | null,
) {
  if (postId) {
    const ok = await executeOne(
      "SELECT 1 AS ok FROM crm_scheduled_posts WHERE id = ? AND workspace_id = ?",
      [postId, workspaceId],
    );
    if (!ok) throw new Error("Postingan sumber tidak ditemukan di workspace ini.");
  }
  if (campaignId) {
    const ok = await executeOne(
      "SELECT 1 AS ok FROM crm_campaigns WHERE id = ? AND workspace_id = ?",
      [campaignId, workspaceId],
    );
    if (!ok) throw new Error("Kampanye sumber tidak ditemukan di workspace ini.");
  }
}
