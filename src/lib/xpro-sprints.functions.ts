/**
 * XPro Backlog & Sprint (ala Jira). Semua perubahan khusus pengelola (owner/admin/pemilik tenant).
 *  - Sprint dibuat "planned"; tugas dipindah dari backlog ke sprint.
 *  - Mulai sprint: tetapkan tanggal mulai & selesai → status "active", semua tugasnya keluar dari backlog
 *    (tampil di Kanban tim), tenggat yang kosong diisi tanggal selesai sprint, PIC diberi notifikasi.
 *  - Selesaikan sprint: tugas yang belum selesai kembali ke backlog atau pindah ke sprint lain.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export interface XproSprint {
  id: string;
  project_id: string | null;
  name: string;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "planned" | "active" | "completed";
  completed_at: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : null);

async function managerOnly(workspaceId: string, userId: string) {
  const { xproAccess } = await import("@/lib/xpro-tasks.server");
  const a = await xproAccess(workspaceId, userId);
  if (!a.member) throw new Error("Forbidden");
  return a;
}

async function requireManager(workspaceId: string, userId: string) {
  const a = await managerOnly(workspaceId, userId);
  if (!a.manager) throw new Error("Hanya PM/pengelola yang dapat mengatur backlog dan sprint.");
}

async function loadSprint(workspaceId: string, id: string) {
  const { executeOne } = await import("@/integrations/mysql/pool");
  const s = await executeOne<XproSprint>(
    "SELECT * FROM prj_sprints WHERE id = ? AND workspace_id = ?",
    [id, workspaceId],
  );
  if (!s) throw new Error("Sprint tidak ditemukan.");
  return s;
}

export const listXproSprints = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (input: unknown) =>
      input as { workspaceId: string; projectId?: string; includeCompleted?: boolean },
  )
  .handler(async ({ data, context }) => {
    await managerOnly(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const where = ["workspace_id = ?"];
    const params: unknown[] = [data.workspaceId];
    if (data.projectId === "__none") where.push("project_id IS NULL");
    else if (data.projectId) {
      where.push("project_id = ?");
      params.push(data.projectId);
    }
    if (!data.includeCompleted) where.push("status <> 'completed'");
    const rows = await execute<XproSprint>(
      `SELECT * FROM prj_sprints WHERE ${where.join(" AND ")}
        ORDER BY FIELD(status, 'active', 'planned', 'completed'), COALESCE(start_date, '9999-12-31'), created_at
        LIMIT 200`,
      params,
    );
    return rows.map<XproSprint>((s) => ({
      id: s.id,
      project_id: s.project_id ?? null,
      name: s.name,
      goal: s.goal ?? null,
      start_date: d10(s.start_date),
      end_date: d10(s.end_date),
      status: s.status,
      completed_at: s.completed_at ? String(s.completed_at) : null,
    }));
  });

export const saveXproSprint = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (input: unknown) =>
      input as {
        workspaceId: string;
        id?: string;
        projectId?: string | null;
        name: string;
        goal?: string | null;
        start_date?: string | null;
        end_date?: string | null;
      },
  )
  .handler(async ({ data, context }) => {
    await requireManager(data.workspaceId, context.userId);
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const name = String(data.name ?? "")
      .trim()
      .slice(0, 120);
    if (!name) throw new Error("Nama sprint wajib diisi.");
    const start = data.start_date || null;
    const end = data.end_date || null;
    for (const v of [start, end])
      if (v && !DATE_RE.test(v)) throw new Error("Format tanggal tidak valid.");
    if (start && end && end < start)
      throw new Error("Tanggal selesai harus setelah tanggal mulai.");
    const goal = data.goal ? String(data.goal).slice(0, 5000) : null;
    if (data.id) {
      await loadSprint(data.workspaceId, data.id);
      await execute(
        "UPDATE prj_sprints SET name = ?, goal = ?, start_date = ?, end_date = ? WHERE id = ? AND workspace_id = ?",
        [name, goal, start, end, data.id, data.workspaceId],
      );
      return { id: data.id };
    }
    const projectId = data.projectId && data.projectId !== "__none" ? data.projectId : null;
    if (projectId) {
      const p = await executeOne("SELECT id FROM prj_projects WHERE id = ? AND workspace_id = ?", [
        projectId,
        data.workspaceId,
      ]);
      if (!p) throw new Error("Proyek tidak ditemukan.");
    }
    const id = uuid();
    await execute(
      `INSERT INTO prj_sprints (id, workspace_id, project_id, name, goal, start_date, end_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.workspaceId, projectId, name, goal, start, end, context.userId],
    );
    return { id };
  });

export const startXproSprint = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (input: unknown) =>
      input as {
        workspaceId: string;
        sprintId: string;
        start_date: string;
        end_date: string;
        goal?: string | null;
      },
  )
  .handler(async ({ data, context }) => {
    await requireManager(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const { pushNotification, taskLink } = await import("@/lib/xpro-tasks.server");
    const sprint = await loadSprint(data.workspaceId, data.sprintId);
    if (sprint.status !== "planned") throw new Error("Sprint ini sudah dimulai atau selesai.");
    if (!DATE_RE.test(data.start_date) || !DATE_RE.test(data.end_date))
      throw new Error("Isi tanggal mulai dan selesai sprint.");
    if (data.end_date < data.start_date)
      throw new Error("Tanggal selesai harus setelah tanggal mulai.");
    await execute(
      `UPDATE prj_sprints SET status = 'active', start_date = ?, end_date = ?, goal = COALESCE(?, goal)
        WHERE id = ? AND workspace_id = ?`,
      [data.start_date, data.end_date, data.goal || null, sprint.id, data.workspaceId],
    );
    // Tugas sprint keluar dari backlog → tampil di Kanban; tenggat kosong = akhir sprint.
    await execute(
      `UPDATE prj_tasks
          SET backlog = 0,
              start_date = COALESCE(start_date, ?),
              due_date = COALESCE(due_date, ?)
        WHERE sprint_id = ? AND workspace_id = ?`,
      [data.start_date, data.end_date, sprint.id, data.workspaceId],
    );
    const rows = await execute<{ user_id: string; n: number; first_task: string }>(
      `SELECT a.user_id, COUNT(*) AS n, MIN(t.id) AS first_task
         FROM prj_tasks t JOIN prj_task_assignees a ON a.task_id = t.id AND a.user_id IS NOT NULL
        WHERE t.sprint_id = ? AND t.workspace_id = ? AND t.completed_at IS NULL
        GROUP BY a.user_id`,
      [sprint.id, data.workspaceId],
    );
    for (const r of rows) {
      if (r.user_id === context.userId) continue;
      await pushNotification({
        workspaceId: data.workspaceId,
        userId: r.user_id,
        kind: "xpro_assigned",
        title: `Sprint dimulai: ${sprint.name}`,
        body: `${Number(r.n)} tugas untuk Anda · selesai ${data.end_date}`,
        link:
          Number(r.n) === 1
            ? taskLink(data.workspaceId, r.first_task)
            : `/app/w/${data.workspaceId}/xpro/my-tasks`,
        dedupe: `sprint_start:${sprint.id}:${r.user_id}`,
      });
    }
    return { ok: true };
  });

export const completeXproSprint = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (input: unknown) =>
      input as { workspaceId: string; sprintId: string; moveTo: "backlog" | string },
  )
  .handler(async ({ data, context }) => {
    await requireManager(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const sprint = await loadSprint(data.workspaceId, data.sprintId);
    if (sprint.status !== "active")
      throw new Error("Hanya sprint yang sedang berjalan yang dapat diselesaikan.");
    let target: XproSprint | null = null;
    if (data.moveTo && data.moveTo !== "backlog") {
      target = await loadSprint(data.workspaceId, data.moveTo);
      if (target.status === "completed" || target.id === sprint.id)
        throw new Error("Sprint tujuan tidak valid.");
    }
    // Tugas belum selesai: ke backlog, atau ke sprint lain (langsung aktif bila sprint itu berjalan).
    await execute(
      `UPDATE prj_tasks SET sprint_id = ?, backlog = ?
        WHERE sprint_id = ? AND workspace_id = ? AND completed_at IS NULL`,
      [target?.id ?? null, target?.status === "active" ? 0 : 1, sprint.id, data.workspaceId],
    );
    await execute(
      "UPDATE prj_sprints SET status = 'completed', completed_at = UTC_TIMESTAMP(6) WHERE id = ?",
      [sprint.id],
    );
    return { ok: true };
  });

export const deleteXproSprint = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as { workspaceId: string; sprintId: string })
  .handler(async ({ data, context }) => {
    await requireManager(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const sprint = await loadSprint(data.workspaceId, data.sprintId);
    if (sprint.status === "active")
      throw new Error("Selesaikan sprint yang berjalan, bukan dihapus.");
    // Tugas yang belum selesai kembali ke backlog; FK melepas sprint_id.
    await execute(
      "UPDATE prj_tasks SET backlog = 1 WHERE sprint_id = ? AND workspace_id = ? AND completed_at IS NULL",
      [sprint.id, data.workspaceId],
    );
    await execute("DELETE FROM prj_sprints WHERE id = ? AND workspace_id = ?", [
      sprint.id,
      data.workspaceId,
    ]);
    return { ok: true };
  });

/** Pindahkan tugas: ke sprint (sprintId), ke backlog (sprintId null), atau "mulai sekarang" (start). */
export const moveXproTasks = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (input: unknown) =>
      input as {
        workspaceId: string;
        taskIds: string[];
        sprintId?: string | null;
        start?: boolean;
        dueDate?: string | null;
      },
  )
  .handler(async ({ data, context }) => {
    await requireManager(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const ids = (data.taskIds ?? []).slice(0, 500);
    if (!ids.length) return { ok: true };
    const ph = ids.map(() => "?").join(",");
    if (data.start) {
      if (data.dueDate && !DATE_RE.test(data.dueDate))
        throw new Error("Format tanggal tidak valid.");
      await execute(
        `UPDATE prj_tasks SET backlog = 0, sprint_id = NULL,
                start_date = COALESCE(start_date, CURDATE()), due_date = COALESCE(?, due_date)
          WHERE workspace_id = ? AND id IN (${ph})`,
        [data.dueDate || null, data.workspaceId, ...ids],
      );
      const { pushNotification, taskLink } = await import("@/lib/xpro-tasks.server");
      const rows = await execute<{ task_id: string; name: string; user_id: string }>(
        `SELECT t.id AS task_id, t.name, a.user_id FROM prj_tasks t
           JOIN prj_task_assignees a ON a.task_id = t.id AND a.user_id IS NOT NULL
          WHERE t.workspace_id = ? AND t.id IN (${ph})`,
        [data.workspaceId, ...ids],
      );
      for (const r of rows) {
        if (r.user_id === context.userId) continue;
        await pushNotification({
          workspaceId: data.workspaceId,
          userId: r.user_id,
          kind: "xpro_assigned",
          title: `Tugas dimulai: ${r.name}`,
          body: "Tugas dipindah dari backlog ke papan tim.",
          link: taskLink(data.workspaceId, r.task_id),
          dedupe: `task_start:${r.task_id}:${r.user_id}`,
        });
      }
      return { ok: true };
    }
    if (data.sprintId) {
      const sp = await loadSprint(data.workspaceId, data.sprintId);
      if (sp.status === "completed") throw new Error("Sprint sudah selesai.");
      await execute(
        `UPDATE prj_tasks SET sprint_id = ?, backlog = ?,
                due_date = CASE WHEN ? = 'active' THEN COALESCE(due_date, ?) ELSE due_date END
          WHERE workspace_id = ? AND id IN (${ph})`,
        [sp.id, sp.status === "active" ? 0 : 1, sp.status, sp.end_date, data.workspaceId, ...ids],
      );
      return { ok: true };
    }
    await execute(
      `UPDATE prj_tasks SET sprint_id = NULL, backlog = 1 WHERE workspace_id = ? AND id IN (${ph}) AND completed_at IS NULL`,
      [data.workspaceId, ...ids],
    );
    return { ok: true };
  });
