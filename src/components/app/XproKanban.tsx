import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Columns3,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AdminField, AdminSelect, todayISO } from "@/components/app/admin-ui";
import { PageSkeleton, SearchInput } from "@/components/app/ui-states";
import { useApp } from "@/lib/app-context";
import {
  deleteWorkspaceRow,
  listWorkspaceRows,
  saveWorkspaceRow,
  upsertWorkspaceRows,
} from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import {
  AssigneeStack,
  PriorityBadge,
  XproTaskDialog,
  useXproPeople,
  useXproTaskList,
} from "@/components/app/XproTasks";
import { cn } from "@/lib/utils";
import { type BoardColumn, defaultColumns, resolveColumnKey } from "@/lib/xpro-board";

/**
 * Ronde 36 — **Kanban Tugas & Beban Kerja Tim** XPro (diporting dari BS New 11
 * `src/components/app/XproKanban.tsx`). UI/alur disalin apa adanya; hanya lapisan
 * datanya yang memakai server fn MySQL Old (`listWorkspaceRows` /
 * `saveWorkspaceRow` / `upsertWorkspaceRows` / `deleteWorkspaceRow`), bukan Supabase.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: unknown) => Number(v ?? 0) || 0;

function useT() {
  const { lang } = useI18n();
  return (en: string, id: string) => (lang === "id" ? id : en);
}

/** Pilihan "proyek" semu untuk tugas internal tanpa proyek. */
const INTERNAL = "__none";

const TONES: Record<string, { bar: string; bg: string; dot: string }> = {
  info: { bar: "bg-info", bg: "bg-info/10", dot: "bg-info" },
  warning: { bar: "bg-warning", bg: "bg-warning/10", dot: "bg-warning" },
  chart5: { bar: "bg-chart-5", bg: "bg-chart-5/10", dot: "bg-chart-5" },
  chart3: { bar: "bg-chart-3", bg: "bg-chart-3/10", dot: "bg-chart-3" },
  gold: { bar: "bg-gold", bg: "bg-gold/15", dot: "bg-gold" },
  success: { bar: "bg-success", bg: "bg-success/10", dot: "bg-success" },
  destructive: { bar: "bg-destructive", bg: "bg-destructive/10", dot: "bg-destructive" },
  muted: { bar: "bg-muted-foreground", bg: "bg-muted/60", dot: "bg-muted-foreground" },
};
const tone = (c: string) => TONES[c] ?? TONES.info;

/** Shares cache keys/order with XproViews so lists stay in sync. */
function useWsRows(table: string, workspaceId: string) {
  return useQuery({
    queryKey: ["xpro", table, workspaceId],
    queryFn: async () => {
      const res = (await listWorkspaceRows({
        data: { table, workspaceId, orderBy: "created_at", orderDir: "desc", limit: 1000 },
      })) as { rows?: any[] };
      return (res?.rows ?? []) as any[];
    },
  });
}

/** Custom columns; null when the column storage is not available yet (board falls back to defaults). */
function useBoardColumns(workspaceId: string) {
  return useQuery({
    queryKey: ["xpro", "prj_board_columns", workspaceId],
    queryFn: async () => {
      try {
        const res = (await listWorkspaceRows({
          data: { table: "prj_board_columns", workspaceId, limit: 1000 },
        })) as { rows?: any[] };
        // MySQL mengembalikan tinyint/int: samakan dengan tipe BoardColumn.
        return (res?.rows ?? []).map((c) => ({
          ...c,
          is_done: Boolean(Number(c.is_done)),
          sort_order: Number(c.sort_order) || 0,
        })) as BoardColumn[];
      } catch {
        return null;
      }
    },
  });
}

/** Names the signed-in user appears under as a project team member (matched by login email). */
function useMyNames(members: any[]) {
  const { email } = useApp();
  return useMemo(() => {
    const me = (email ?? "").toLowerCase();
    const set = new Set<string>();
    if (!me) return set;
    set.add(me);
    for (const m of members)
      if ((m.email ?? "").toLowerCase() === me) set.add((m.name ?? "").toLowerCase());
    return set;
  }, [email, members]);
}

function Header({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-[0.28em] text-gold">XPRO</p>
        <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">{title}</h1>
        {desc && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

/* ================================ KANBAN ================================ */

export function XproKanbanView({ workspaceId }: { workspaceId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const { workspaceRole, canEditSubmodule } = useApp();
  const isManager = workspaceRole === "owner" || workspaceRole === "admin";
  const canEdit = canEditSubmodule("xpro", "kanban");

  const projects = useWsRows("prj_projects", workspaceId);
  // XPro v2: tugas dari server function yang menegakkan hak akses (multi-PIC, prioritas, checklist).
  const peopleQ = useXproPeople(workspaceId);
  const me = peopleQ.data?.me;
  const scope = isManager ? "all" : "mine";
  const tasksQ = useXproTaskList(workspaceId, scope, 365);
  const membersQ = useWsRows("prj_members", workspaceId);
  const milestonesQ = useWsRows("prj_milestones", workspaceId);
  const colsQ = useBoardColumns(workspaceId);

  const [projectId, setProjectId] = useState("");
  const [search, setSearch] = useState("");
  const [pic, setPic] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [quickKey, setQuickKey] = useState<string | null>(null);
  const [quickName, setQuickName] = useState("");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [editCol, setEditCol] = useState<(BoardColumn & { original?: string }) | null>(null);

  const P = projects.data ?? [];
  const T: any[] = tasksQ.data?.tasks ?? [];
  const members = membersQ.data ?? [];
  const myNames = useMyNames(members);
  const isMine = (x: any) =>
    Boolean(
      me && (x.created_by === me || (x.assignees ?? []).some((a: any) => a.user_id === me)),
    ) || myNames.has((x.assignee ?? "").toLowerCase());
  const hasInternal = T.some((x) => !x.project_id);

  const visibleProjects = isManager
    ? P
    : P.filter((p) => T.some((x) => x.project_id === p.id && isMine(x)));
  const activeProject =
    visibleProjects.find((p) => p.id === projectId) ??
    visibleProjects.find((p) => p.status === "active") ??
    visibleProjects[0] ??
    null;
  const pid =
    projectId === INTERNAL || (!activeProject && hasInternal)
      ? INTERNAL
      : (activeProject?.id ?? "");
  const inProject = (x: any) => (pid === INTERNAL ? !x.project_id : x.project_id === pid);

  const columnsReady = colsQ.data !== null;
  const stored = (colsQ.data ?? [])
    .filter((c: any) => c.project_id === pid)
    .sort((a, b) => a.sort_order - b.sort_order);
  const columns: BoardColumn[] = stored.length ? stored : defaultColumns(t);

  const projectMilestones = (milestonesQ.data ?? []).filter((m) => m.project_id === pid);

  let tasks = T.filter(inProject);
  if (!isManager || mineOnly) tasks = tasks.filter(isMine);
  if (pic) tasks = tasks.filter((x) => (x.assignees ?? []).some((a: any) => a.name === pic));
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    tasks = tasks.filter((x) =>
      `${x.name} ${(x.assignees ?? []).map((a: any) => a.name).join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }
  const grouped = new Map<string, any[]>(columns.map((c) => [c.key, []]));
  for (const x of tasks) grouped.get(resolveColumnKey(x.status, columns))?.push(x);
  for (const list of grouped.values())
    list.sort((a, b) => String(a.due_date ?? "9").localeCompare(String(b.due_date ?? "9")));

  const tasksKey = ["xpro", "tasks", workspaceId, scope, 365];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["xpro"] });
  const onErr = (e: any) => toast.error(e?.message ?? String(e));

  const move = useMutation({
    mutationFn: async ({ task, col }: { task: any; col: BoardColumn }) => {
      const patch: any = { status: col.key };
      if (col.is_done) patch.progress_pct = 100;
      await saveWorkspaceRow({
        data: { table: "prj_tasks", workspaceId, id: task.id, data: patch },
      });
    },
    onMutate: ({ task, col }) => {
      qc.setQueryData(tasksKey, (old: { tasks: any[] } | undefined) =>
        old
          ? {
              ...old,
              tasks: old.tasks.map((x) =>
                x.id === task.id
                  ? {
                      ...x,
                      status: col.key,
                      is_done: col.is_done,
                      progress_pct: col.is_done ? 100 : x.progress_pct,
                    }
                  : x,
              ),
            }
          : old,
      );
    },
    onError: (e) => {
      onErr(e);
      invalidate();
    },
    onSettled: invalidate,
  });

  const saveTask = useMutation({
    mutationFn: async (row: any) => {
      const { id, ...rest } = row;
      const payload = { ...rest, project_id: rest.project_id ?? (pid === INTERNAL ? null : pid) };
      await saveWorkspaceRow({
        data: { table: "prj_tasks", workspaceId, id: id || undefined, data: payload },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("Saved", "Tersimpan"));
    },
    onError: onErr,
  });

  async function upsertColumns(list: BoardColumn[]) {
    // Kunci unik (project_id, key) di tabel membuat upsert menimpa kolom yang sudah ada.
    const rows = list.map((c, i) => ({
      project_id: pid,
      key: c.key,
      name: c.name,
      color: c.color,
      is_done: c.is_done ? 1 : 0,
      sort_order: i,
    }));
    await upsertWorkspaceRows({ data: { table: "prj_board_columns", workspaceId, rows } });
  }

  const colOp = useMutation({
    mutationFn: async (fn: () => Promise<void>) => fn(),
    onSuccess: invalidate,
    onError: onErr,
  });

  function saveColumn() {
    if (!editCol?.name.trim()) return;
    const next = editCol.original
      ? columns.map((c) =>
          c.key === editCol.original
            ? { ...c, name: editCol.name.trim(), color: editCol.color, is_done: editCol.is_done }
            : c,
        )
      : [
          ...columns,
          {
            key: `c_${Date.now().toString(36)}`,
            name: editCol.name.trim(),
            color: editCol.color,
            is_done: editCol.is_done,
            sort_order: columns.length,
          },
        ];
    colOp.mutate(() => upsertColumns(next), {
      onSuccess: () => {
        setEditCol(null);
        toast.success(t("Column saved", "Kolom tersimpan"));
      },
    });
  }

  function shiftColumn(key: string, dir: -1 | 1) {
    const i = columns.findIndex((c) => c.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= columns.length) return;
    const next = [...columns];
    [next[i], next[j]] = [next[j], next[i]];
    colOp.mutate(() => upsertColumns(next));
  }

  function deleteColumn(col: BoardColumn) {
    if (columns.length <= 1)
      return toast.error(
        t("A board needs at least one column.", "Papan minimal punya satu kolom."),
      );
    const remaining = columns.filter((c) => c.key !== col.key);
    const target = remaining[0];
    const count = grouped.get(col.key)?.length ?? 0;
    const msg = count
      ? t(
          `Delete "${col.name}"? Its ${count} card(s) will move to "${target.name}".`,
          `Hapus "${col.name}"? ${count} kartu di dalamnya dipindah ke "${target.name}".`,
        )
      : t(`Delete column "${col.name}"?`, `Hapus kolom "${col.name}"?`);
    if (!confirm(msg)) return;
    colOp.mutate(async () => {
      const ids = T.filter(
        (x) => x.project_id === pid && resolveColumnKey(x.status, columns) === col.key,
      ).map((x) => x.id);
      for (const id of ids)
        await saveWorkspaceRow({
          data: { table: "prj_tasks", workspaceId, id, data: { status: target.key } },
        });
      // Kolom bawaan (belum tersimpan) tidak punya baris; cukup tidak ikut disimpan lagi.
      const storedRow = stored.find((c: any) => c.key === col.key) as
        (BoardColumn & { id?: string }) | undefined;
      if (storedRow?.id)
        await deleteWorkspaceRow({
          data: { table: "prj_board_columns", workspaceId, id: storedRow.id },
        });
      await upsertColumns(remaining);
    });
  }

  function quickAdd(col: BoardColumn) {
    const name = quickName.trim();
    if (!name) return;
    saveTask.mutate(
      {
        name,
        status: col.key,
        progress_pct: col.is_done ? 100 : 0,
        start_date: todayISO(),
        due_date: null,
        assignee: pic || null,
      },
      { onSuccess: () => setQuickName("") },
    );
  }

  if (projects.isLoading || tasksQ.isLoading || membersQ.isLoading || colsQ.isLoading)
    return <PageSkeleton stats={0} />;

  const canDrag = (x: any) => canEdit && (isManager || isMine(x));
  const today = todayISO();
  const pics = [
    ...new Set(T.filter(inProject).flatMap((x) => (x.assignees ?? []).map((a: any) => a.name))),
  ] as string[];

  return (
    <div className="space-y-5">
      <Header
        title={
          isManager ? t("Kanban Tasks", "Kanban Tugas") : t("My Task Board", "Papan Tugas Saya")
        }
        desc={
          isManager
            ? t(
                "Drag cards between columns. Add, rename, reorder or delete columns per project.",
                "Seret kartu antar kolom. Tambah, ubah nama, atur urutan, atau hapus kolom per proyek.",
              )
            : t(
                "Tasks assigned to you. Drag a card to update its status.",
                "Tugas yang ditugaskan ke Anda. Seret kartu untuk memperbarui status.",
              )
        }
        action={
          isManager && pid && pid !== INTERNAL ? (
            <Button
              variant="navy"
              size="sm"
              disabled={!columnsReady}
              onClick={() =>
                setEditCol({ key: "", name: "", color: "info", sort_order: 0, is_done: false })
              }
            >
              <Columns3 /> {t("Add column", "Tambah kolom")}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <AdminSelect value={pid} onChange={setProjectId} className="sm:w-72">
          {!visibleProjects.length && (
            <option value="">{t("No projects", "Belum ada proyek")}</option>
          )}
          {visibleProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
          {(isManager || hasInternal) && (
            <option value={INTERNAL}>
              {t("Internal (no project)", "Internal (tanpa proyek)")}
            </option>
          )}
        </AdminSelect>
        {isManager && (
          <AdminSelect value={pic} onChange={setPic} className="sm:w-52">
            <option value="">{t("All PIC", "Semua PIC")}</option>
            {pics.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </AdminSelect>
        )}
        <div className="sm:w-64">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("Search cards…", "Cari kartu…")}
          />
        </div>
        {isManager && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-gold)]"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
            />
            {t("Only my tasks", "Hanya tugas saya")}
          </label>
        )}
      </div>

      {isManager && !columnsReady && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
          {t(
            "Custom columns are not available yet — the board uses the 4 standard columns for now.",
            "Kolom kustom belum tersedia — sementara papan memakai 4 kolom standar.",
          )}
        </p>
      )}

      {!pid ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {isManager
              ? t(
                  "Create a project first to start a board.",
                  "Buat proyek terlebih dahulu untuk memulai papan.",
                )
              : t(
                  "No tasks assigned to you yet. Ask your PM to add you (with your login email) to the project team.",
                  "Belum ada tugas untuk Anda. Minta PM menambahkan Anda (dengan email login) ke tim proyek.",
                )}
          </CardContent>
        </Card>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          <div className="flex min-w-max items-start gap-4">
            {columns.map((col, ci) => {
              const tn = tone(col.color);
              const items = grouped.get(col.key) ?? [];
              return (
                <div
                  key={col.key}
                  onDragOver={(e) => {
                    if (dragId) {
                      e.preventDefault();
                      setOverKey(col.key);
                    }
                  }}
                  onDragLeave={() => setOverKey((k) => (k === col.key ? null : k))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain") || dragId;
                    setOverKey(null);
                    setDragId(null);
                    const task = T.find((x) => x.id === id);
                    if (task && resolveColumnKey(task.status, columns) !== col.key)
                      move.mutate({ task, col });
                  }}
                  className={cn(
                    "flex w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-border transition-all",
                    tn.bg,
                    overKey === col.key && "ring-2 ring-gold",
                  )}
                >
                  <div className={cn("h-1.5 w-full", tn.bar)} />
                  <div className="flex items-center justify-between gap-2 px-4 pt-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", tn.dot)} />
                      <p className="truncate text-sm font-semibold text-navy dark:text-foreground">
                        {col.name}
                      </p>
                      {col.is_done && (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary">{items.length}</Badge>
                      {isManager && columnsReady && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              aria-label={t("Column menu", "Menu kolom")}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setEditCol({ ...col, original: col.key })}
                            >
                              <Pencil /> {t("Edit column", "Ubah kolom")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={ci === 0}
                              onClick={() => shiftColumn(col.key, -1)}
                            >
                              <ArrowLeft /> {t("Move left", "Geser ke kiri")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={ci === columns.length - 1}
                              onClick={() => shiftColumn(col.key, 1)}
                            >
                              <ArrowRight /> {t("Move right", "Geser ke kanan")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteColumn(col)}
                            >
                              <Trash2 /> {t("Delete column", "Hapus kolom")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 min-h-[50vh] flex-1 space-y-2.5 px-3 pb-3">
                    {items.map((x) => {
                      const late = !col.is_done && x.due_date && x.due_date < today;
                      const ms = projectMilestones.find((m) => m.id === x.milestone_id);
                      const draggable = canDrag(x);
                      return (
                        <div
                          key={x.id}
                          draggable={draggable}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", x.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDragId(x.id);
                          }}
                          onDragEnd={() => {
                            setDragId(null);
                            setOverKey(null);
                          }}
                          onClick={() => setOpenTaskId(x.id)}
                          className={cn(
                            "rounded-xl border border-border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                            draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                            dragId === x.id && "opacity-50",
                          )}
                        >
                          {ms && (
                            <p className="mb-1 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {ms.name}
                            </p>
                          )}
                          <p className="text-sm font-semibold leading-snug text-navy dark:text-foreground">
                            {x.name}
                          </p>
                          {(x.priority !== "medium" || x.checklist_total > 0) && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                              {x.priority !== "medium" && <PriorityBadge priority={x.priority} />}
                              {x.checklist_total > 0 && (
                                <span>
                                  ☑ {x.checklist_done}/{x.checklist_total}
                                </span>
                              )}
                            </div>
                          )}
                          <div className="mt-2 h-1.5 rounded-full bg-muted">
                            <div
                              className={cn("h-1.5 rounded-full", tn.bar)}
                              style={{ width: `${Math.min(100, num(x.progress_pct))}%` }}
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                            <span
                              className={cn(
                                "flex items-center gap-1",
                                late && "font-semibold text-destructive",
                              )}
                            >
                              {late ? (
                                <AlertTriangle className="h-3 w-3" />
                              ) : (
                                <CalendarDays className="h-3 w-3" />
                              )}
                              {x.due_date ?? t("No due date", "Tanpa tenggat")}
                            </span>
                            <span className="flex items-center gap-1.5">
                              {num(x.progress_pct)}%
                              <AssigneeStack assignees={x.assignees ?? []} />
                            </span>
                          </div>
                          {draggable && (
                            <AdminSelect
                              className="mt-2 h-8 text-xs md:hidden"
                              value={col.key}
                              onChange={(v) => {
                                const target = columns.find((c) => c.key === v);
                                if (target) move.mutate({ task: x, col: target });
                              }}
                            >
                              {columns.map((c) => (
                                <option key={c.key} value={c.key}>
                                  {c.name}
                                </option>
                              ))}
                            </AdminSelect>
                          )}
                        </div>
                      );
                    })}
                    {items.length === 0 && quickKey !== col.key && (
                      <div className="rounded-xl border border-dashed border-border py-6 text-center text-[11px] text-muted-foreground">
                        {t("Drop cards here", "Letakkan kartu di sini")}
                      </div>
                    )}
                    {isManager &&
                      canEdit &&
                      (quickKey === col.key ? (
                        <div className="space-y-2 rounded-xl border border-border bg-card p-2">
                          <Input
                            autoFocus
                            value={quickName}
                            placeholder={t("Card title…", "Judul kartu…")}
                            onChange={(e) => setQuickName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") quickAdd(col);
                              if (e.key === "Escape") setQuickKey(null);
                            }}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="navy"
                              disabled={!quickName.trim() || saveTask.isPending}
                              onClick={() => quickAdd(col)}
                            >
                              {t("Add card", "Tambah kartu")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setQuickKey(null);
                                setQuickName("");
                              }}
                            >
                              <X />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setQuickKey(col.key);
                            setQuickName("");
                          }}
                          className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                        >
                          <Plus className="h-3.5 w-3.5" /> {t("Add a card", "Tambah kartu")}
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ----- detail tugas (XPro v2: multi-PIC, checklist, komentar) ----- */}
      <XproTaskDialog
        workspaceId={workspaceId}
        taskId={openTaskId}
        open={Boolean(openTaskId)}
        onOpenChange={(o) => !o && setOpenTaskId(null)}
      />

      {/* ----- column dialog ----- */}
      <Dialog open={!!editCol} onOpenChange={(o) => !o && setEditCol(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editCol?.original ? t("Edit column", "Ubah kolom") : t("New column", "Kolom baru")}
            </DialogTitle>
          </DialogHeader>
          {editCol && (
            <div className="space-y-4">
              <AdminField label={t("Column name", "Nama kolom")}>
                <Input
                  autoFocus
                  value={editCol.name}
                  placeholder={t("e.g. Waiting for material", "mis. Menunggu Material")}
                  onChange={(e) => setEditCol({ ...editCol, name: e.target.value })}
                />
              </AdminField>
              <AdminField label={t("Color", "Warna")}>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(TONES).map(([k, v]) => (
                    <button
                      key={k}
                      type="button"
                      aria-label={k}
                      onClick={() => setEditCol({ ...editCol, color: k })}
                      className={cn(
                        "h-8 w-8 rounded-full border-2 border-transparent",
                        v.bar,
                        editCol.color === k &&
                          "border-foreground ring-2 ring-gold ring-offset-2 ring-offset-background",
                      )}
                    />
                  ))}
                </div>
              </AdminField>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[var(--color-gold)]"
                  checked={editCol.is_done}
                  onChange={(e) => setEditCol({ ...editCol, is_done: e.target.checked })}
                />
                <span>
                  {t("This column means the task is finished", "Kolom ini berarti tugas selesai")}
                  <span className="block text-xs text-muted-foreground">
                    {t(
                      "Cards moved here are set to 100% and no longer count as workload.",
                      "Kartu yang dipindah ke sini menjadi 100% dan tidak dihitung sebagai beban kerja.",
                    )}
                  </span>
                </span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="navy"
              disabled={!editCol?.name.trim() || colOp.isPending}
              onClick={saveColumn}
            >
              {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
