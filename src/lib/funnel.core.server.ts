/** Corong penjualan & laporan: konversi antar tahap, alasan kalah, sumber, penanggung jawab, forecast, realisasi target. */
import { execute } from "@/integrations/mysql/pool";
import { sqlDateTime } from "./datetime";
import { jakartaToday } from "./billing-wallet.server";
import { CRM_STAGES } from "./crm";

const FLOW = ["new", "contacted", "qualified", "proposal", "negotiation", "won"] as const;
const prob = (stage: string) => CRM_STAGES.find((s) => s.id === stage)?.probability ?? 0;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const norm = (s: string | null) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

type L = {
  stage: string;
  status: string;
  source: string | null;
  owner_name: string | null;
  estimated_value: number;
  probability: number;
  lost_reason: string | null;
  created_at: string;
  stage_changed_at: string;
};

export async function funnelReportCore(ws: string, days: number) {
  const since = sqlDateTime(new Date(Date.now() - days * 86_400_000));
  const leads = await execute<L>(
    `SELECT stage, status, source, owner_name, estimated_value, probability, lost_reason, created_at, stage_changed_at
       FROM crm_leads WHERE workspace_id = ? AND created_at >= ? LIMIT 20000`,
    [ws, since],
  );
  const num = (v: unknown) => Number(v) || 0;
  const live = leads.filter((l) => l.stage !== "lost" && l.status !== "lost");
  const lost = leads.filter((l) => l.stage === "lost" || l.status === "lost");
  const won = leads.filter((l) => l.stage === "won" || l.status === "won");
  const open = leads.filter((l) => l.status === "open" && l.stage !== "won" && l.stage !== "lost");

  // Posisi tahap saat ini; prospek yang kalah tidak diketahui sampai tahap mana, jadi tidak dihitung di tahap lanjut.
  const idx = (l: L) => (l.status === "won" ? FLOW.length - 1 : FLOW.indexOf(l.stage as never));
  const stages = FLOW.map((id, i) => {
    const reached = live.filter((l) => idx(l) >= i);
    const prev = i === 0 ? leads.length : live.filter((l) => idx(l) >= i - 1).length;
    return {
      id,
      reached: reached.length,
      value: reached.reduce((s, l) => s + num(l.estimated_value), 0),
      fromPrevPct: i === 0 ? pct(reached.length, leads.length) : pct(reached.length, prev),
    };
  });

  const reasons = new Map<string, { label: string; count: number; value: number }>();
  for (const l of lost) {
    const k = norm(l.lost_reason) || "(tanpa alasan)";
    const cur = reasons.get(k) ?? { label: (l.lost_reason ?? "").trim() || "", count: 0, value: 0 };
    cur.count++;
    cur.value += num(l.estimated_value);
    reasons.set(k, cur);
  }
  const lostReasons = [...reasons.values()]
    .map((r) => ({ reason: r.label || null, count: r.count, value: r.value }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const group = (key: (l: L) => string) => {
    const m = new Map<
      string,
      { name: string; leads: number; won: number; lost: number; wonValue: number }
    >();
    for (const l of leads) {
      const name = key(l);
      const c = m.get(name) ?? { name, leads: 0, won: 0, lost: 0, wonValue: 0 };
      c.leads++;
      if (l.status === "won" || l.stage === "won") {
        c.won++;
        c.wonValue += num(l.estimated_value);
      } else if (l.status === "lost" || l.stage === "lost") c.lost++;
      m.set(name, c);
    }
    return [...m.values()]
      .map((c) => ({ ...c, winRate: pct(c.won, c.leads) }))
      .sort((a, b) => b.wonValue - a.wonValue || b.leads - a.leads);
  };

  const closeDays = won
    .map(
      (l) =>
        (Date.parse(l.stage_changed_at.replace(" ", "T") + "Z") -
          Date.parse(l.created_at.replace(" ", "T") + "Z")) /
        86_400_000,
    )
    .filter((d) => Number.isFinite(d) && d >= 0);
  const avgDays = closeDays.length
    ? Math.round((closeDays.reduce((a, b) => a + b, 0) / closeDays.length) * 10) / 10
    : null;

  // Forecast: seluruh prospek terbuka (tidak dibatasi periode), nilai × peluang.
  const openAll = await execute<{ stage: string; estimated_value: number; probability: number }>(
    "SELECT stage, estimated_value, probability FROM crm_leads WHERE workspace_id = ? AND status = 'open' AND stage NOT IN ('won','lost') LIMIT 20000",
    [ws],
  );
  const byStage = FLOW.slice(0, -1).map((id) => {
    const rows = openAll.filter((l) => l.stage === id);
    return {
      id,
      count: rows.length,
      value: rows.reduce((s, l) => s + num(l.estimated_value), 0),
      weighted: Math.round(
        rows.reduce(
          (s, l) => s + num(l.estimated_value) * ((num(l.probability) || prob(id)) / 100),
          0,
        ),
      ),
    };
  });

  // Realisasi bulan ini (WIB): closing dan invoice lunas dibandingkan target.
  const month = jakartaToday().slice(0, 7);
  const wonMonth = await execute<{ owner_name: string | null; v: number; n: number }>(
    `SELECT owner_name, COALESCE(SUM(estimated_value),0) AS v, COUNT(*) AS n FROM crm_leads
      WHERE workspace_id = ? AND status = 'won'
        AND DATE_FORMAT(CONVERT_TZ(stage_changed_at, '+00:00', '+07:00'), '%Y-%m') = ? GROUP BY owner_name`,
    [ws, month],
  );
  const targets = await execute<{ owner_name: string; target_amount: number }>(
    "SELECT owner_name, target_amount FROM crm_targets WHERE workspace_id = ? AND DATE_FORMAT(period_month, '%Y-%m') = ?",
    [ws, month],
  );
  const owners = new Set([
    ...targets.map((t) => t.owner_name),
    ...wonMonth.map((w) => w.owner_name ?? ""),
  ]);
  const targetRows = [...owners].map((o) => {
    const t = num(targets.find((x) => x.owner_name === o)?.target_amount);
    const w = wonMonth.find((x) => (x.owner_name ?? "") === o);
    return {
      owner: o || null,
      target: t,
      won: num(w?.v),
      deals: num(w?.n),
      pct: pct(num(w?.v), t),
    };
  });
  let invoices = { paid: 0, outstanding: 0, overdue: 0 };
  try {
    const inv = await execute<{ paid: number; outstanding: number; overdue: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN status='paid' AND DATE_FORMAT(CONVERT_TZ(paid_at,'+00:00','+07:00'),'%Y-%m') = ? THEN total END),0) AS paid,
         COALESCE(SUM(CASE WHEN status='unpaid' THEN total END),0) AS outstanding,
         COALESCE(SUM(CASE WHEN status='unpaid' AND due_date IS NOT NULL AND due_date < ? THEN total END),0) AS overdue
       FROM crm_invoices WHERE workspace_id = ?`,
      [month, jakartaToday(), ws],
    );
    invoices = {
      paid: num(inv[0]?.paid),
      outstanding: num(inv[0]?.outstanding),
      overdue: num(inv[0]?.overdue),
    };
  } catch {
    /* tabel invoice belum ada (migrasi belum jalan) */
  }

  return {
    days,
    totals: {
      leads: leads.length,
      won: won.length,
      lost: lost.length,
      open: open.length,
      winRate: pct(won.length, leads.length),
      wonValue: won.reduce((s, l) => s + num(l.estimated_value), 0),
      avgDaysToClose: avgDays,
    },
    stages,
    lostReasons,
    bySource: group((l) => l.source || "—"),
    byOwner: group((l) => l.owner_name || "—"),
    forecast: {
      byStage,
      pipeline: byStage.reduce((s, r) => s + r.value, 0),
      weighted: byStage.reduce((s, r) => s + r.weighted, 0),
    },
    month: { period: month, targets: targetRows, invoices },
  };
}
