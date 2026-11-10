/**
 * Server functions XPro tugas v2: Tugas Saya, detail tugas (multi-PIC, checklist, komentar),
 * kapasitas beban kerja, dan notifikasi in-app. Hak akses ditegakkan di server
 * (lihat xpro-tasks.server.ts).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/integrations/mysql/auth-middleware";

export interface XproAssignee {
  user_id: string | null;
  name: string;
}

export interface XproTask {
  id: string;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  milestone_id: string | null;
  name: string;
  description: string | null;
  start_date: string | null;
  due_date: string | null;
  progress_pct: number;
  status: string;
  is_done: boolean;
  priority: string;
  estimate_hours: number | null;
  completed_at: string | null;
  created_by: string | null;
  updated_at: string | null;
  assignees: XproAssignee[];
  checklist_total: number;
  checklist_done: number;
  comment_count: number;
}

export interface XproPerson {
  user_id: string;
  name: string;
  email: string;
  role: string;
  hours_per_week: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const toDate = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).slice(0, 10);
  if (!DATE_RE.test(s)) throw new Error("Format tanggal tidak valid.");
  return s;
};
const ymd = (v: unknown) =>
  v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null;

async function ctx(workspaceId: string, userId: string) {
  const { xproAccess } = await import("@/lib/xpro-tasks.server");
  const access = await xproAccess(workspaceId, userId);
  if (!access.member) throw new Error("Forbidden");
  return access;
}

/* ------------------------------ orang & kapasitas ------------------------------ */

export const getXproPeople = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as { workspaceId: string })
  .handler(async ({ data, context }) => {
    const access = await ctx(data.workspaceId, context.userId);
    const { workspacePeople } = await import("@/lib/xpro-tasks.server");
    const { execute } = await import("@/integrations/mysql/pool");
    const people = await workspacePeople(data.workspaceId);
    const caps = await execute<{ user_id: string; hours_per_week: number }>(
      "SELECT user_id, hours_per_week FROM prj_capacity WHERE workspace_id = ?",
      [data.workspaceId],
    );
    const capMap = new Map(caps.map((c) => [c.user_id, Number(c.hours_per_week)]));
    return {
      me: context.userId,
      manager: access.manager,
      writer: access.writer,
      people: people.map<XproPerson>((p) => ({
        ...p,
        hours_per_week: capMap.get(p.user_id) ?? 40,
      })),
    };
  });

export const setXproCapacity = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as { workspaceId: string; userId: string; hours: number })
  .handler(async ({ data, context }) => {
    const access = await ctx(data.workspaceId, context.userId);
    if (!access.manager) throw new Error("Hanya pengelola yang dapat mengatur kapasitas.");
    const hours = Number(data.hours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 168)
      throw new Error("Kapasitas 0–168 jam/minggu.");
    const { execute } = await import("@/integrations/mysql/pool");
    await execute(
      `INSERT INTO prj_capacity (workspace_id, user_id, hours_per_week) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE hours_per_week = VALUES(hours_per_week)`,
      [data.workspaceId, data.userId, hours],
    );
    return { ok: true };
  });

/* ------------------------------ daftar tugas ------------------------------ */

export const listXproTasks = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (input: unknown) =>
      input as { workspaceId: string; scope?: "mine" | "all"; doneDays?: number; ids?: string[] },
  )
  .handler(async ({ data, context }) => {
    const access = await ctx(data.workspaceId, context.userId);
    const { execute } = await import("@/integrations/mysql/pool");
    const mine = data.scope !== "all" || !access.manager;
    const where = ["t.workspace_id = ?"];
    const params: unknown[] = [data.workspaceId];
    if (mine) {
      where.push(
        "(t.created_by = ? OR EXISTS (SELECT 1 FROM prj_task_assignees a WHERE a.task_id = t.id AND a.user_id = ?))",
      );
      params.push(context.userId, context.userId);
    }
    if (data.ids?.length) {
      where.push(`t.id IN (${data.ids.map(() => "?").join(",")})`);
      params.push(...data.ids);
    }
    // Tugas selesai hanya yang selesai dalam N hari terakhir (default 30) agar daftar tetap ringan.
    const doneDays = Math.max(0, Math.min(365, Number(data.doneDays ?? 30)));
    const rows = await execute<Record<string, unknown>>(
      `SELECT * FROM (
         SELECT t.*, p.code AS project_code, p.name AS project_name,
           CASE WHEN EXISTS (SELECT 1 FROM prj_board_columns c
                              WHERE c.project_id = t.project_id AND c.\`key\` = t.status AND c.is_done = 1)
                  OR (t.status = 'done' AND NOT EXISTS (SELECT 1 FROM prj_board_columns c2
                                                         WHERE c2.project_id = t.project_id))
                THEN 1 ELSE 0 END AS is_done,
           (SELECT COUNT(*) FROM prj_task_checklist k WHERE k.task_id = t.id) AS checklist_total,
           (SELECT COUNT(*) FROM prj_task_checklist k WHERE k.task_id = t.id AND k.is_done = 1) AS checklist_done,
           (SELECT COUNT(*) FROM prj_task_comments m WHERE m.task_id = t.id) AS comment_count
         FROM prj_tasks t LEFT JOIN prj_projects p ON p.id = t.project_id
        WHERE ${where.join(" AND ")}
       ) x
       WHERE x.is_done = 0 OR COALESCE(x.completed_at, x.updated_at) >= UTC_TIMESTAMP() - INTERVAL ? DAY
       ORDER BY x.is_done, x.due_date IS NULL, x.due_date, x.created_at
       LIMIT 2000`,
      [...params, doneDays],
    );
    const ids = rows.map((r) => String(r.id));
    const assignees = ids.length
      ? await execute<{ task_id: string; user_id: string | null; name: string }>(
          `SELECT task_id, user_id, name FROM prj_task_assignees
            WHERE task_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at`,
          ids,
        )
      : [];
    const byTask = new Map<string, XproAssignee[]>();
    for (const a of assignees) {
      const list = byTask.get(a.task_id) ?? [];
      list.push({ user_id: a.user_id, name: a.name });
      byTask.set(a.task_id, list);
    }
    const tasks: XproTask[] = rows.map((r) => ({
      id: String(r.id),
      project_id: (r.project_id as string) ?? null,
      project_code: (r.project_code as string) ?? null,
      project_name: (r.project_name as string) ?? null,
      milestone_id: (r.milestone_id as string) ?? null,
      name: String(r.name),
      description: (r.description as string) ?? null,
      start_date: ymd(r.start_date),
      due_date: ymd(r.due_date),
      progress_pct: Number(r.progress_pct ?? 0),
      status: String(r.status ?? "todo"),
      is_done: Number(r.is_done) === 1,
      priority: String(r.priority ?? "medium"),
      estimate_hours:
        r.estimate_hours === null || r.estimate_hours === undefined
          ? null
          : Number(r.estimate_hours),
      completed_at: r.completed_at ? String(r.completed_at) : null,
      created_by: (r.created_by as string) ?? null,
      updated_at: r.updated_at ? String(r.updated_at) : null,
      assignees: byTask.get(String(r.id)) ?? [],
      checklist_total: Number(r.checklist_total ?? 0),
      checklist_done: Number(r.checklist_done ?? 0),
      comment_count: Number(r.comment_count ?? 0),
    }));
    return { tasks, manager: access.manager };
  });

/* ------------------------------ detail tugas ------------------------------ */

export const getXproTask = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as { workspaceId: string; taskId: string })
  .handler(async ({ data, context }) => {
    const access = await ctx(data.workspaceId, context.userId);
    const { loadTask, taskPermission } = await import("@/lib/xpro-tasks.server");
    const { execute } = await import("@/integrations/mysql/pool");
    const task = await loadTask(data.workspaceId, data.taskId);
    if (!task) throw new Error("Tugas tidak ditemukan.");
    const perm = await taskPermission(access, task, context.userId);
    if (perm === "none") throw new Error("Forbidden");
    const [checklist, comments] = await Promise.all([
      execute<{ id: string; title: string; is_done: number; sort_order: number }>(
        "SELECT id, title, is_done, sort_order FROM prj_task_checklist WHERE task_id = ? ORDER BY sort_order, created_at",
        [task.id],
      ),
      execute<{
        id: string;
        user_id: string | null;
        author_name: string;
        body: string;
        created_at: string;
      }>(
        "SELECT id, user_id, author_name, body, created_at FROM prj_task_comments WHERE task_id = ? ORDER BY created_at",
        [task.id],
      ),
    ]);
    return {
      perm,
      checklist: checklist.map((c) => ({ ...c, is_done: Number(c.is_done) === 1 })),
      comments: comments.map((c) => ({ ...c, created_at: String(c.created_at) })),
    };
  });

export interface SaveXproTaskInput {
  workspaceId: string;
  id?: string;
  fields: {
    name?: string;
    description?: string | null;
    project_id?: string | null;
    milestone_id?: string | null;
    start_date?: string | null;
    due_date?: string | null;
    progress_pct?: number;
    status?: string;
    priority?: string;
    estimate_hours?: number | null;
  };
  assigneeIds?: string[];
}

export const saveXproTask = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as SaveXproTaskInput)
  .handler(async ({ data, context }) => {
    const access = await ctx(data.workspaceId, context.userId);
    const srv = await import("@/lib/xpro-tasks.server");
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const f = data.fields ?? {};

    let perm: "full" | "work" | "none" = "full";
    let existing: Awaited<ReturnType<typeof srv.loadTask>> = null;
    if (data.id) {
      existing = await srv.loadTask(data.workspaceId, data.id);
      if (!existing) throw new Error("Tugas tidak ditemukan.");
      perm = await srv.taskPermission(access, existing, context.userId);
      if (perm === "none") throw new Error("Forbidden");
    } else if (!access.writer) {
      throw new Error("Anda tidak punya hak membuat tugas.");
    }

    const patch: Record<string, unknown> = {};
    if (f.status !== undefined) patch.status = String(f.status).slice(0, 40) || "todo";
    if (f.progress_pct !== undefined) {
      patch.progress_pct = Math.max(0, Math.min(100, Math.round(Number(f.progress_pct) || 0)));
    }
    if (perm === "full") {
      if (f.name !== undefined) {
        const name = String(f.name).trim();
        if (!name) throw new Error("Nama tugas wajib diisi.");
        patch.name = name.slice(0, 255);
      }
      if (f.description !== undefined)
        patch.description = f.description ? String(f.description).slice(0, 20000) : null;
      if (f.priority !== undefined) {
        if (!(srv.PRIORITIES as readonly string[]).includes(String(f.priority)))
          throw new Error("Prioritas tidak valid.");
        patch.priority = f.priority;
      }
      if (f.estimate_hours !== undefined) {
        const h =
          f.estimate_hours === null || (f.estimate_hours as unknown) === ""
            ? null
            : Number(f.estimate_hours);
        if (h !== null && (!Number.isFinite(h) || h < 0 || h > 10000))
          throw new Error("Estimasi jam tidak valid.");
        patch.estimate_hours = h;
      }
      if (f.start_date !== undefined) patch.start_date = toDate(f.start_date);
      if (f.due_date !== undefined) patch.due_date = toDate(f.due_date);
      if (f.project_id !== undefined) {
        if (f.project_id) {
          const p = await executeOne(
            "SELECT id FROM prj_projects WHERE id = ? AND workspace_id = ?",
            [f.project_id, data.workspaceId],
          );
          if (!p) throw new Error("Proyek tidak ditemukan.");
        }
        patch.project_id = f.project_id || null;
        if (!f.project_id) patch.milestone_id = null;
      }
      if (f.milestone_id !== undefined && patch.milestone_id === undefined) {
        const projectId =
          (patch.project_id as string | null | undefined) ?? existing?.project_id ?? null;
        if (f.milestone_id) {
          const m = await executeOne(
            "SELECT id FROM prj_milestones WHERE id = ? AND workspace_id = ? AND project_id <=> ?",
            [f.milestone_id, data.workspaceId, projectId],
          );
          if (!m) throw new Error("Tahapan tidak cocok dengan proyek.");
        }
        patch.milestone_id = f.milestone_id || null;
      }
    }

    let taskId = data.id;
    if (!taskId) {
      if (!patch.name) throw new Error("Nama tugas wajib diisi.");
      taskId = uuid();
      if (!patch.status) {
        const first = patch.project_id
          ? await executeOne<{ key: string }>(
              "SELECT `key` FROM prj_board_columns WHERE project_id = ? ORDER BY sort_order LIMIT 1",
              [patch.project_id],
            )
          : null;
        patch.status = first?.key ?? "todo";
      }
      const row: Record<string, unknown> = {
        id: taskId,
        workspace_id: data.workspaceId,
        created_by: context.userId,
        start_date: new Date().toISOString().slice(0, 10),
        ...patch,
      };
      const cols = Object.keys(row);
      await execute(
        `INSERT INTO prj_tasks (${cols.map((c) => `\`${c}\``).join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
        cols.map((c) => row[c]),
      );
    } else if (Object.keys(patch).length) {
      const cols = Object.keys(patch);
      await execute(
        `UPDATE prj_tasks SET ${cols.map((c) => `\`${c}\` = ?`).join(", ")} WHERE id = ? AND workspace_id = ?`,
        [...cols.map((c) => patch[c]), taskId, data.workspaceId],
      );
    }

    const task = (await srv.loadTask(data.workspaceId, taskId))!;
    if (perm === "full" && data.assigneeIds) {
      const added = await srv.setAssignees(data.workspaceId, taskId, data.assigneeIds);
      if (added.length) await srv.notifyAssigned(data.workspaceId, task, added, context.userId);
    }
    if ("status" in patch || "project_id" in patch) await srv.syncCompletion(task);
    return { id: taskId };
  });

export const deleteXproTask = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as { workspaceId: string; taskId: string })
  .handler(async ({ data, context }) => {
    const access = await ctx(data.workspaceId, context.userId);
    const { loadTask, taskPermission } = await import("@/lib/xpro-tasks.server");
    const { execute } = await import("@/integrations/mysql/pool");
    const task = await loadTask(data.workspaceId, data.taskId);
    if (!task) return { ok: true };
    if ((await taskPermission(access, task, context.userId)) !== "full")
      throw new Error("Forbidden");
    await execute("DELETE FROM prj_tasks WHERE id = ? AND workspace_id = ?", [
      task.id,
      data.workspaceId,
    ]);
    return { ok: true };
  });

/* ------------------------------ checklist & komentar ------------------------------ */

export const xproChecklist = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (input: unknown) =>
      input as {
        workspaceId: string;
        taskId: string;
        op: "add" | "toggle" | "rename" | "delete";
        id?: string;
        title?: string;
        done?: boolean;
      },
  )
  .handler(async ({ data, context }) => {
    const access = await ctx(data.workspaceId, context.userId);
    const { loadTask, taskPermission } = await import("@/lib/xpro-tasks.server");
    const { execute, executeOne, uuid } = await import("@/integrations/mysql/pool");
    const task = await loadTask(data.workspaceId, data.taskId);
    if (!task) throw new Error("Tugas tidak ditemukan.");
    const perm = await taskPermission(access, task, context.userId);
    if (perm === "none") throw new Error("Forbidden");
    // Pelaksana (PIC) boleh menambah & mencentang; ubah nama/hapus butuh hak penuh.
    if ((data.op === "rename" || data.op === "delete") && perm !== "full")
      throw new Error("Forbidden");
    if (data.op === "add") {
      const title = String(data.title ?? "")
        .trim()
        .slice(0, 500);
      if (!title) throw new Error("Isi item checklist.");
      const max = await executeOne<{ m: number | null }>(
        "SELECT MAX(sort_order) AS m FROM prj_task_checklist WHERE task_id = ?",
        [task.id],
      );
      await execute(
        "INSERT INTO prj_task_checklist (id, workspace_id, task_id, title, sort_order) VALUES (?, ?, ?, ?, ?)",
        [uuid(), data.workspaceId, task.id, title, Number(max?.m ?? -1) + 1],
      );
    } else if (data.op === "toggle") {
      await execute("UPDATE prj_task_checklist SET is_done = ? WHERE id = ? AND task_id = ?", [
        data.done ? 1 : 0,
        data.id,
        task.id,
      ]);
    } else if (data.op === "rename") {
      const title = String(data.title ?? "")
        .trim()
        .slice(0, 500);
      if (!title) throw new Error("Isi item checklist.");
      await execute("UPDATE prj_task_checklist SET title = ? WHERE id = ? AND task_id = ?", [
        title,
        data.id,
        task.id,
      ]);
    } else {
      await execute("DELETE FROM prj_task_checklist WHERE id = ? AND task_id = ?", [
        data.id,
        task.id,
      ]);
    }
    return { ok: true };
  });

export const addXproComment = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as { workspaceId: string; taskId: string; body: string })
  .handler(async ({ data, context }) => {
    const access = await ctx(data.workspaceId, context.userId);
    const { loadTask, taskPermission, notifyComment } = await import("@/lib/xpro-tasks.server");
    const { execute, uuid } = await import("@/integrations/mysql/pool");
    const task = await loadTask(data.workspaceId, data.taskId);
    if (!task) throw new Error("Tugas tidak ditemukan.");
    if ((await taskPermission(access, task, context.userId)) === "none")
      throw new Error("Forbidden");
    const body = String(data.body ?? "")
      .trim()
      .slice(0, 5000);
    if (!body) throw new Error("Komentar kosong.");
    const author = context.user.fullName?.trim() || context.user.email;
    await execute(
      "INSERT INTO prj_task_comments (id, workspace_id, task_id, user_id, author_name, body) VALUES (?, ?, ?, ?, ?, ?)",
      [uuid(), data.workspaceId, task.id, context.userId, author, body],
    );
    await notifyComment(data.workspaceId, task, context.userId, body);
    return { ok: true };
  });

/* ------------------------------ notifikasi in-app ------------------------------ */

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export const listMyNotifications = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as { workspaceId: string })
  .handler(async ({ data, context }) => {
    await ctx(data.workspaceId, context.userId);
    const { execute, executeOne } = await import("@/integrations/mysql/pool");
    const items = await execute<AppNotification>(
      `SELECT id, kind, title, body, link, read_at, created_at FROM app_notifications
        WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 30`,
      [data.workspaceId, context.userId],
    );
    const unread = await executeOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM app_notifications WHERE workspace_id = ? AND user_id = ? AND read_at IS NULL",
      [data.workspaceId, context.userId],
    );
    return {
      unread: Number(unread?.c ?? 0),
      items: items.map((n) => ({
        ...n,
        read_at: n.read_at ? String(n.read_at) : null,
        created_at: String(n.created_at),
      })),
    };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => input as { workspaceId: string; ids: string[] | "all" })
  .handler(async ({ data, context }) => {
    await ctx(data.workspaceId, context.userId);
    const { markRead } = await import("@/lib/xpro-tasks.server");
    await markRead(
      data.workspaceId,
      context.userId,
      data.ids === "all" ? "all" : (data.ids ?? []).slice(0, 100),
    );
    return { ok: true };
  });
