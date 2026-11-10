/**
 * XPro — Backlog & Sprint ala Jira (khusus PM/pengelola).
 * Backlog → rencanakan ke sprint → Mulai sprint (tanggal mulai & selesai) → tugas masuk Kanban tim
 * → Selesaikan sprint (sisa kembali ke backlog / pindah ke sprint berikutnya).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CalendarRange,
  CheckCircle2,
  Clock,
  GripVertical,
  Inbox,
  KanbanSquare,
  Loader2,
  Pencil,
  Play,
  Plus,
  Rocket,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AdminSelect, todayISO } from "@/components/app/admin-ui";
import { PageSkeleton } from "@/components/app/ui-states";
import {
  AssigneeStack,
  PriorityBadge,
  XproTaskDialog,
  useT,
  useXproPeople,
} from "@/components/app/XproTasks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listWorkspaceRows } from "@/lib/data.functions";
import { cn } from "@/lib/utils";
import {
  type XproSprint,
  completeXproSprint,
  deleteXproSprint,
  listXproSprints,
  moveXproTasks,
  saveXproSprint,
  startXproSprint,
} from "@/lib/xpro-sprints.functions";
import { type XproTask, listXproTasks, saveXproTask } from "@/lib/xpro-tasks.functions";

const INTERNAL = "__none";
const BACKLOG = "__backlog";
const START_NOW = "__start";

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const fmtDate = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : "—";
const hours = (list: XproTask[]) =>
  Math.round(list.reduce((s, x) => s + (x.estimate_hours ?? 0), 0) * 10) / 10;

export function XproSprintChip({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const t = useT();
  const q = useQuery({
    queryKey: ["xpro", "sprints", workspaceId, projectId],
    enabled: Boolean(projectId),
    queryFn: () => listXproSprints({ data: { workspaceId, projectId } }),
    retry: false,
  });
  const active = (q.data ?? []).filter((s) => s.status === "active");
  if (!active.length) return null;
  const today = todayISO();
  return (
    <div className="flex flex-wrap gap-2">
      {active.map((s) => {
        const left = s.end_date ? daysBetween(today, s.end_date) : null;
        return (
          <span
            key={s.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs"
          >
            <Rocket className="h-3.5 w-3.5 text-gold" />
            <b>{s.name}</b>
            <span className="text-muted-foreground">
              {fmtDate(s.start_date)} – {fmtDate(s.end_date)}
            </span>
            {left !== null && (
              <span
                className={cn(
                  "font-medium",
                  left < 0 ? "text-destructive" : "text-muted-foreground",
                )}
              >
                ·{" "}
                {left < 0
                  ? t(`${-left}d over`, `lewat ${-left} hari`)
                  : t(`${left}d left`, `${left} hari lagi`)}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function XproBacklogView({ workspaceId }: { workspaceId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const peopleQ = useXproPeople(workspaceId);
  const projectsQ = useQuery({
    queryKey: ["xpro", "prj_projects", workspaceId],
    queryFn: async () => {
      const res = (await listWorkspaceRows({
        data: {
          table: "prj_projects",
          workspaceId,
          orderBy: "created_at",
          orderDir: "desc",
          limit: 1000,
        },
      })) as unknown as { rows?: { id: string; code: string; name: string; status: string }[] };
      return res?.rows ?? [];
    },
  });
  const projects = projectsQ.data ?? [];
  const [projectSel, setProjectSel] = useState("");
  const project =
    projectSel || projects.find((p) => p.status === "active")?.id || projects[0]?.id || INTERNAL;

  const sprintsQ = useQuery({
    queryKey: ["xpro", "sprints", workspaceId, project],
    queryFn: () => listXproSprints({ data: { workspaceId, projectId: project } }),
  });
  const tasksQ = useQuery({
    queryKey: ["xpro", "backlog", workspaceId, project],
    queryFn: () =>
      listXproTasks({
        data: { workspaceId, scope: "all", backlog: "only", projectId: project, doneDays: 365 },
      }),
  });

  const [quick, setQuick] = useState<Record<string, string>>({});
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [sprintForm, setSprintForm] = useState<Partial<XproSprint> | null>(null);
  const [starting, setStarting] = useState<XproSprint | null>(null);
  const [completing, setCompleting] = useState<XproSprint | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["xpro"] });
  const onErr = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));

  const sprints = useMemo(() => sprintsQ.data ?? [], [sprintsQ.data]);
  const tasks = useMemo(() => tasksQ.data?.tasks ?? [], [tasksQ.data]);
  const bySprint = useMemo(() => {
    const m = new Map<string, XproTask[]>();
    for (const x of tasks) {
      const k = x.sprint_id && sprints.some((s) => s.id === x.sprint_id) ? x.sprint_id : BACKLOG;
      if (k === BACKLOG && !x.backlog) continue;
      m.set(k, [...(m.get(k) ?? []), x]);
    }
    for (const list of m.values())
      list.sort(
        (a, b) =>
          ["urgent", "high", "medium", "low"].indexOf(a.priority) -
            ["urgent", "high", "medium", "low"].indexOf(b.priority) ||
          String(a.due_date ?? "9").localeCompare(String(b.due_date ?? "9")),
      );
    return m;
  }, [tasks, sprints]);

  const move = useMutation({
    mutationFn: (p: { ids: string[]; to: string }) =>
      moveXproTasks({
        data: {
          workspaceId,
          taskIds: p.ids,
          start: p.to === START_NOW,
          sprintId: p.to === BACKLOG || p.to === START_NOW ? null : p.to,
        },
      }),
    onSuccess: (_d, p) => {
      refresh();
      if (p.to === START_NOW) toast.success(t("Moved to the team board", "Dipindah ke Kanban tim"));
    },
    onError: onErr,
  });

  const addQuick = useMutation({
    mutationFn: (p: { target: string; name: string }) =>
      saveXproTask({
        data: {
          workspaceId,
          fields: {
            name: p.name,
            project_id: project === INTERNAL ? null : project,
            backlog: true,
            sprint_id: p.target === BACKLOG ? null : p.target,
            start_date: null,
            priority: "medium",
          },
          assigneeIds: [],
        },
      }),
    onSuccess: (_d, p) => {
      setQuick((q) => ({ ...q, [p.target]: "" }));
      refresh();
    },
    onError: onErr,
  });

  const saveSprint = useMutation({
    mutationFn: (f: Partial<XproSprint>) =>
      saveXproSprint({
        data: {
          workspaceId,
          id: f.id,
          projectId: project,
          name: f.name ?? "",
          goal: f.goal ?? null,
          start_date: f.start_date || null,
          end_date: f.end_date || null,
        },
      }),
    onSuccess: () => {
      setSprintForm(null);
      refresh();
      toast.success(t("Sprint saved", "Sprint tersimpan"));
    },
    onError: onErr,
  });

  const removeSprint = useMutation({
    mutationFn: (id: string) => deleteXproSprint({ data: { workspaceId, sprintId: id } }),
    onSuccess: () => {
      refresh();
      toast.success(
        t(
          "Sprint deleted — tasks returned to backlog",
          "Sprint dihapus — tugas kembali ke backlog",
        ),
      );
    },
    onError: onErr,
  });

  if (peopleQ.isLoading || projectsQ.isLoading || sprintsQ.isLoading || tasksQ.isLoading)
    return <PageSkeleton stats={0} />;
  if (!peopleQ.data?.manager)
    return (
      <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        {t(
          "Only project managers can open the backlog.",
          "Hanya PM/pengelola yang dapat membuka backlog.",
        )}
      </p>
    );

  const active = sprints.filter((s) => s.status === "active");
  const planned = sprints.filter((s) => s.status === "planned");
  const backlog = bySprint.get(BACKLOG) ?? [];
  const nextName = `Sprint ${sprints.length + 1}`;

  const moveTargets = (current: string) => [
    ...(current !== BACKLOG ? [{ v: BACKLOG, l: t("Backlog", "Backlog") }] : []),
    ...[...active, ...planned]
      .filter((s) => s.id !== current)
      .map((s) => ({
        v: s.id,
        l: `${s.name}${s.status === "active" ? ` (${t("running", "berjalan")})` : ""}`,
      })),
    { v: START_NOW, l: t("Start now (no sprint)", "Mulai sekarang (tanpa sprint)") },
  ];

  const dropProps = (target: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      setOver(target);
    },
    onDragLeave: () => setOver((o) => (o === target ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain") || dragId;
      setOver(null);
      setDragId(null);
      if (id) move.mutate({ ids: [id], to: target });
    },
  });

  const renderRows = (list: XproTask[], current: string) => (
    <div className="divide-y divide-border">
      {list.map((x) => (
        <div
          key={x.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", x.id);
            e.dataTransfer.effectAllowed = "move";
            setDragId(x.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setOver(null);
          }}
          className={cn(
            "flex items-center gap-2 px-2 py-2 sm:px-3",
            dragId === x.id && "opacity-50",
          )}
        >
          <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60 md:block" />
          {x.is_done ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <span className="size-4 shrink-0 rounded-full border border-muted-foreground/40" />
          )}
          <button
            type="button"
            onClick={() => setOpenTask(x.id)}
            className="min-w-0 flex-1 text-left"
          >
            <span
              className={cn(
                "block truncate text-sm",
                x.is_done && "text-muted-foreground line-through",
              )}
            >
              {x.name}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <PriorityBadge priority={x.priority} />
              {x.estimate_hours !== null && (
                <span className="inline-flex items-center gap-0.5">
                  <Clock className="h-3 w-3" />
                  {x.estimate_hours} {t("h", "jam")}
                </span>
              )}
              {x.due_date && <span>{fmtDate(x.due_date)}</span>}
            </span>
          </button>
          <AssigneeStack assignees={x.assignees} />
          {!x.is_done && (
            <AdminSelect
              value=""
              onChange={(v) => v && move.mutate({ ids: [x.id], to: v })}
              className="h-8 w-[7.5rem] shrink-0 text-xs"
            >
              <option value="">{t("Move to…", "Pindah ke…")}</option>
              {moveTargets(current).map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </AdminSelect>
          )}
        </div>
      ))}
    </div>
  );

  const quickAdd = (target: string) => (
    <div className="flex gap-2 border-t border-border p-2">
      <Input
        value={quick[target] ?? ""}
        onChange={(e) => setQuick((q) => ({ ...q, [target]: e.target.value }))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (quick[target] ?? "").trim()) {
            e.preventDefault();
            addQuick.mutate({ target, name: quick[target].trim() });
          }
        }}
        placeholder={t("What needs to be done? (Enter)", "Apa yang perlu dikerjakan? (Enter)")}
        className="h-9"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        disabled={!(quick[target] ?? "").trim() || addQuick.isPending}
        onClick={() => addQuick.mutate({ target, name: quick[target].trim() })}
      >
        <Plus />
      </Button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">XPRO</p>
          <h1 className="text-xl font-semibold text-navy sm:text-2xl dark:text-primary-foreground">
            Backlog
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t(
              "Plan work here. Drag tasks into a sprint, then start the sprint to put them on the team Kanban.",
              "Rencanakan pekerjaan di sini. Seret tugas ke sprint, lalu mulai sprint agar tugas masuk Kanban tim.",
            )}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <AdminSelect
            value={project}
            onChange={setProjectSel}
            className="min-w-0 flex-1 sm:w-64 sm:flex-none"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
            <option value={INTERNAL}>
              {t("Internal (no project)", "Internal (tanpa proyek)")}
            </option>
          </AdminSelect>
          <Button variant="navy" onClick={() => setSprintForm({ name: nextName })}>
            <Plus /> {t("Create sprint", "Buat sprint")}
          </Button>
        </div>
      </div>

      {active.map((s) => {
        const list = bySprint.get(s.id) ?? [];
        const done = list.filter((x) => x.is_done).length;
        const left = s.end_date ? daysBetween(todayISO(), s.end_date) : null;
        return (
          <section
            key={s.id}
            {...dropProps(s.id)}
            className={cn(
              "overflow-hidden rounded-2xl border-2 border-gold/50 bg-card",
              over === s.id && "ring-2 ring-gold",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-gold/5 px-3 py-3 sm:px-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold text-navy dark:text-foreground">
                  <Rocket className="h-4 w-4 text-gold" /> {s.name}
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    {t("Running", "Berjalan")}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {fmtDate(s.start_date)} – {fmtDate(s.end_date)}
                  {left !== null &&
                    ` · ${left < 0 ? t(`${-left} days over`, `lewat ${-left} hari`) : t(`${left} days left`, `${left} hari lagi`)}`}
                  {` · ${done}/${list.length} ${t("done", "selesai")} · ${hours(list)} ${t("h", "jam")}`}
                </p>
                {s.goal && <p className="mt-1 text-sm">{s.goal}</p>}
                <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link
                    to="/app/w/$workspaceId/$moduleId/$submoduleId"
                    params={{ workspaceId, moduleId: "xpro", submoduleId: "kanban" }}
                  >
                    <KanbanSquare /> Kanban
                  </Link>
                </Button>
                <Button size="sm" variant="navy" onClick={() => setCompleting(s)}>
                  <CheckCircle2 /> {t("Complete sprint", "Selesaikan sprint")}
                </Button>
              </div>
            </div>
            {renderRows(list, s.id)}
            {quickAdd(s.id)}
          </section>
        );
      })}

      {planned.map((s) => {
        const list = bySprint.get(s.id) ?? [];
        return (
          <section
            key={s.id}
            {...dropProps(s.id)}
            className={cn(
              "overflow-hidden rounded-2xl border border-border bg-card",
              over === s.id && "ring-2 ring-gold",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-3 py-3 sm:px-4">
              <div className="min-w-0">
                <p className="font-semibold text-navy dark:text-foreground">{s.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {s.start_date || s.end_date
                    ? `${fmtDate(s.start_date)} – ${fmtDate(s.end_date)} · `
                    : ""}
                  {list.length} {t("tasks", "tugas")} · {hours(list)} {t("h", "jam")}
                </p>
                {s.goal && <p className="mt-1 text-sm text-muted-foreground">{s.goal}</p>}
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="navy"
                  disabled={!list.length}
                  title={!list.length ? t("Add tasks first", "Tambahkan tugas dulu") : undefined}
                  onClick={() => setStarting(s)}
                >
                  <Play /> {t("Start sprint", "Mulai sprint")}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("Edit", "Ubah")}
                  onClick={() => setSprintForm(s)}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  aria-label={t("Delete", "Hapus")}
                  onClick={() => removeSprint.mutate(s.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            {list.length ? (
              renderRows(list, s.id)
            ) : (
              <p className="px-4 py-5 text-center text-xs text-muted-foreground">
                {t("Drag tasks here from the backlog.", "Seret tugas dari backlog ke sini.")}
              </p>
            )}
            {quickAdd(s.id)}
          </section>
        );
      })}

      <section
        {...dropProps(BACKLOG)}
        className={cn(
          "overflow-hidden rounded-2xl border border-border bg-card",
          over === BACKLOG && "ring-2 ring-gold",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-4">
          <p className="flex items-center gap-2 font-semibold text-navy dark:text-foreground">
            <Inbox className="h-4 w-4 text-gold" /> Backlog
            <span className="text-xs font-normal text-muted-foreground">
              {backlog.length} {t("tasks", "tugas")} · {hours(backlog)} {t("h", "jam")}
            </span>
          </p>
        </div>
        {backlog.length ? (
          renderRows(backlog, BACKLOG)
        ) : (
          <p className="px-4 py-5 text-center text-xs text-muted-foreground">
            {t("The backlog is empty.", "Backlog kosong.")}
          </p>
        )}
        {quickAdd(BACKLOG)}
      </section>

      <XproTaskDialog
        workspaceId={workspaceId}
        taskId={openTask}
        open={Boolean(openTask)}
        onOpenChange={(o) => !o && setOpenTask(null)}
      />

      {/* Buat / ubah sprint */}
      <Dialog open={Boolean(sprintForm)} onOpenChange={(o) => !o && setSprintForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {sprintForm?.id ? t("Edit sprint", "Ubah sprint") : t("Create sprint", "Buat sprint")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Dates are optional now — you set them when starting the sprint.",
                "Tanggal opsional — bisa ditetapkan saat sprint dimulai.",
              )}
            </DialogDescription>
          </DialogHeader>
          {sprintForm && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t("Name", "Nama")}</Label>
                <Input
                  value={sprintForm.name ?? ""}
                  onChange={(e) => setSprintForm({ ...sprintForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("Sprint goal", "Tujuan sprint")}</Label>
                <Textarea
                  rows={2}
                  value={sprintForm.goal ?? ""}
                  onChange={(e) => setSprintForm({ ...sprintForm, goal: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("Start", "Mulai")}</Label>
                  <Input
                    type="date"
                    value={sprintForm.start_date ?? ""}
                    onChange={(e) => setSprintForm({ ...sprintForm, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("Until", "Sampai")}</Label>
                  <Input
                    type="date"
                    value={sprintForm.end_date ?? ""}
                    onChange={(e) => setSprintForm({ ...sprintForm, end_date: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSprintForm(null)}>
              {t("Cancel", "Batal")}
            </Button>
            <Button
              variant="navy"
              disabled={!sprintForm?.name?.trim() || saveSprint.isPending}
              onClick={() => sprintForm && saveSprint.mutate(sprintForm)}
            >
              {saveSprint.isPending && <Loader2 className="animate-spin" />}
              {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StartSprintDialog
        workspaceId={workspaceId}
        sprint={starting}
        taskCount={starting ? (bySprint.get(starting.id)?.length ?? 0) : 0}
        onClose={() => setStarting(null)}
      />
      <CompleteSprintDialog
        workspaceId={workspaceId}
        sprint={completing}
        open={
          (completing ? (bySprint.get(completing.id) ?? []) : []).filter((x) => !x.is_done).length
        }
        targets={planned}
        onClose={() => setCompleting(null)}
      />
    </div>
  );
}

function StartSprintDialog({
  workspaceId,
  sprint,
  taskCount,
  onClose,
}: {
  workspaceId: string;
  sprint: XproSprint | null;
  taskCount: number;
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const today = todayISO();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [goal, setGoal] = useState("");
  const [dur, setDur] = useState("14");
  const s = start || sprint?.start_date || today;
  const e = end || sprint?.end_date || addDays(s, Number(dur) - 1);
  const go = useMutation({
    mutationFn: () =>
      startXproSprint({
        data: { workspaceId, sprintId: sprint!.id, start_date: s, end_date: e, goal: goal || null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["xpro"] });
      toast.success(
        t(
          "Sprint started — tasks are on the team board",
          "Sprint dimulai — tugas sudah di Kanban tim",
        ),
      );
      setStart("");
      setEnd("");
      setGoal("");
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  });
  return (
    <Dialog open={Boolean(sprint)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("Start", "Mulai")} {sprint?.name}
          </DialogTitle>
          <DialogDescription>
            {t(
              `${taskCount} tasks will move to the team Kanban. Tasks without a due date get the sprint end date.`,
              `${taskCount} tugas akan masuk Kanban tim. Tugas tanpa tenggat diberi tanggal akhir sprint.`,
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("Duration", "Durasi")}</Label>
            <AdminSelect
              value={end ? "custom" : dur}
              onChange={(v) => {
                if (v === "custom") return;
                setDur(v);
                setEnd("");
              }}
              className="w-full"
            >
              <option value="7">{t("1 week", "1 minggu")}</option>
              <option value="14">{t("2 weeks", "2 minggu")}</option>
              <option value="21">{t("3 weeks", "3 minggu")}</option>
              <option value="28">{t("4 weeks", "4 minggu")}</option>
              <option value="custom">{t("Custom", "Atur sendiri")}</option>
            </AdminSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("Start", "Mulai")}</Label>
              <Input type="date" value={s} onChange={(ev) => setStart(ev.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("Until", "Sampai")}</Label>
              <Input type="date" value={e} min={s} onChange={(ev) => setEnd(ev.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("Sprint goal", "Tujuan sprint")}</Label>
            <Textarea
              rows={2}
              value={goal || sprint?.goal || ""}
              onChange={(ev) => setGoal(ev.target.value)}
            />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="h-3.5 w-3.5" />
            {fmtDate(s)} – {fmtDate(e)} ({daysBetween(s, e) + 1} {t("days", "hari")})
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("Cancel", "Batal")}
          </Button>
          <Button variant="navy" disabled={go.isPending || e < s} onClick={() => go.mutate()}>
            {go.isPending ? <Loader2 className="animate-spin" /> : <Play />}
            {t("Start sprint", "Mulai sprint")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteSprintDialog({
  workspaceId,
  sprint,
  open,
  targets,
  onClose,
}: {
  workspaceId: string;
  sprint: XproSprint | null;
  open: number;
  targets: XproSprint[];
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [moveTo, setMoveTo] = useState("backlog");
  const go = useMutation({
    mutationFn: () => completeXproSprint({ data: { workspaceId, sprintId: sprint!.id, moveTo } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["xpro"] });
      toast.success(t("Sprint completed", "Sprint selesai"));
      setMoveTo("backlog");
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  });
  return (
    <Dialog open={Boolean(sprint)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("Complete", "Selesaikan")} {sprint?.name}
          </DialogTitle>
          <DialogDescription>
            {open
              ? t(
                  `${open} tasks are not finished yet. Where should they go?`,
                  `${open} tugas belum selesai. Pindahkan ke mana?`,
                )
              : t("All tasks are finished.", "Semua tugas sudah selesai.")}
          </DialogDescription>
        </DialogHeader>
        {open > 0 && (
          <AdminSelect value={moveTo} onChange={setMoveTo} className="w-full">
            <option value="backlog">{t("Back to backlog", "Kembali ke backlog")}</option>
            {targets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </AdminSelect>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("Cancel", "Batal")}
          </Button>
          <Button variant="navy" disabled={go.isPending} onClick={() => go.mutate()}>
            {go.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {t("Complete sprint", "Selesaikan sprint")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
