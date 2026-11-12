/**
 * XPro — progres tahapan & proyek dihitung dari tugas (server-only).
 *  - Tahapan dengan tugas: progres = rata-rata tertimbang estimasi jam (tanpa estimasi = bobot 1);
 *    tugas selesai (completed_at) = 100%. progress_auto = 1. Tanpa tugas: progres manual dipertahankan.
 *  - Proyek: Σ(bobot × progres tahapan)/Σ(bobot) (bobot 0 semua → rata-rata); tanpa tahapan →
 *    rata-rata tertimbang tugas proyek di luar backlog. Disimpan di prj_projects.progress_pct.
 */
import { execute, executeOne } from "@/integrations/mysql/pool";

const TASK_W = "CASE WHEN estimate_hours > 0 THEN estimate_hours ELSE 1 END";
const TASK_P =
  "CASE WHEN completed_at IS NOT NULL THEN 100 ELSE LEAST(100, GREATEST(0, progress_pct)) END";

export async function recalcMilestone(milestoneId: string | null | undefined) {
  if (!milestoneId) return;
  const r = await executeOne<{ n: number; prog: number | null }>(
    `SELECT COUNT(*) AS n, SUM(${TASK_W} * ${TASK_P}) / NULLIF(SUM(${TASK_W}), 0) AS prog
       FROM prj_tasks WHERE milestone_id = ?`,
    [milestoneId],
  );
  if (!Number(r?.n ?? 0)) {
    await execute("UPDATE prj_milestones SET progress_auto = 0 WHERE id = ?", [milestoneId]);
    return;
  }
  const prog = Math.round(Number(r?.prog ?? 0) * 100) / 100;
  await execute(
    `UPDATE prj_milestones
        SET progress_pct = ?, progress_auto = 1,
            status = CASE WHEN ? >= 100 THEN 'done' WHEN ? > 0 THEN 'in_progress'
                          WHEN status = 'done' THEN 'in_progress' ELSE status END
      WHERE id = ?`,
    [prog, prog, prog, milestoneId],
  );
}

export async function recalcProject(projectId: string | null | undefined) {
  if (!projectId) return;
  const ms = await executeOne<{
    n: number;
    wsum: number | null;
    wprog: number | null;
    avg: number | null;
  }>(
    `SELECT COUNT(*) AS n, SUM(weight_pct) AS wsum, SUM(weight_pct * progress_pct) AS wprog,
            AVG(progress_pct) AS avg
       FROM prj_milestones WHERE project_id = ?`,
    [projectId],
  );
  let prog = 0;
  if (Number(ms?.n ?? 0) > 0) {
    const wsum = Number(ms?.wsum ?? 0);
    prog = wsum > 0 ? Number(ms?.wprog ?? 0) / wsum : Number(ms?.avg ?? 0);
  } else {
    const t = await executeOne<{ prog: number | null }>(
      `SELECT SUM(${TASK_W} * ${TASK_P}) / NULLIF(SUM(${TASK_W}), 0) AS prog
         FROM prj_tasks WHERE project_id = ? AND backlog = 0`,
      [projectId],
    );
    prog = Number(t?.prog ?? 0);
  }
  await execute("UPDATE prj_projects SET progress_pct = ? WHERE id = ?", [
    Math.round(prog * 100) / 100,
    projectId,
  ]);
}

/** Hitung ulang tahapan & proyek yang terdampak perubahan tugas (sebelum & sesudah). */
export async function recalcAfterTaskChange(
  before: { milestone_id?: unknown; project_id?: unknown } | null,
  after: { milestone_id?: unknown; project_id?: unknown } | null,
) {
  const ms = new Set([before?.milestone_id, after?.milestone_id].filter(Boolean).map(String));
  const ps = new Set([before?.project_id, after?.project_id].filter(Boolean).map(String));
  for (const m of ms) await recalcMilestone(m);
  for (const p of ps) await recalcProject(p);
}

/** Setelah tahapan diubah/dihapus: tahapan bertugas tetap otomatis, lalu proyek. */
export async function recalcAfterMilestoneChange(milestoneId: string | null, projectId: unknown) {
  if (milestoneId) await recalcMilestone(milestoneId);
  if (projectId) await recalcProject(String(projectId));
}
