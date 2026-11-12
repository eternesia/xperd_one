/**
 * XPro — Beban Kerja Tim: ringkasan & grafik progres tim, serta pratinjau detail per orang
 * (sedang dikerjakan, berikutnya, terlambat, baru selesai).
 */
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CheckSquare, CircleCheck, MessageSquare } from "lucide-react";

import { todayISO } from "@/components/app/admin-ui";
import { PriorityBadge, dueLabel, useT } from "@/components/app/XproTasks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { type PersonLoad, addDays, mondayOf } from "@/lib/xpro-workload";
import type { XproTask } from "@/lib/xpro-tasks.functions";

const fmtH = (h: number) => (Math.round(h * 10) / 10).toLocaleString("id-ID");
const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/** Kategori tugas aktif untuk grafik & detail orang. */
export type TaskPhase = "late" | "doing" | "next";
export function phaseOf(x: XproTask, today: string): TaskPhase {
  if (x.due_date && x.due_date < today) return "late";
  if (x.progress_pct > 0 || !x.start_date || x.start_date <= today) return "doing";
  return "next";
}

const COLORS = {
  late: "#ef4444",
  doing: "#0ea5e9",
  next: "#94a3b8",
  done: "#10b981",
  hours: "#1e3a5f",
  cap: "#d4a537",
};

const keyOfAssignee = (a: { user_id: string | null; name: string }) =>
  a.user_id ? `u:${a.user_id}` : `n:${a.name.trim().toLowerCase()}`;

/* ------------------------------ ringkasan & grafik ------------------------------ */

export function WorkloadInsights({ tasks, rows }: { tasks: XproTask[]; rows: PersonLoad[] }) {
  const t = useT();
  const today = todayISO();

  const s = useMemo(() => {
    const active = tasks.filter((x) => !x.is_done);
    const since30 = addDays(today, -30);
    const done30 = tasks.filter(
      (x) => x.is_done && x.completed_at && String(x.completed_at).slice(0, 10) >= since30,
    );
    const onTime = done30.filter(
      (x) => !x.due_date || String(x.completed_at).slice(0, 10) <= x.due_date,
    ).length;
    const w = (x: XproTask) => (x.estimate_hours && x.estimate_hours > 0 ? x.estimate_hours : 1);
    const wsum = active.reduce((a, x) => a + w(x), 0);
    const avgProgress = wsum
      ? active.reduce((a, x) => a + w(x) * Math.min(100, x.progress_pct), 0) / wsum
      : 0;

    const phases = { late: 0, doing: 0, next: 0 };
    for (const x of active) phases[phaseOf(x, today)] += 1;

    // Tugas selesai per minggu (8 minggu terakhir, Senin–Minggu).
    const week0 = mondayOf(today);
    const weeks = Array.from({ length: 8 }, (_, i) => addDays(week0, (i - 7) * 7));
    const perWeek = weeks.map((ws) => {
      const we = addDays(ws, 6);
      const list = tasks.filter((x) => {
        const d = x.completed_at ? String(x.completed_at).slice(0, 10) : "";
        return x.is_done && d >= ws && d <= we;
      });
      return {
        week: shortDate(ws),
        selesai: list.length,
        jam: Math.round(list.reduce((a, x) => a + (x.estimate_hours ?? 0), 0) * 10) / 10,
      };
    });

    return {
      active: active.length,
      done30: done30.length,
      onTimePct: done30.length ? Math.round((onTime / done30.length) * 100) : null,
      avgProgress,
      phases,
      perWeek,
    };
  }, [tasks, today]);

  const people = rows
    .filter((r) => r.key && (r.active > 0 || r.weeks[0] > 0))
    .slice(0, 12)
    .map((r) => ({
      name: r.name.length > 14 ? `${r.name.slice(0, 13)}…` : r.name,
      [t("This week (h)", "Minggu ini (jam)")]: Math.round(r.weeks[0] * 10) / 10,
      [t("Capacity (h)", "Kapasitas (jam)")]: r.capacity,
    }));

  const pie = [
    { name: t("In progress", "Berjalan"), value: s.phases.doing, color: COLORS.doing },
    { name: t("Not started", "Belum mulai"), value: s.phases.next, color: COLORS.next },
    { name: t("Overdue", "Terlambat"), value: s.phases.late, color: COLORS.late },
    { name: t("Done (30d)", "Selesai (30 hr)"), value: s.done30, color: COLORS.done },
  ].filter((p) => p.value > 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini label={t("Active tasks", "Tugas aktif")} value={String(s.active)} />
        <Mini
          label={t("Avg. progress (active)", "Rata-rata progres aktif")}
          value={`${Math.round(s.avgProgress)}%`}
          bar={s.avgProgress}
        />
        <Mini label={t("Completed (30 days)", "Selesai (30 hari)")} value={String(s.done30)} />
        <Mini
          label={t("On time (30 days)", "Tepat waktu (30 hari)")}
          value={s.onTimePct === null ? "—" : `${s.onTimePct}%`}
          tone={
            s.onTimePct === null
              ? undefined
              : s.onTimePct >= 80
                ? "text-emerald-600"
                : s.onTimePct >= 50
                  ? "text-amber-600"
                  : "text-destructive"
          }
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard
          title={t("This week: hours vs capacity", "Minggu ini: jam vs kapasitas")}
          className="lg:col-span-2"
        >
          {people.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={people} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={48}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey={t("This week (h)", "Minggu ini (jam)")}
                  fill={COLORS.hours}
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey={t("Capacity (h)", "Kapasitas (jam)")}
                  fill={COLORS.cap}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </ChartCard>
        <ChartCard title={t("Task status", "Status tugas")}>
          {pie.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pie}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={2}
                >
                  {pie.map((p) => (
                    <Cell key={p.name} fill={p.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </ChartCard>
        <ChartCard
          title={t("Completed per week (8 weeks)", "Selesai per minggu (8 minggu)")}
          className="lg:col-span-3"
          height="h-52"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={s.perWeek} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number, n: string) =>
                  n === "selesai"
                    ? [`${v} ${t("tasks", "tugas")}`, t("Completed", "Selesai")]
                    : [`${v} ${t("h", "jam")}`, t("Hours", "Jam")]
                }
              />
              <Bar dataKey="selesai" fill={COLORS.done} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
  bar,
}: {
  label: string;
  value: string;
  tone?: string;
  bar?: number;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-3.5 sm:p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground sm:text-xs">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-lg font-semibold text-navy sm:text-xl dark:text-primary-foreground",
          tone,
        )}
      >
        {value}
      </p>
      {bar !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${Math.min(100, bar)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function ChartCard({
  title,
  children,
  className,
  height = "h-64",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  height?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-2xl border border-border bg-card p-4", className)}>
      <p className="text-sm font-semibold text-navy dark:text-foreground">{title}</p>
      <div className={cn("mt-3", height)}>{children}</div>
    </div>
  );
}

function Empty() {
  const t = useT();
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {t("No data yet.", "Belum ada data.")}
    </div>
  );
}

/** Tugas yang paling relevan "sedang dikerjakan" untuk baris tabel. */
export function currentTaskOf(row: PersonLoad, today: string) {
  const list = row.tasks
    .filter(
      (x) =>
        !(x.due_date && x.due_date < today) &&
        (x.progress_pct > 0 || !x.start_date || x.start_date <= today),
    )
    .sort(
      (a, b) =>
        b.progress_pct - a.progress_pct ||
        String(a.due_date ?? "9").localeCompare(String(b.due_date ?? "9")),
    );
  return list[0] ?? null;
}

/* ------------------------------ detail per orang ------------------------------ */

export function PersonDetailDialog({
  person,
  allTasks,
  weekStarts,
  onClose,
  onOpenTask,
}: {
  person: PersonLoad | null;
  allTasks: XproTask[];
  weekStarts: string[];
  onClose: () => void;
  onOpenTask: (id: string) => void;
}) {
  const t = useT();
  const today = todayISO();
  const mine = useMemo(() => {
    if (!person) return [];
    if (!person.key) return allTasks.filter((x) => !x.assignees.length);
    return allTasks.filter((x) => x.assignees.some((a) => keyOfAssignee(a) === person.key));
  }, [person, allTasks]);

  if (!person) return null;
  const active = mine.filter((x) => !x.is_done);
  const late = active.filter((x) => phaseOf(x, today) === "late");
  const doing = active.filter((x) => phaseOf(x, today) === "doing");
  const next = active.filter((x) => phaseOf(x, today) === "next");
  const since30 = addDays(today, -30);
  const done = mine
    .filter((x) => x.is_done && x.completed_at && String(x.completed_at).slice(0, 10) >= since30)
    .sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)));
  const util0 = person.capacity > 0 ? Math.round((person.weeks[0] / person.capacity) * 100) : 0;
  const byDue = (a: XproTask, b: XproTask) =>
    String(a.due_date ?? "9").localeCompare(String(b.due_date ?? "9"));

  const section = (title: string, list: XproTask[], tone?: string) =>
    list.length ? (
      <section className="space-y-1.5">
        <h3
          className={cn(
            "text-xs font-semibold uppercase tracking-wide text-muted-foreground",
            tone,
          )}
        >
          {title} ({list.length})
        </h3>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {list.map((x) => {
            const due = x.is_done ? null : dueLabel(x.due_date, t);
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => onOpenTask(x.id)}
                className="block w-full px-3 py-2.5 text-left hover:bg-muted/40"
              >
                <span className="flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      "min-w-0 text-sm font-medium",
                      x.is_done && "text-muted-foreground line-through",
                    )}
                  >
                    {x.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {x.estimate_hours === null ? "?" : `${fmtH(x.estimate_hours)} ${t("h", "jam")}`}
                  </span>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <PriorityBadge priority={x.priority} />
                  <span>{x.project_code ?? t("Internal", "Internal")}</span>
                  {due && (
                    <span
                      className={cn(
                        due.tone === "late" && "font-medium text-destructive",
                        due.tone === "soon" && "font-medium text-amber-600",
                      )}
                    >
                      {due.text}
                    </span>
                  )}
                  {x.is_done && x.completed_at && (
                    <span className="inline-flex items-center gap-0.5 text-emerald-600">
                      <CircleCheck className="h-3 w-3" />
                      {shortDate(String(x.completed_at).slice(0, 10))}
                    </span>
                  )}
                  {x.checklist_total > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <CheckSquare className="h-3 w-3" />
                      {x.checklist_done}/{x.checklist_total}
                    </span>
                  )}
                  {x.comment_count > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <MessageSquare className="h-3 w-3" />
                      {x.comment_count}
                    </span>
                  )}
                </span>
                {!x.is_done && (
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-sky-500"
                        style={{ width: `${Math.min(100, x.progress_pct)}%` }}
                      />
                    </span>
                    <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">
                      {Math.round(x.progress_pct)}%
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    ) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{person.name}</DialogTitle>
          <DialogDescription>
            {t("What this person is working on", "Yang sedang dikerjakan")} ·{" "}
            {person.key
              ? `${t("capacity", "kapasitas")} ${fmtH(person.capacity)} ${t("h/week", "jam/minggu")}`
              : t("tasks without PIC", "tugas tanpa PIC")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(
            [
              [t("Active", "Aktif"), String(active.length), ""],
              [
                t("Overdue", "Terlambat"),
                String(late.length),
                late.length ? "text-destructive" : "",
              ],
              [t("Hours left", "Sisa jam"), fmtH(person.remaining), ""],
              [
                t("This week", "Minggu ini"),
                person.key ? `${util0}%` : "—",
                util0 > 100 ? "text-destructive" : util0 >= 85 ? "text-amber-600" : "",
              ],
              [t("Done 30d", "Selesai 30 hr"), String(done.length), "text-emerald-600"],
            ] as const
          ).map(([k, v, tone]) => (
            <div key={k} className="rounded-xl bg-muted/50 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">{k}</p>
              <p className={cn("text-base font-semibold tabular-nums", tone)}>{v}</p>
            </div>
          ))}
        </div>

        {person.key && (
          <div
            className="flex items-end gap-1.5"
            aria-label={t("Load per week", "Beban per minggu")}
          >
            {person.weeks.map((h, i) => {
              const r = person.capacity > 0 ? h / person.capacity : 0;
              return (
                <div key={weekStarts[i]} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-16 w-full items-end rounded-md bg-muted/50">
                    <div
                      title={`${fmtH(h)} / ${fmtH(person.capacity)} ${t("h", "jam")}`}
                      className={cn(
                        "w-full rounded-md",
                        r > 1
                          ? "bg-red-500"
                          : r >= 0.85
                            ? "bg-amber-400"
                            : r > 0
                              ? "bg-emerald-500"
                              : "bg-transparent",
                      )}
                      style={{ height: `${Math.min(100, r * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {i === 0 ? t("This wk", "Mgg ini") : shortDate(weekStarts[i])}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
          {section(t("Overdue", "Terlambat"), late.sort(byDue), "text-destructive")}
          {section(t("Working on now", "Sedang dikerjakan"), doing.sort(byDue))}
          {section(t("Up next", "Berikutnya"), next.sort(byDue))}
          {section(t("Recently completed", "Baru selesai (30 hari)"), done)}
          {!mine.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("No tasks.", "Tidak ada tugas.")}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
