/**
 * Beban kerja tim berbasis jam (murni, tanpa akses DB — mudah diuji).
 *
 * Aturan alokasi per tugas yang belum selesai:
 *  - Sisa jam = estimasi × (1 − progres%). Dibagi rata ke semua PIC tugas.
 *  - Disebar merata ke hari kerja (Sen–Jum) dari max(mulai, hari ini) s.d. tenggat.
 *  - Tenggat sudah lewat → seluruh sisa jam masuk minggu ini (harus dikejar).
 *  - Tanpa tenggat → masuk "tanpa jadwal" (dihitung di total, tidak di heatmap).
 *  - Tanpa estimasi → 0 jam, dihitung di "tanpa estimasi" agar pengelola melengkapinya.
 */

export interface LoadAssignee {
  user_id: string | null;
  name: string;
}

export interface LoadTask {
  id: string;
  name: string;
  project_id: string | null;
  start_date: string | null;
  due_date: string | null;
  estimate_hours: number | null;
  progress_pct: number;
  is_done: boolean;
  completed_at: string | null;
  assignees: LoadAssignee[];
}

export interface LoadPerson {
  user_id: string;
  name: string;
  hours_per_week: number;
}

export type LoadLevel = "light" | "normal" | "full" | "overload";

export interface PersonLoad {
  key: string;
  user_id: string | null;
  name: string;
  capacity: number;
  /** Jam terjadwal per minggu (indeks 0 = minggu ini). */
  weeks: number[];
  unscheduled: number;
  remaining: number;
  active: number;
  overdue: number;
  dueSoon: number;
  noEstimate: number;
  done30: number;
  level: LoadLevel;
  tasks: LoadTask[];
}

const DAY = 86_400_000;
const toNum = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const toIso = (n: number) => new Date(n).toISOString().slice(0, 10);

export function addDays(iso: string, days: number) {
  return toIso(toNum(iso) + days * DAY);
}

/** Senin pada minggu tanggal tersebut. */
export function mondayOf(iso: string) {
  const d = new Date(toNum(iso));
  const dow = (d.getUTCDay() + 6) % 7; // Senin = 0
  return toIso(toNum(iso) - dow * DAY);
}

/** Hari kerja (Sen–Jum) dari `from` s.d. `to` inklusif. */
export function workingDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let n = toNum(from); n <= toNum(to); n += DAY) {
    const dow = new Date(n).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(toIso(n));
  }
  return out;
}

export function levelOf(weeks: number[], capacity: number, overdue: number): LoadLevel {
  const peak = Math.max(0, ...weeks.slice(0, 2));
  const ratio = capacity > 0 ? peak / capacity : peak > 0 ? Infinity : 0;
  if (overdue > 0 || ratio > 1) return "overload";
  if (ratio >= 0.85) return "full";
  if (ratio >= 0.5) return "normal";
  return "light";
}

export function computeHoursLoad(
  tasks: LoadTask[],
  people: LoadPerson[],
  today: string,
  horizonWeeks: number,
): { weekStarts: string[]; rows: PersonLoad[]; unassigned: PersonLoad } {
  const week0 = mondayOf(today);
  const weekStarts = Array.from({ length: horizonWeeks }, (_, i) => addDays(week0, i * 7));
  const soon = addDays(today, 7);
  const since = addDays(today, -30);

  const blank = (
    key: string,
    user_id: string | null,
    name: string,
    capacity: number,
  ): PersonLoad => ({
    key,
    user_id,
    name,
    capacity,
    weeks: Array(horizonWeeks).fill(0),
    unscheduled: 0,
    remaining: 0,
    active: 0,
    overdue: 0,
    dueSoon: 0,
    noEstimate: 0,
    done30: 0,
    level: "light",
    tasks: [],
  });

  const rows = new Map<string, PersonLoad>();
  for (const p of people)
    rows.set(`u:${p.user_id}`, blank(`u:${p.user_id}`, p.user_id, p.name, p.hours_per_week));
  const unassigned = blank("", null, "", 0);

  const rowFor = (a: LoadAssignee) => {
    const key = a.user_id ? `u:${a.user_id}` : `n:${a.name.trim().toLowerCase()}`;
    let row = rows.get(key);
    if (!row) {
      row = blank(key, a.user_id, a.name, 40);
      rows.set(key, row);
    }
    return row;
  };

  const weekIndex = (iso: string) => Math.floor((toNum(iso) - toNum(week0)) / (7 * DAY));

  for (const task of tasks) {
    const targets = task.assignees.length ? task.assignees.map(rowFor) : [unassigned];
    if (task.is_done) {
      if ((task.completed_at ?? "").slice(0, 10) >= since) for (const r of targets) r.done30 += 1;
      continue;
    }
    const remaining =
      Math.max(0, Number(task.estimate_hours ?? 0)) *
      (1 - Math.min(100, Math.max(0, task.progress_pct)) / 100);
    const share = remaining / targets.length;
    const overdue = Boolean(task.due_date && task.due_date < today);

    for (const r of targets) {
      r.active += 1;
      r.tasks.push(task);
      r.remaining += share;
      if (task.estimate_hours === null || task.estimate_hours === undefined) r.noEstimate += 1;
      if (overdue) r.overdue += 1;
      else if (task.due_date && task.due_date <= soon) r.dueSoon += 1;
    }
    if (!share) continue;

    if (!task.due_date) {
      for (const r of targets) r.unscheduled += share;
      continue;
    }
    if (overdue) {
      for (const r of targets) r.weeks[0] += share;
      continue;
    }
    const from = task.start_date && task.start_date > today ? task.start_date : today;
    let days = workingDays(from, task.due_date);
    if (!days.length) days = [task.due_date]; // tenggat jatuh di akhir pekan
    const perDay = share / days.length;
    for (const d of days) {
      const i = weekIndex(d);
      if (i >= 0 && i < horizonWeeks) for (const r of targets) r.weeks[i] += perDay;
    }
  }

  const list = [...rows.values()];
  for (const r of [...list, unassigned]) r.level = levelOf(r.weeks, r.capacity, r.overdue);
  return { weekStarts, rows: list, unassigned };
}
