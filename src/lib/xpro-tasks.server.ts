/**
 * XPro tugas v2 — logika server (hak akses, PIC, status selesai, notifikasi).
 * Server-only: jangan diimpor dari kode klien.
 *
 * Aturan akses (ditegakkan di server, bukan hanya di UI):
 *  - Pengelola (owner/admin workspace atau pemilik tenant): lihat & ubah semua tugas.
 *  - Anggota lain: lihat tugas yang ia PIC-i atau ia buat. Boleh membuat tugas (bila punya hak tulis),
 *    mengubah penuh tugas buatannya, dan pada tugas yang ia PIC-i boleh ubah status/progres,
 *    centang checklist, serta berkomentar.
 */
import { execute, executeOne, result, uuid } from "@/integrations/mysql/pool";

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Access {
  member: boolean;
  manager: boolean;
  writer: boolean;
}

export async function xproAccess(workspaceId: string, userId: string): Promise<Access> {
  const row = await executeOne<{ role: string | null; owner: number }>(
    `SELECT
       (SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ? LIMIT 1) AS role,
       (SELECT COUNT(*) FROM workspaces w JOIN tenants t ON t.id = w.tenant_id
         WHERE w.id = ? AND t.owner_id = ?) AS owner`,
    [workspaceId, userId, workspaceId, userId],
  );
  const role = row?.role ?? null;
  const owner = Number(row?.owner ?? 0) > 0;
  const manager = owner || role === "owner" || role === "admin";
  return {
    member: manager || role !== null,
    manager,
    writer: manager || role === "staff",
  };
}

/** Status kolom yang dianggap selesai untuk proyek tertentu (tanpa kolom kustom: "done"). */
export async function isDoneStatus(projectId: string | null, status: string): Promise<boolean> {
  if (status === "done") {
    if (!projectId) return true;
    const cols = await executeOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM prj_board_columns WHERE project_id = ?",
      [projectId],
    );
    if (!Number(cols?.c ?? 0)) return true;
  }
  if (!projectId) return false;
  const hit = await executeOne<{ c: number }>(
    "SELECT COUNT(*) AS c FROM prj_board_columns WHERE project_id = ? AND `key` = ? AND is_done = 1",
    [projectId, status],
  );
  return Number(hit?.c ?? 0) > 0;
}

export interface TaskRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  milestone_id: string | null;
  name: string;
  description: string | null;
  assignee: string | null;
  start_date: string | null;
  due_date: string | null;
  progress_pct: number;
  status: string;
  priority: string;
  estimate_hours: number | null;
  completed_at: string | null;
  created_by: string | null;
}

export async function loadTask(workspaceId: string, taskId: string) {
  return executeOne<TaskRow>("SELECT * FROM prj_tasks WHERE id = ? AND workspace_id = ?", [
    taskId,
    workspaceId,
  ]);
}

export async function isAssigned(taskId: string, userId: string) {
  const r = await executeOne<{ c: number }>(
    "SELECT COUNT(*) AS c FROM prj_task_assignees WHERE task_id = ? AND user_id = ?",
    [taskId, userId],
  );
  return Number(r?.c ?? 0) > 0;
}

/** Tingkat izin pengguna atas satu tugas. */
export async function taskPermission(
  access: Access,
  task: Pick<TaskRow, "id" | "created_by">,
  userId: string,
): Promise<"full" | "work" | "none"> {
  if (access.manager) return "full";
  if (!access.member) return "none";
  if (access.writer && task.created_by === userId) return "full";
  if (await isAssigned(task.id, userId)) return "work";
  if (task.created_by === userId) return "work";
  return "none";
}

export interface Person {
  user_id: string;
  name: string;
  email: string;
  role: string;
}

export async function workspacePeople(workspaceId: string): Promise<Person[]> {
  return execute<Person>(
    `SELECT u.id AS user_id, COALESCE(NULLIF(TRIM(u.full_name), ''), u.email) AS name, u.email, m.role
       FROM workspace_members m JOIN app_users u ON u.id = m.user_id
      WHERE m.workspace_id = ? AND u.is_active = 1
      ORDER BY name`,
    [workspaceId],
  );
}

/**
 * Ganti daftar PIC tugas. Hanya user_id anggota workspace yang diterima; nama diambil dari akun.
 * Mengembalikan user_id PIC yang baru ditambahkan (untuk notifikasi). Kolom lama `assignee`
 * diisi nama PIC pertama agar tampilan lama tetap bekerja.
 */
export async function setAssignees(
  workspaceId: string,
  taskId: string,
  userIds: string[],
): Promise<string[]> {
  const people = await workspacePeople(workspaceId);
  const byId = new Map(people.map((p) => [p.user_id, p]));
  const wanted = [...new Set(userIds)].filter((id) => byId.has(id));
  const current = await execute<{ user_id: string | null }>(
    "SELECT user_id FROM prj_task_assignees WHERE task_id = ?",
    [taskId],
  );
  const currentIds = new Set(current.map((c) => c.user_id).filter(Boolean) as string[]);
  await execute("DELETE FROM prj_task_assignees WHERE task_id = ?", [taskId]);
  for (const id of wanted) {
    await execute(
      "INSERT INTO prj_task_assignees (id, workspace_id, task_id, user_id, name) VALUES (?, ?, ?, ?, ?)",
      [uuid(), workspaceId, taskId, id, byId.get(id)!.name],
    );
  }
  await execute("UPDATE prj_tasks SET assignee = ? WHERE id = ?", [
    wanted.length ? byId.get(wanted[0])!.name : null,
    taskId,
  ]);
  return wanted.filter((id) => !currentIds.has(id));
}

/** Cocokkan PIC teks lama (nama/email) ke akun anggota workspace. */
async function matchLegacyName(workspaceId: string, projectId: string | null, name: string) {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  if (projectId) {
    const viaMember = await executeOne<{ id: string }>(
      `SELECT u.id FROM prj_members pm
         JOIN app_users u ON LOWER(u.email) = LOWER(TRIM(pm.email))
         JOIN workspace_members wm ON wm.user_id = u.id AND wm.workspace_id = ?
        WHERE pm.project_id = ? AND LOWER(TRIM(pm.name)) = ? LIMIT 1`,
      [workspaceId, projectId, n],
    );
    if (viaMember) return viaMember.id;
  }
  const viaUser = await executeOne<{ id: string }>(
    `SELECT u.id FROM app_users u JOIN workspace_members wm ON wm.user_id = u.id AND wm.workspace_id = ?
      WHERE LOWER(TRIM(u.full_name)) = ? OR LOWER(u.email) = ? LIMIT 1`,
    [workspaceId, n, n],
  );
  return viaUser?.id ?? null;
}

/**
 * Dipanggil setelah penulisan prj_tasks lewat jalur generik (Kanban/tab Tugas lama):
 *  - `assignee` teks berubah → daftar PIC diganti menjadi satu orang itu (tugas multi-PIC yang
 *    disimpan ulang dengan PIC pertama yang sama tidak diubah).
 *  - `status` berubah → completed_at diisi/dikosongkan.
 */
export async function syncLegacyTaskWrite(
  workspaceId: string,
  taskId: string,
  data: Record<string, unknown>,
  actorId: string,
  isInsert: boolean,
) {
  const task = await loadTask(workspaceId, taskId);
  if (!task) return;
  if (isInsert && !task.created_by) {
    await execute("UPDATE prj_tasks SET created_by = ? WHERE id = ?", [actorId, taskId]);
  }
  if ("assignee" in data) {
    const text = String(data.assignee ?? "").trim();
    const first = await executeOne<{ name: string }>(
      "SELECT name FROM prj_task_assignees WHERE task_id = ? ORDER BY created_at LIMIT 1",
      [taskId],
    );
    const same = (first?.name ?? "").trim().toLowerCase() === text.toLowerCase();
    if (!same || isInsert) {
      const before = new Set(
        (
          await execute<{ user_id: string | null }>(
            "SELECT user_id FROM prj_task_assignees WHERE task_id = ?",
            [taskId],
          )
        ).map((r) => r.user_id),
      );
      await execute("DELETE FROM prj_task_assignees WHERE task_id = ?", [taskId]);
      if (text) {
        const userId = await matchLegacyName(workspaceId, task.project_id, text);
        await execute(
          "INSERT INTO prj_task_assignees (id, workspace_id, task_id, user_id, name) VALUES (?, ?, ?, ?, ?)",
          [uuid(), workspaceId, taskId, userId, text],
        );
        if (userId && !before.has(userId) && userId !== actorId) {
          await notifyAssigned(workspaceId, task, [userId], actorId);
        }
      }
    }
  }
  if ("status" in data) await syncCompletion(task);
}

export async function syncCompletion(task: Pick<TaskRow, "id" | "project_id" | "status">) {
  const done = await isDoneStatus(task.project_id, task.status);
  await execute(
    done
      ? "UPDATE prj_tasks SET completed_at = COALESCE(completed_at, UTC_TIMESTAMP(6)), progress_pct = 100 WHERE id = ?"
      : "UPDATE prj_tasks SET completed_at = NULL WHERE id = ?",
    [task.id],
  );
}

/* ------------------------------ notifikasi ------------------------------ */

export function taskLink(workspaceId: string, taskId: string) {
  return `/app/w/${workspaceId}/xpro/my-tasks?task=${taskId}`;
}

export async function pushNotification(p: {
  workspaceId: string;
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  dedupe?: string | null;
}) {
  await execute(
    `INSERT IGNORE INTO app_notifications (id, workspace_id, user_id, kind, title, body, link, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      p.workspaceId,
      p.userId,
      p.kind,
      p.title.slice(0, 255),
      p.body ? p.body.slice(0, 1000) : null,
      p.link ?? null,
      p.dedupe ?? null,
    ],
  );
}

async function actorName(userId: string) {
  const u = await executeOne<{ name: string }>(
    "SELECT COALESCE(NULLIF(TRIM(full_name), ''), email) AS name FROM app_users WHERE id = ?",
    [userId],
  );
  return u?.name ?? "Seseorang";
}

export async function notifyAssigned(
  workspaceId: string,
  task: Pick<TaskRow, "id" | "name" | "due_date">,
  userIds: string[],
  actorId: string,
) {
  const who = await actorName(actorId);
  for (const uid of userIds) {
    if (uid === actorId) continue;
    await pushNotification({
      workspaceId,
      userId: uid,
      kind: "xpro_assigned",
      title: `Tugas baru: ${task.name}`,
      body: `${who} menugaskan Anda${task.due_date ? ` · tenggat ${String(task.due_date).slice(0, 10)}` : ""}.`,
      link: taskLink(workspaceId, task.id),
    });
  }
}

export async function notifyComment(
  workspaceId: string,
  task: Pick<TaskRow, "id" | "name" | "created_by">,
  actorId: string,
  body: string,
) {
  const rows = await execute<{ user_id: string }>(
    "SELECT user_id FROM prj_task_assignees WHERE task_id = ? AND user_id IS NOT NULL",
    [task.id],
  );
  const targets = new Set(rows.map((r) => r.user_id));
  if (task.created_by) targets.add(task.created_by);
  targets.delete(actorId);
  const who = await actorName(actorId);
  for (const uid of targets) {
    await pushNotification({
      workspaceId,
      userId: uid,
      kind: "xpro_comment",
      title: `${who} berkomentar di "${task.name}"`,
      body: body.slice(0, 200),
      link: taskLink(workspaceId, task.id),
    });
  }
}

/** Tandai notifikasi terbaca. */
export async function markRead(workspaceId: string, userId: string, ids: string[] | "all") {
  if (ids === "all") {
    await result(
      "UPDATE app_notifications SET read_at = UTC_TIMESTAMP(6) WHERE workspace_id = ? AND user_id = ? AND read_at IS NULL",
      [workspaceId, userId],
    );
    return;
  }
  if (!ids.length) return;
  await result(
    `UPDATE app_notifications SET read_at = UTC_TIMESTAMP(6)
      WHERE workspace_id = ? AND user_id = ? AND id IN (${ids.map(() => "?").join(",")})`,
    [workspaceId, userId, ...ids],
  );
}
