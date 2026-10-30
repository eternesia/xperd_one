/** Pure helpers for the XPro Kanban board and team workload dashboard. */

export interface BoardColumn {
  id?: string;
  project_id?: string;
  key: string;
  name: string;
  color: string;
  sort_order: number;
  is_done: boolean;
}

export interface WorkloadTask {
  id: string;
  name?: string;
  assignee: string | null;
  status: string;
  due_date: string | null;
  project_id: string;
  progress_pct?: number | null;
  updated_at?: string | null;
}

export type LoadLevel = "idle" | "light" | "medium" | "overload";

export function defaultColumns(t: (en: string, id: string) => string): BoardColumn[] {
  return [
    { key: "todo", name: t("To Do", "Rencana"), color: "info", sort_order: 0, is_done: false },
    {
      key: "in_progress",
      name: t("In Progress", "Dikerjakan"),
      color: "warning",
      sort_order: 1,
      is_done: false,
    },
    {
      key: "review",
      name: t("In Review", "Pemeriksaan"),
      color: "chart5",
      sort_order: 2,
      is_done: false,
    },
    { key: "done", name: t("Done", "Selesai"), color: "success", sort_order: 3, is_done: true },
  ];
}

/** A task belongs to its status column; unknown statuses fall back to the first column. */
export function resolveColumnKey(status: string, columns: BoardColumn[]): string {
  if (columns.some((c) => c.key === status)) return status;
  return columns[0]?.key ?? status;
}

/** "done" is always finished; custom columns count as finished when flagged is_done. */
export function isDoneStatus(status: string, doneKeys?: Set<string>): boolean {
  return status === "done" || Boolean(doneKeys?.has(status));
}

/** Ringan 1–3 aktif, Sedang 4–5, Overload > 5 aktif atau ada task terlambat. */
export function loadLevel(active: number, overdue: number): LoadLevel {
  if (overdue > 0 || active > 5) return "overload";
  if (active >= 4) return "medium";
  if (active >= 1) return "light";
  return "idle";
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export interface WorkloadRow {
  key: string;
  name: string;
  active: number;
  overdue: number;
  dueSoon: number;
  done30: number;
  projectIds: string[];
  activeTasks: WorkloadTask[];
  level: LoadLevel;
}

/** Groups tasks by assignee (case-insensitive). Unassigned tasks use key "". */
export function summarizeWorkload(
  tasks: WorkloadTask[],
  doneKeysByProject: Map<string, Set<string>>,
  today: string,
): WorkloadRow[] {
  const soon = addDays(today, 7);
  const since = addDays(today, -30);
  const map = new Map<string, WorkloadRow & { projects: Set<string> }>();
  for (const task of tasks) {
    const name = (task.assignee ?? "").trim();
    const key = name.toLowerCase();
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        name,
        active: 0,
        overdue: 0,
        dueSoon: 0,
        done30: 0,
        projectIds: [],
        activeTasks: [],
        level: "idle",
        projects: new Set(),
      };
      map.set(key, row);
    }
    const done = isDoneStatus(task.status, doneKeysByProject.get(task.project_id));
    if (done) {
      if ((task.updated_at ?? "").slice(0, 10) >= since) row.done30 += 1;
      continue;
    }
    row.active += 1;
    row.projects.add(task.project_id);
    row.activeTasks.push(task);
    if (task.due_date && task.due_date < today) row.overdue += 1;
    else if (task.due_date && task.due_date <= soon) row.dueSoon += 1;
  }
  return [...map.values()].map(({ projects, ...row }) => ({
    ...row,
    projectIds: [...projects],
    level: loadLevel(row.active, row.overdue),
  }));
}
