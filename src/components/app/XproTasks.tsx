/**
 * XPro tugas v2 (UI): halaman "Tugas Saya" lintas proyek dan dialog detail tugas
 * (multi-PIC, prioritas, estimasi jam, checklist, komentar). Dipakai juga oleh Kanban.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckSquare,
  ChevronDown,
  Circle,
  CircleCheck,
  Clock,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { AdminSelect, todayISO } from "@/components/app/admin-ui";
import { PageSkeleton, SearchInput } from "@/components/app/ui-states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { listWorkspaceRows } from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type BoardColumn, defaultColumns } from "@/lib/xpro-board";
import {
  addXproComment,
  deleteXproTask,
  getXproPeople,
  getXproTask,
  listXproTasks,
  saveXproTask,
  xproChecklist,
  type XproAssignee,
  type XproTask,
} from "@/lib/xpro-tasks.functions";

export function useT() {
  const { lang } = useI18n();
  return (en: string, id: string) => (lang === "id" ? id : en);
}

/* ------------------------------ data hooks ------------------------------ */

export function useXproPeople(workspaceId: string) {
  return useQuery({
    queryKey: ["xpro", "people", workspaceId],
    queryFn: () => getXproPeople({ data: { workspaceId } }),
    staleTime: 60_000,
  });
}

export function useXproTaskList(workspaceId: string, scope: "mine" | "all", doneDays = 30) {
  return useQuery({
    queryKey: ["xpro", "tasks", workspaceId, scope, doneDays],
    queryFn: () => listXproTasks({ data: { workspaceId, scope, doneDays } }),
  });
}

/** Baris tabel generik (proyek, tahapan, kolom papan) — bentuknya mengikuti tabel MySQL. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WsRow = Record<string, any>;

function useWsTable(table: string, workspaceId: string) {
  return useQuery({
    queryKey: ["xpro", table, workspaceId],
    queryFn: async () => {
      const res = (await listWorkspaceRows({
        data: { table, workspaceId, orderBy: "created_at", orderDir: "desc", limit: 1000 },
      })) as { rows?: WsRow[] };
      return res?.rows ?? [];
    },
  });
}

export function useAllBoardColumns(workspaceId: string) {
  const q = useWsTable("prj_board_columns", workspaceId);
  const data = useMemo(
    () =>
      (q.data ?? []).map((c) => ({
        ...c,
        is_done: Boolean(Number(c.is_done)),
        sort_order: Number(c.sort_order) || 0,
      })) as BoardColumn[],
    [q.data],
  );
  return { ...q, data };
}

/** Kolom status untuk satu proyek (kolom kustom bila ada, selain itu kolom bawaan). */
export function columnsFor(
  projectId: string | null,
  all: BoardColumn[],
  t: (en: string, id: string) => string,
): BoardColumn[] {
  const own = projectId
    ? all.filter((c) => c.project_id === projectId).sort((a, b) => a.sort_order - b.sort_order)
    : [];
  return own.length ? own : defaultColumns(t);
}

/* ------------------------------ tampilan kecil ------------------------------ */

export const PRIORITY_META: Record<string, { en: string; id: string; cls: string; rank: number }> =
  {
    urgent: {
      en: "Urgent",
      id: "Mendesak",
      cls: "bg-red-500/15 text-red-700 dark:text-red-300",
      rank: 0,
    },
    high: {
      en: "High",
      id: "Tinggi",
      cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
      rank: 1,
    },
    medium: {
      en: "Medium",
      id: "Sedang",
      cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
      rank: 2,
    },
    low: { en: "Low", id: "Rendah", cls: "bg-muted text-muted-foreground", rank: 3 },
  };

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  const t = useT();
  const m = PRIORITY_META[priority] ?? PRIORITY_META.medium;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        m.cls,
        className,
      )}
    >
      {t(m.en, m.id)}
    </span>
  );
}

export function initialsOf(name: string) {
  return (
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function AssigneeStack({ assignees, max = 3 }: { assignees: XproAssignee[]; max?: number }) {
  if (!assignees.length) return null;
  const shown = assignees.slice(0, max);
  return (
    <span className="flex -space-x-1.5" title={assignees.map((a) => a.name).join(", ")}>
      {shown.map((a, i) => (
        <span
          key={`${a.user_id ?? a.name}-${i}`}
          className={cn(
            "flex size-6 items-center justify-center rounded-full border-2 border-card text-[10px] font-semibold",
            a.user_id ? "bg-navy text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {initialsOf(a.name)}
        </span>
      ))}
      {assignees.length > max && (
        <span className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-secondary text-[10px] font-semibold">
          +{assignees.length - max}
        </span>
      )}
    </span>
  );
}

/** Tenggat relatif: "Terlambat 3 hari", "Hari ini", "Besok", atau tanggal. */
export function dueLabel(due: string | null, t: (en: string, id: string) => string) {
  if (!due) return null;
  const today = todayISO();
  const diff = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
  if (diff < 0)
    return { text: t(`${-diff}d overdue`, `Terlambat ${-diff} hari`), tone: "late" as const };
  if (diff === 0) return { text: t("Today", "Hari ini"), tone: "soon" as const };
  if (diff === 1) return { text: t("Tomorrow", "Besok"), tone: "soon" as const };
  return { text: due, tone: "normal" as const };
}

/* ------------------------------ pilih PIC ------------------------------ */

function AssigneePicker({
  workspaceId,
  value,
  onChange,
  disabled,
}: {
  workspaceId: string;
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const people = useXproPeople(workspaceId).data?.people ?? [];
  const [q, setQ] = useState("");
  const chosen = people.filter((p) => value.includes(p.user_id));
  const list = people.filter((p) =>
    `${p.name} ${p.email}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-10 w-full justify-between gap-2 px-3 py-1.5 font-normal"
        >
          <span className="flex min-w-0 flex-wrap gap-1">
            {chosen.length ? (
              chosen.map((p) => (
                <span key={p.user_id} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                  {p.name}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">{t("Choose PIC…", "Pilih PIC…")}</span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] min-w-64 p-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("Search people…", "Cari orang…")}
          className="mb-2 h-9"
        />
        <div className="max-h-64 overflow-y-auto">
          {list.map((p) => {
            const on = value.includes(p.user_id);
            return (
              <button
                key={p.user_id}
                type="button"
                onClick={() =>
                  onChange(on ? value.filter((v) => v !== p.user_id) : [...value, p.user_id])
                }
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded border",
                    on && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
                </span>
              </button>
            );
          })}
          {!list.length && (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              {t("No one found.", "Tidak ditemukan.")}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------ dialog detail tugas ------------------------------ */

export interface TaskDefaults {
  project_id?: string | null;
  status?: string;
  due_date?: string | null;
  assigneeIds?: string[];
}

interface FormState {
  name: string;
  description: string;
  project_id: string;
  milestone_id: string;
  status: string;
  priority: string;
  estimate_hours: string;
  start_date: string;
  due_date: string;
  progress_pct: string;
  assigneeIds: string[];
}

export function XproTaskDialog({
  workspaceId,
  taskId,
  open,
  onOpenChange,
  defaults,
}: {
  workspaceId: string;
  /** null = tugas baru */
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: TaskDefaults;
}) {
  const t = useT();
  const qc = useQueryClient();
  const peopleQ = useXproPeople(workspaceId);
  const projects = useWsTable("prj_projects", workspaceId).data ?? [];
  const milestones = useWsTable("prj_milestones", workspaceId).data ?? [];
  const allCols = useAllBoardColumns(workspaceId).data;

  const taskQ = useQuery({
    queryKey: ["xpro", "task", workspaceId, taskId],
    enabled: open && Boolean(taskId),
    queryFn: async () => {
      const [list, detail] = await Promise.all([
        listXproTasks({ data: { workspaceId, scope: "all", ids: [taskId!], doneDays: 365 } }),
        getXproTask({ data: { workspaceId, taskId: taskId! } }),
      ]);
      return { task: list.tasks[0] ?? null, ...detail };
    },
  });
  const task = taskQ.data?.task ?? null;
  const perm: "full" | "work" | "none" = taskId
    ? (taskQ.data?.perm ?? "none")
    : peopleQ.data?.writer
      ? "full"
      : "none";
  const full = perm === "full";

  const blank = (): FormState => ({
    name: "",
    description: "",
    project_id: defaults?.project_id ?? "",
    milestone_id: "",
    status: defaults?.status ?? "",
    priority: "medium",
    estimate_hours: "",
    start_date: todayISO(),
    due_date: defaults?.due_date ?? "",
    progress_pct: "0",
    assigneeIds: defaults?.assigneeIds ?? (peopleQ.data?.me ? [peopleQ.data.me] : []),
  });
  const [form, setForm] = useState<FormState>(blank);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (!taskId) setForm(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId]);
  useEffect(() => {
    if (!task) return;
    setForm({
      name: task.name,
      description: task.description ?? "",
      project_id: task.project_id ?? "",
      milestone_id: task.milestone_id ?? "",
      status: task.status,
      priority: task.priority,
      estimate_hours: task.estimate_hours === null ? "" : String(task.estimate_hours),
      start_date: task.start_date ?? "",
      due_date: task.due_date ?? "",
      progress_pct: String(Math.round(task.progress_pct)),
      assigneeIds: task.assignees.map((a) => a.user_id).filter(Boolean) as string[],
    });
  }, [task]);

  const cols = columnsFor(form.project_id || null, allCols, t);
  const status = cols.some((c) => c.key === form.status) ? form.status : (cols[0]?.key ?? "todo");
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const legacyNames = (task?.assignees ?? []).filter((a) => !a.user_id).map((a) => a.name);

  const refresh = () => qc.invalidateQueries({ queryKey: ["xpro"] });
  const onErr = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));

  const save = useMutation({
    mutationFn: async () => {
      const col = cols.find((c) => c.key === status);
      const progress = col?.is_done ? 100 : Number(form.progress_pct) || 0;
      const fields = full
        ? {
            name: form.name,
            description: form.description || null,
            project_id: form.project_id || null,
            milestone_id: form.milestone_id || null,
            status,
            priority: form.priority,
            estimate_hours: form.estimate_hours === "" ? null : Number(form.estimate_hours),
            start_date: form.start_date || null,
            due_date: form.due_date || null,
            progress_pct: progress,
          }
        : { status, progress_pct: progress };
      return saveXproTask({
        data: {
          workspaceId,
          id: taskId ?? undefined,
          fields,
          assigneeIds: full ? form.assigneeIds : undefined,
        },
      });
    },
    onSuccess: () => {
      refresh();
      toast.success(t("Task saved", "Tugas tersimpan"));
      onOpenChange(false);
    },
    onError: onErr,
  });

  const remove = useMutation({
    mutationFn: () => deleteXproTask({ data: { workspaceId, taskId: taskId! } }),
    onSuccess: () => {
      refresh();
      toast.success(t("Task deleted", "Tugas dihapus"));
      onOpenChange(false);
    },
    onError: onErr,
  });

  const projectMilestones = milestones.filter((m) => m.project_id === form.project_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {taskId ? t("Task details", "Detail tugas") : t("New task", "Tugas baru")}
          </DialogTitle>
          <DialogDescription>
            {task?.project_name
              ? `${task.project_code} — ${task.project_name}`
              : taskId
                ? t("Internal task (no project)", "Tugas internal (tanpa proyek)")
                : t(
                    "Assign to one or more people. Leave the project empty for internal work.",
                    "Tugaskan ke satu orang atau lebih. Kosongkan proyek untuk pekerjaan internal.",
                  )}
          </DialogDescription>
        </DialogHeader>

        {taskId && taskQ.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : taskId && !task ? (
          <p className="py-6 text-sm text-muted-foreground">
            {t(
              "Task not found or not accessible.",
              "Tugas tidak ditemukan atau tidak dapat diakses.",
            )}
          </p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="min-w-0 space-y-4">
              <div className="space-y-1.5">
                <Label>{t("Task name", "Nama tugas")}</Label>
                <Input
                  value={form.name}
                  disabled={!full}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder={t("What needs to be done?", "Apa yang perlu dikerjakan?")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("Description", "Deskripsi")}</Label>
                <Textarea
                  rows={4}
                  value={form.description}
                  disabled={!full}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder={t(
                    "Details, links, acceptance criteria…",
                    "Detail, tautan, kriteria selesai…",
                  )}
                />
              </div>

              {taskId && task ? (
                <>
                  <ChecklistBlock
                    workspaceId={workspaceId}
                    taskId={taskId}
                    items={taskQ.data?.checklist ?? []}
                    canEdit={full}
                  />
                  <CommentsBlock
                    workspaceId={workspaceId}
                    taskId={taskId}
                    comments={taskQ.data?.comments ?? []}
                  />
                </>
              ) : (
                <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  {t(
                    "Save the task first to add a checklist and comments.",
                    "Simpan tugas dulu untuk menambah checklist dan komentar.",
                  )}
                </p>
              )}
            </div>

            <div className="min-w-0 space-y-3 lg:border-l lg:border-border lg:pl-5">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> PIC
                </Label>
                <AssigneePicker
                  workspaceId={workspaceId}
                  value={form.assigneeIds}
                  onChange={(ids) => set("assigneeIds", ids)}
                  disabled={!full}
                />
                {legacyNames.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("Unlinked PIC:", "PIC belum tertaut akun:")} {legacyNames.join(", ")}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                <div className="col-span-2 space-y-1.5 lg:col-span-1">
                  <Label>{t("Project", "Proyek")}</Label>
                  <AdminSelect
                    value={form.project_id}
                    onChange={(v) => setForm((f) => ({ ...f, project_id: v, milestone_id: "" }))}
                    className={cn("w-full", !full && "pointer-events-none opacity-60")}
                  >
                    <option value="">
                      {t("— Internal (no project) —", "— Internal (tanpa proyek) —")}
                    </option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </AdminSelect>
                </div>
                {form.project_id && projectMilestones.length > 0 && (
                  <div className="col-span-2 space-y-1.5 lg:col-span-1">
                    <Label>{t("Milestone", "Tahapan")}</Label>
                    <AdminSelect
                      value={form.milestone_id}
                      onChange={(v) => set("milestone_id", v)}
                      className={cn("w-full", !full && "pointer-events-none opacity-60")}
                    >
                      <option value="">—</option>
                      {projectMilestones.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </AdminSelect>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>{t("Status", "Status")}</Label>
                  <AdminSelect value={status} onChange={(v) => set("status", v)} className="w-full">
                    {cols.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name}
                      </option>
                    ))}
                  </AdminSelect>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("Priority", "Prioritas")}</Label>
                  <AdminSelect
                    value={form.priority}
                    onChange={(v) => set("priority", v)}
                    className={cn("w-full", !full && "pointer-events-none opacity-60")}
                  >
                    {["urgent", "high", "medium", "low"].map((p) => (
                      <option key={p} value={p}>
                        {t(PRIORITY_META[p].en, PRIORITY_META[p].id)}
                      </option>
                    ))}
                  </AdminSelect>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("Start", "Mulai")}</Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    disabled={!full}
                    onChange={(e) => set("start_date", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("Due", "Tenggat")}</Label>
                  <Input
                    type="date"
                    value={form.due_date}
                    disabled={!full}
                    onChange={(e) => set("due_date", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("Estimate (hours)", "Estimasi (jam)")}</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    inputMode="decimal"
                    value={form.estimate_hours}
                    disabled={!full}
                    onChange={(e) => set("estimate_hours", e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("Progress %", "Progres %")}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    inputMode="numeric"
                    value={form.progress_pct}
                    onChange={(e) => set("progress_pct", e.target.value)}
                  />
                </div>
              </div>
              {perm === "work" && (
                <p className="text-xs text-muted-foreground">
                  {t(
                    "As PIC you can update status, progress, checklist and comments.",
                    "Sebagai PIC Anda dapat mengubah status, progres, checklist, dan komentar.",
                  )}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {taskId && full && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={remove.isPending}
                onClick={() => (confirmDelete ? remove.mutate() : setConfirmDelete(true))}
              >
                <Trash2 />{" "}
                {confirmDelete ? t("Confirm delete", "Yakin hapus?") : t("Delete", "Hapus")}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Close", "Tutup")}
            </Button>
            {perm !== "none" && (!taskId || task) && (
              <Button
                type="button"
                variant="navy"
                disabled={save.isPending || (full && !form.name.trim())}
                onClick={() => save.mutate()}
              >
                {save.isPending && <Loader2 className="animate-spin" />}
                {t("Save", "Simpan")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChecklistBlock({
  workspaceId,
  taskId,
  items,
  canEdit,
}: {
  workspaceId: string;
  taskId: string;
  items: { id: string; title: string; is_done: boolean }[];
  canEdit: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const op = useMutation({
    mutationFn: (p: {
      op: "add" | "toggle" | "delete";
      id?: string;
      title?: string;
      done?: boolean;
    }) => xproChecklist({ data: { workspaceId, taskId, ...p } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["xpro"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const done = items.filter((i) => i.is_done).length;
  const add = () => {
    if (!title.trim()) return;
    op.mutate({ op: "add", title }, { onSuccess: () => setTitle("") });
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <CheckSquare className="h-3.5 w-3.5" /> {t("Checklist", "Checklist")}
        </Label>
        {items.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {done}/{items.length}
          </span>
        )}
      </div>
      {items.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${(done / items.length) * 100}%` }}
          />
        </div>
      )}
      <div className="space-y-1">
        {items.map((i) => (
          <div
            key={i.id}
            className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50"
          >
            <Checkbox
              checked={i.is_done}
              onCheckedChange={(v) => op.mutate({ op: "toggle", id: i.id, done: Boolean(v) })}
            />
            <span
              className={cn("flex-1 text-sm", i.is_done && "text-muted-foreground line-through")}
            >
              {i.title}
            </span>
            {canEdit && (
              <button
                type="button"
                aria-label={t("Remove", "Hapus")}
                className="text-muted-foreground opacity-60 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                onClick={() => op.mutate({ op: "delete", id: i.id })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t("Add an item…", "Tambah item…")}
          className="h-9"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          onClick={add}
          disabled={op.isPending}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

function CommentsBlock({
  workspaceId,
  taskId,
  comments,
}: {
  workspaceId: string;
  taskId: string;
  comments: { id: string; author_name: string; body: string; created_at: string }[];
}) {
  const t = useT();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const send = useMutation({
    mutationFn: () => addXproComment({ data: { workspaceId, taskId, body } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["xpro"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" /> {t("Comments", "Komentar")}
        {comments.length > 0 && (
          <span className="text-xs text-muted-foreground">({comments.length})</span>
        )}
      </Label>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold">
              {initialsOf(c.author_name)}
            </span>
            <div className="min-w-0 flex-1 rounded-xl bg-muted/50 px-3 py-2">
              <p className="text-xs">
                <span className="font-medium">{c.author_name}</span>{" "}
                <span className="text-muted-foreground">
                  {String(c.created_at).slice(0, 16).replace("T", " ")}
                </span>
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("Write a comment…", "Tulis komentar…")}
          className="min-h-0"
        />
        <Button
          type="button"
          size="icon"
          variant="navy"
          aria-label={t("Send", "Kirim")}
          disabled={!body.trim() || send.isPending}
          onClick={() => send.mutate()}
        >
          {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ halaman Tugas Saya ------------------------------ */

type Bucket = "overdue" | "today" | "week" | "later" | "nodue" | "done";

function bucketOf(task: XproTask, today: string): Bucket {
  if (task.is_done) return "done";
  if (!task.due_date) return "nodue";
  if (task.due_date < today) return "overdue";
  if (task.due_date === today) return "today";
  const diff = (Date.parse(task.due_date) - Date.parse(today)) / 86_400_000;
  return diff <= 7 ? "week" : "later";
}

export function XproMyTasksView({ workspaceId }: { workspaceId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const peopleQ = useXproPeople(workspaceId);
  const manager = Boolean(peopleQ.data?.manager);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const tasksQ = useXproTaskList(workspaceId, manager ? scope : "mine");
  const allCols = useAllBoardColumns(workspaceId).data;
  const projects = useWsTable("prj_projects", workspaceId).data ?? [];

  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [project, setProject] = useState("");
  const [person, setPerson] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showDone, setShowDone] = useState(false);

  // Tautan notifikasi: ?task=<id> membuka detail tugas.
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("task");
    if (id) setOpenId(id);
  }, []);
  const closeTask = (open: boolean) => {
    if (open) return;
    setOpenId(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("task")) {
      url.searchParams.delete("task");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  };

  const toggleDone = useMutation({
    mutationFn: async (task: XproTask) => {
      const cols = columnsFor(task.project_id, allCols, t);
      const target = task.is_done
        ? (cols.find((c) => !c.is_done)?.key ?? "todo")
        : (cols.find((c) => c.is_done)?.key ?? "done");
      return saveXproTask({
        data: {
          workspaceId,
          id: task.id,
          fields: { status: target, progress_pct: task.is_done ? 0 : 100 },
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["xpro"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  if (tasksQ.isLoading || peopleQ.isLoading) return <PageSkeleton stats={3} />;

  const me = peopleQ.data?.me;
  const today = todayISO();
  let tasks = tasksQ.data?.tasks ?? [];
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    tasks = tasks.filter((x) =>
      `${x.name} ${x.project_code ?? ""} ${x.project_name ?? ""} ${x.assignees.map((a) => a.name).join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }
  if (priority) tasks = tasks.filter((x) => x.priority === priority);
  if (project)
    tasks = tasks.filter((x) => (project === "__none" ? !x.project_id : x.project_id === project));
  if (person)
    tasks = tasks.filter((x) => x.assignees.some((a) => (a.user_id ?? a.name) === person));

  const groups = new Map<Bucket, XproTask[]>();
  for (const x of tasks) {
    const b = bucketOf(x, today);
    groups.set(b, [...(groups.get(b) ?? []), x]);
  }
  for (const list of groups.values())
    list.sort(
      (a, b) =>
        (PRIORITY_META[a.priority]?.rank ?? 2) - (PRIORITY_META[b.priority]?.rank ?? 2) ||
        String(a.due_date ?? "9").localeCompare(String(b.due_date ?? "9")),
    );

  const open = tasks.filter((x) => !x.is_done);
  const openHours = open.reduce(
    (s, x) => s + (x.estimate_hours ?? 0) * (1 - Math.min(100, x.progress_pct) / 100),
    0,
  );
  const people = [
    ...new Map(
      (tasksQ.data?.tasks ?? [])
        .flatMap((x) => x.assignees)
        .map((a) => [a.user_id ?? a.name, a.name] as const),
    ),
  ];

  const sections: { key: Bucket; en: string; id: string; tone?: string }[] = [
    { key: "overdue", en: "Overdue", id: "Terlambat", tone: "text-destructive" },
    { key: "today", en: "Due today", id: "Hari ini", tone: "text-amber-600 dark:text-amber-400" },
    { key: "week", en: "Next 7 days", id: "7 hari ke depan" },
    { key: "later", en: "Later", id: "Nanti" },
    { key: "nodue", en: "No due date", id: "Tanpa tenggat" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">XPRO</p>
          <h1 className="text-xl font-semibold text-navy sm:text-2xl dark:text-primary-foreground">
            {scope === "all" && manager
              ? t("Team Tasks", "Tugas Tim")
              : t("My Tasks", "Tugas Saya")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Every task assigned to you across projects, plus internal work.",
              "Semua tugas Anda lintas proyek, termasuk pekerjaan internal.",
            )}
          </p>
        </div>
        {peopleQ.data?.writer && (
          <Button variant="navy" onClick={() => setCreating(true)}>
            <Plus /> {t("New task", "Tugas baru")}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile
          icon={AlertTriangle}
          label={t("Overdue", "Terlambat")}
          value={String(groups.get("overdue")?.length ?? 0)}
          tone="text-destructive"
        />
        <SummaryTile
          icon={CalendarClock}
          label={t("Due today", "Hari ini")}
          value={String(groups.get("today")?.length ?? 0)}
        />
        <SummaryTile
          icon={Circle}
          label={t("Open tasks", "Tugas aktif")}
          value={String(open.length)}
        />
        <SummaryTile
          icon={Clock}
          label={t("Remaining hours", "Sisa jam")}
          value={`${Math.round(openHours * 10) / 10} ${t("h", "jam")}`}
        />
      </div>

      <div className="q-filters flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        {manager && (
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(["mine", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-sm",
                  scope === s ? "bg-navy text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {s === "mine" ? t("Mine", "Saya") : t("Whole team", "Semua tim")}
              </button>
            ))}
          </div>
        )}
        <div className="min-w-0 sm:w-60">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("Search tasks…", "Cari tugas…")}
          />
        </div>
        <AdminSelect value={project} onChange={setProject} className="sm:w-56">
          <option value="">{t("All projects", "Semua proyek")}</option>
          <option value="__none">{t("Internal (no project)", "Internal (tanpa proyek)")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </AdminSelect>
        <AdminSelect value={priority} onChange={setPriority} className="sm:w-40">
          <option value="">{t("All priorities", "Semua prioritas")}</option>
          {["urgent", "high", "medium", "low"].map((p) => (
            <option key={p} value={p}>
              {t(PRIORITY_META[p].en, PRIORITY_META[p].id)}
            </option>
          ))}
        </AdminSelect>
        {manager && scope === "all" && (
          <AdminSelect value={person} onChange={setPerson} className="sm:w-48">
            <option value="">{t("All people", "Semua orang")}</option>
            {people.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </AdminSelect>
        )}
      </div>

      {!tasks.length && (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          {t("No tasks here yet.", "Belum ada tugas di sini.")}
        </div>
      )}

      {sections.map((s) => {
        const list = groups.get(s.key) ?? [];
        if (!list.length) return null;
        return (
          <section key={s.key} className="space-y-2">
            <h2
              className={cn(
                "text-sm font-semibold",
                s.tone ?? "text-navy dark:text-primary-foreground",
              )}
            >
              {t(s.en, s.id)}{" "}
              <span className="font-normal text-muted-foreground">({list.length})</span>
            </h2>
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {list.map((x) => (
                <TaskRowItem
                  key={x.id}
                  task={x}
                  me={me}
                  onOpen={() => setOpenId(x.id)}
                  onToggle={() => toggleDone.mutate(x)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {(groups.get("done")?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="flex items-center gap-1 text-sm font-semibold text-muted-foreground"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", !showDone && "-rotate-90")}
            />
            {t("Completed (last 30 days)", "Selesai (30 hari terakhir)")} (
            {groups.get("done")!.length})
          </button>
          {showDone && (
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {groups.get("done")!.map((x) => (
                <TaskRowItem
                  key={x.id}
                  task={x}
                  me={me}
                  onOpen={() => setOpenId(x.id)}
                  onToggle={() => toggleDone.mutate(x)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <XproTaskDialog
        workspaceId={workspaceId}
        taskId={openId}
        open={Boolean(openId)}
        onOpenChange={closeTask}
      />
      <XproTaskDialog
        workspaceId={workspaceId}
        taskId={null}
        open={creating}
        onOpenChange={setCreating}
        defaults={{ project_id: project && project !== "__none" ? project : null }}
      />
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-3.5 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground sm:text-xs">
          {label}
        </p>
        <Icon className="h-4 w-4 shrink-0 text-gold" />
      </div>
      <p
        className={cn(
          "mt-1.5 text-lg font-semibold text-navy sm:text-xl dark:text-primary-foreground",
          tone,
        )}
      >
        {value}
      </p>
    </div>
  );
}

function TaskRowItem({
  task,
  me,
  onOpen,
  onToggle,
}: {
  task: XproTask;
  me?: string;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const t = useT();
  const due = task.is_done ? null : dueLabel(task.due_date, t);
  const canToggle =
    !!me && (task.created_by === me || task.assignees.some((a) => a.user_id === me));
  return (
    <div className="flex items-start gap-3 px-3 py-3 sm:px-4">
      <button
        type="button"
        onClick={onToggle}
        disabled={!canToggle}
        aria-label={task.is_done ? t("Reopen", "Buka lagi") : t("Mark done", "Tandai selesai")}
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-emerald-600 disabled:opacity-40"
      >
        {task.is_done ? (
          <CircleCheck className="h-5 w-5 text-emerald-600" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span
          className={cn(
            "block text-sm font-medium text-navy dark:text-foreground",
            task.is_done && "text-muted-foreground line-through",
          )}
        >
          {task.name}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <PriorityBadge priority={task.priority} />
          <span className="truncate">{task.project_code ?? t("Internal", "Internal")}</span>
          {due && (
            <span
              className={cn(
                due.tone === "late" && "font-medium text-destructive",
                due.tone === "soon" && "font-medium text-amber-600 dark:text-amber-400",
              )}
            >
              {due.text}
            </span>
          )}
          {task.estimate_hours !== null && (
            <span className="inline-flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {task.estimate_hours} {t("h", "jam")}
            </span>
          )}
          {task.checklist_total > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <CheckSquare className="h-3 w-3" />
              {task.checklist_done}/{task.checklist_total}
            </span>
          )}
          {task.comment_count > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <MessageSquare className="h-3 w-3" />
              {task.comment_count}
            </span>
          )}
        </span>
      </button>
      <AssigneeStack assignees={task.assignees} />
    </div>
  );
}
