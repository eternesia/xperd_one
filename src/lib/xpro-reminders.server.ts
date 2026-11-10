/**
 * Pengingat tugas XPro (dijalankan scheduler tiap jam; aman diulang karena dedupe).
 *  - In-app (selalu): "Tenggat besok", "Tenggat hari ini", "Terlambat" per tugas per PIC.
 *    Kunci dedupe memuat tanggal tenggat, jadi tiap kejadian muncul sekali (tenggat diubah → muncul lagi).
 *  - Email (bila gateway aktif & preferensi tenant `xpro_task_digest` tidak dimatikan): satu ringkasan
 *    per PIC per workspace per hari, mulai pukul 07.00 WIB.
 * Hanya workspace yang tenant-nya punya add-on XPro aktif/trial.
 */
import { execute } from "@/integrations/mysql/pool";

import { pushNotification, taskLink } from "./xpro-tasks.server";

interface DueRow {
  task_id: string;
  task_name: string;
  due_date: string;
  workspace_id: string;
  workspace_name: string;
  tenant_id: string;
  project_code: string | null;
  user_id: string;
  email: string;
  user_name: string;
}

const jakartaNow = () => new Date(Date.now() + 7 * 3600_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const xperdOrigin = () =>
  (process.env.XPERD_PUBLIC_URL || process.env.PUBLIC_XPERD_URL || "https://xperd.id").replace(
    /\/$/,
    "",
  );

export async function runXproTaskReminders(): Promise<{ inApp: number; emails: number }> {
  const now = jakartaNow();
  if (now.getUTCHours() < 7) return { inApp: 0, emails: 0 };
  const today = iso(now);
  const tomorrow = iso(new Date(now.getTime() + 86_400_000));

  const rows = await execute<DueRow>(
    `SELECT t.id AS task_id, t.name AS task_name, t.due_date, t.workspace_id, w.name AS workspace_name,
            w.tenant_id, p.code AS project_code, u.id AS user_id, u.email,
            COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) AS user_name
       FROM prj_tasks t
       JOIN workspaces w ON w.id = t.workspace_id
       JOIN tenant_addons ta ON ta.tenant_id = w.tenant_id AND ta.status IN ('active','trial')
       JOIN addons ad ON ad.id = ta.addon_id AND ad.code = 'xpro'
       JOIN prj_task_assignees a ON a.task_id = t.id AND a.user_id IS NOT NULL
       JOIN app_users u ON u.id = a.user_id AND u.is_active = 1
       JOIN workspace_members wm ON wm.workspace_id = t.workspace_id AND wm.user_id = u.id
       LEFT JOIN prj_projects p ON p.id = t.project_id
      WHERE t.due_date IS NOT NULL AND t.due_date <= ? AND t.completed_at IS NULL AND t.backlog = 0
        AND NOT EXISTS (SELECT 1 FROM prj_board_columns c
                         WHERE c.project_id = t.project_id AND c.\`key\` = t.status AND c.is_done = 1)
        AND NOT (t.status = 'done' AND NOT EXISTS (SELECT 1 FROM prj_board_columns c2
                                                    WHERE c2.project_id = t.project_id))
      ORDER BY t.due_date
      LIMIT 5000`,
    [tomorrow],
  );

  let inApp = 0;
  const digests = new Map<
    string,
    {
      row: DueRow;
      overdue: { name: string; detail: string }[];
      dueToday: { name: string; detail: string }[];
      dueTomorrow: { name: string; detail: string }[];
    }
  >();

  for (const r of rows) {
    const due = String(r.due_date).slice(0, 10);
    const kind = due < today ? "xpro_late" : due === today ? "xpro_today" : "xpro_due";
    const title =
      kind === "xpro_late"
        ? `Terlambat: ${r.task_name}`
        : kind === "xpro_today"
          ? `Tenggat hari ini: ${r.task_name}`
          : `Tenggat besok: ${r.task_name}`;
    const fresh = await pushNotification({
      workspaceId: r.workspace_id,
      userId: r.user_id,
      kind,
      title,
      body: `${r.project_code ?? "Internal"} · tenggat ${due}`,
      link: taskLink(r.workspace_id, r.task_id),
      dedupe: `${kind}:${r.task_id}:${r.user_id}:${due}`,
    });
    if (fresh) inApp += 1;

    const k = `${r.workspace_id}:${r.user_id}`;
    const d = digests.get(k) ?? { row: r, overdue: [], dueToday: [], dueTomorrow: [] };
    const item = { name: r.task_name, detail: `${r.project_code ?? "Internal"} · tenggat ${due}` };
    (kind === "xpro_late" ? d.overdue : kind === "xpro_today" ? d.dueToday : d.dueTomorrow).push(
      item,
    );
    digests.set(k, d);
  }

  let emails = 0;
  if (!digests.size) return { inApp, emails };
  const { loadGateway, PLATFORM_SCOPE } = await import("./email-gateway.server");
  const g = await loadGateway(PLATFORM_SCOPE);
  if (!g?.enabled) return { inApp, emails };
  const { deliver, isEnabled } = await import("./billing-notifications.server");
  const { xproTaskDigestEmail } = await import("./billing-email-templates");
  const enabledCache = new Map<string, boolean>();
  for (const d of digests.values()) {
    const r = d.row;
    if (!enabledCache.has(r.tenant_id))
      enabledCache.set(r.tenant_id, await isEnabled(r.tenant_id, "xpro_task_digest"));
    if (!enabledCache.get(r.tenant_id)) continue;
    const res = await deliver(g, {
      tenantId: r.tenant_id,
      workspaceId: r.workspace_id,
      kind: "xpro_task_digest",
      dedupe: `xprodigest:${r.workspace_id}:${r.user_id}:${today}`,
      to: r.email,
      mail: xproTaskDigestEmail({
        name: r.user_name,
        workspaceName: r.workspace_name,
        overdue: d.overdue,
        dueToday: d.dueToday,
        dueTomorrow: d.dueTomorrow,
        url: `${xperdOrigin()}/app/w/${r.workspace_id}/xpro/my-tasks`,
      }),
    });
    if (res === "sent") emails += 1;
  }
  return { inApp, emails };
}
