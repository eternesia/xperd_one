/**
 * XPro Roadmap (mirip Jira Timeline): baris Proyek ▸ Tahapan ▸ Tugas di kiri, batang jadwal di kanan.
 * - Skala Minggu / Bulan / Kuartal, garis "hari ini", pita sprint di atas.
 * - Pengelola dapat menggeser batang (ubah mulai & tenggat) atau menarik ujungnya (ubah durasi).
 * - Klik tugas membuka detail tugas; klik proyek/tahapan membuka form tanggal singkat.
 * - Item tanpa tanggal ditandai "Belum dijadwalkan" dan bisa dijadwalkan dari form.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Flag,
  FolderKanban,
  ListTodo,
} from "lucide-react";
import { toast } from "sonner";

import { AdminSelect, todayISO } from "@/components/app/admin-ui";
import { PageSkeleton } from "@/components/app/ui-states";
import { useXproPeople, useXproTaskList, XproTaskDialog } from "@/components/app/XproTasks";
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
import { listWorkspaceRows, saveWorkspaceRow } from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { listXproSprints } from "@/lib/xpro-sprints.functions";
import { saveXproTask, type XproTask } from "@/lib/xpro-tasks.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type Kind = "project" | "milestone" | "task";
type Zoom = "week" | "month" | "quarter";

interface Item {
  key: string;
  kind: Kind;
  id: string;
  name: string;
  start: string | null;
  end: string | null;
  progress: number;
  done: boolean;
  depth: number;
  childCount: number;
  /** Rentang dihitung dari anak (proyek/tahapan tanpa tanggal sendiri). */
  derived: boolean;
  colorIdx: number;
  task?: XproTask;
  row?: Row;
}

const DAY = 86_400_000;
const PX_PER_DAY: Record<Zoom, number> = { week: 30, month: 8, quarter: 2.8 };
const ROW_H = 40;
const LEFT_W = 300;
const COLORS = [
  { bar: "bg-violet-500", soft: "bg-violet-500/25", text: "text-violet-700 dark:text-violet-300" },
  { bar: "bg-sky-500", soft: "bg-sky-500/25", text: "text-sky-700 dark:text-sky-300" },
  {
    bar: "bg-emerald-500",
    soft: "bg-emerald-500/25",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  { bar: "bg-amber-500", soft: "bg-amber-500/25", text: "text-amber-700 dark:text-amber-300" },
  { bar: "bg-rose-500", soft: "bg-rose-500/25", text: "text-rose-700 dark:text-rose-300" },
  { bar: "bg-teal-500", soft: "bg-teal-500/25", text: "text-teal-700 dark:text-teal-300" },
];

const toNum = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const toIso = (n: number) => new Date(n).toISOString().slice(0, 10);
const addDays = (iso: string, d: number) => toIso(toNum(iso) + d * DAY);
const dayDiff = (a: string, b: string) => Math.round((toNum(b) - toNum(a)) / DAY);
const minIso = (xs: (string | null | undefined)[]) =>
  xs.filter((x): x is string => !!x).reduce<string | null>((m, x) => (!m || x < m ? x : m), null);
const maxIso = (xs: (string | null | undefined)[]) =>
  xs.filter((x): x is string => !!x).reduce<string | null>((m, x) => (!m || x > m ? x : m), null);
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : null);

function useWsRows(table: string, workspaceId: string) {
  return useQuery({
    queryKey: ["xpro", table, workspaceId, "roadmap"],
    queryFn: async () => {
      const r = (await listWorkspaceRows({
        data: { table, workspaceId, orderBy: "created_at", orderDir: "asc", limit: 1000 },
      })) as { rows?: Row[] };
      return r?.rows ?? [];
    },
  });
}

export function XproRoadmapView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const qc = useQueryClient();
  const today = todayISO();

  const peopleQ = useXproPeople(workspaceId);
  const manager = Boolean(peopleQ.data?.manager);
  const projectsQ = useWsRows("prj_projects", workspaceId);
  const milestonesQ = useWsRows("prj_milestones", workspaceId);
  const tasksQ = useXproTaskList(workspaceId, "all", 365);
  const sprintsQ = useQuery({
    queryKey: ["xpro", "sprints", workspaceId, "roadmap"],
    queryFn: () => listXproSprints({ data: { workspaceId, includeCompleted: true } }),
  });

  const [zoom, setZoom] = useState<Zoom>("month");
  const [project, setProject] = useState("");
  const [showDone, setShowDone] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  // Tanggal sementara selama batang digeser (sebelum disimpan).
  const [draft, setDraft] = useState<Record<string, { start: string; end: string }>>({});

  /* ------------------------------ susun pohon ------------------------------ */
  const items = useMemo(() => {
    const projects = (projectsQ.data ?? []).filter((p) => !project || p.id === project);
    const milestones = milestonesQ.data ?? [];
    const tasks = (tasksQ.data?.tasks ?? []).filter((x) => showDone || !x.is_done);
    const out: Item[] = [];
    const push = (it: Item) => out.push(it);

    const taskItem = (x: XproTask, depth: number, colorIdx: number): Item => ({
      key: `t:${x.id}`,
      kind: "task",
      id: x.id,
      name: x.name,
      start: d10(x.start_date) ?? (x.due_date ? d10(x.due_date) : null),
      end: d10(x.due_date) ?? d10(x.start_date),
      progress: x.is_done ? 100 : Number(x.progress_pct ?? 0),
      done: x.is_done,
      depth,
      childCount: 0,
      derived: false,
      colorIdx,
      task: x,
    });

    projects.forEach((p, pi) => {
      const ms = milestones.filter((m) => m.project_id === p.id);
      const pt = tasks.filter((x) => x.project_id === p.id);
      const kids = [
        ...ms.map((m) => [d10(m.start_date), d10(m.due_date)]),
        ...pt.map((x) => [d10(x.start_date), d10(x.due_date)]),
      ].flat();
      const own = Boolean(p.start_date || p.end_date);
      const msWeight = ms.reduce((s, m) => s + Number(m.weight_pct ?? 0), 0);
      // Progres tersimpan di server (tahapan & tugas); cadangan dihitung di sini.
      const stored = (p as { progress_pct?: unknown }).progress_pct;
      const progress =
        stored !== null && stored !== undefined
          ? Number(stored)
          : ms.length
            ? msWeight > 0
              ? ms.reduce(
                  (s, m) => s + Number(m.weight_pct ?? 0) * Number(m.progress_pct ?? 0),
                  0,
                ) / msWeight
              : ms.reduce((s, m) => s + Number(m.progress_pct ?? 0), 0) / ms.length
            : pt.length
              ? pt.reduce((s, x) => s + (x.is_done ? 100 : Number(x.progress_pct ?? 0)), 0) /
                pt.length
              : 0;
      const pItem: Item = {
        key: `p:${p.id}`,
        kind: "project",
        id: p.id,
        name: `${p.code ? `${p.code} · ` : ""}${p.name}`,
        start: own ? d10(p.start_date) : minIso(kids),
        end: own ? (d10(p.end_date) ?? maxIso(kids)) : maxIso(kids),
        progress,
        done: p.status === "completed",
        depth: 0,
        childCount:
          ms.length +
          pt.filter((x) => !x.milestone_id || !ms.some((m) => m.id === x.milestone_id)).length,
        derived: !own,
        colorIdx: pi % COLORS.length,
        row: p,
      };
      push(pItem);
      if (collapsed.has(pItem.key)) return;
      ms.slice()
        .sort((a, b) =>
          String(a.start_date ?? a.due_date ?? "9").localeCompare(
            String(b.start_date ?? b.due_date ?? "9"),
          ),
        )
        .forEach((m) => {
          const mt = pt.filter((x) => x.milestone_id === m.id);
          const ownM = Boolean(m.start_date || m.due_date);
          const mItem: Item = {
            key: `m:${m.id}`,
            kind: "milestone",
            id: m.id,
            name: String(m.name),
            start: ownM
              ? (d10(m.start_date) ?? d10(m.due_date))
              : minIso(mt.map((x) => d10(x.start_date) ?? d10(x.due_date))),
            end: ownM
              ? (d10(m.due_date) ?? d10(m.start_date))
              : maxIso(mt.map((x) => d10(x.due_date) ?? d10(x.start_date))),
            progress: Number(m.progress_pct ?? 0),
            done: m.status === "done",
            depth: 1,
            childCount: mt.length,
            derived: !ownM,
            colorIdx: pItem.colorIdx,
            row: m,
          };
          push(mItem);
          if (collapsed.has(mItem.key)) return;
          mt.forEach((x) => push(taskItem(x, 2, pItem.colorIdx)));
        });
      pt.filter((x) => !x.milestone_id || !ms.some((m) => m.id === x.milestone_id)).forEach((x) =>
        push(taskItem(x, 1, pItem.colorIdx)),
      );
    });

    if (!project || project === "__none") {
      const internal = tasks.filter((x) => !x.project_id);
      if (internal.length) {
        const key = "p:__none";
        push({
          key,
          kind: "project",
          id: "__none",
          name: t("Internal tasks (no project)", "Tugas internal (tanpa proyek)"),
          start: minIso(internal.map((x) => d10(x.start_date) ?? d10(x.due_date))),
          end: maxIso(internal.map((x) => d10(x.due_date) ?? d10(x.start_date))),
          progress:
            internal.reduce((s, x) => s + (x.is_done ? 100 : Number(x.progress_pct ?? 0)), 0) /
            internal.length,
          done: false,
          depth: 0,
          childCount: internal.length,
          derived: true,
          colorIdx: 5,
        });
        if (!collapsed.has(key)) internal.forEach((x) => push(taskItem(x, 1, 5)));
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsQ.data, milestonesQ.data, tasksQ.data, project, showDone, collapsed, lang]);

  const withDraft = (it: Item) => (draft[it.key] ? { ...it, ...draft[it.key] } : it);

  /* ------------------------------ rentang waktu ------------------------------ */
  const range = useMemo(() => {
    const starts = items.map((i) => i.start).concat(today);
    const ends = items.map((i) => i.end).concat(today);
    const lo = addDays(minIso(starts) ?? today, -14);
    const hi = addDays(maxIso(ends) ?? today, 45);
    // Rapikan ke awal bulan / akhir bulan supaya kepala kolom utuh.
    const from = `${lo.slice(0, 7)}-01`;
    const endMonth = new Date(Date.UTC(Number(hi.slice(0, 4)), Number(hi.slice(5, 7)), 0));
    const to = toIso(endMonth.getTime());
    return { from, to, days: dayDiff(from, to) + 1 };
  }, [items, today]);
  const ppd = PX_PER_DAY[zoom];
  const width = Math.max(range.days * ppd, 600);
  const xOf = (iso: string) => dayDiff(range.from, iso) * ppd;

  const months = useMemo(() => {
    const out: { label: string; x: number; w: number; year: string }[] = [];
    let cur = range.from;
    while (cur <= range.to) {
      const d = new Date(toNum(cur));
      const next = toIso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
      const x = dayDiff(range.from, cur) * ppd;
      const w = dayDiff(cur, next) * ppd;
      out.push({
        label: d.toLocaleDateString(lang === "id" ? "id-ID" : "en-GB", {
          month: zoom === "quarter" ? "short" : "long",
          timeZone: "UTC",
        }),
        year: String(d.getUTCFullYear()),
        x,
        w,
      });
      cur = next;
    }
    return out;
  }, [range, ppd, zoom, lang]);
  const weeks = useMemo(() => {
    if (zoom !== "week") return [];
    const out: { x: number; label: string }[] = [];
    let cur = range.from;
    const dow = (new Date(toNum(cur)).getUTCDay() + 6) % 7;
    cur = addDays(cur, dow ? 7 - dow : 0);
    while (cur <= range.to) {
      out.push({ x: xOf(cur), label: String(Number(cur.slice(8, 10))) });
      cur = addDays(cur, 7);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, zoom, ppd]);

  /* ------------------------------ gulir ke hari ini ------------------------------ */
  const scroller = useRef<HTMLDivElement>(null);
  const scrollToToday = () => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, xOf(today) - (el.clientWidth - LEFT_W) / 3);
  };
  const loaded = projectsQ.isSuccess && tasksQ.isSuccess && milestonesQ.isSuccess;
  useEffect(() => {
    if (loaded) requestAnimationFrame(scrollToToday);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, zoom]);

  /* ------------------------------ simpan tanggal ------------------------------ */
  const saveDates = useMutation({
    mutationFn: async ({ it, start, end }: { it: Item; start: string; end: string }) => {
      if (it.kind === "task") {
        await saveXproTask({
          data: { workspaceId, id: it.id, fields: { start_date: start, due_date: end } },
        });
      } else if (it.kind === "milestone") {
        await saveWorkspaceRow({
          data: {
            table: "prj_milestones",
            workspaceId,
            id: it.id,
            data: { start_date: start, due_date: end },
          },
        });
      } else if (it.id !== "__none") {
        await saveWorkspaceRow({
          data: {
            table: "prj_projects",
            workspaceId,
            id: it.id,
            data: { start_date: start, end_date: end },
          },
        });
      }
    },
    onSuccess: (_r, v) => {
      toast.success(t("Schedule updated", "Jadwal diperbarui"));
      void qc.invalidateQueries({ queryKey: ["xpro"] }).then(() =>
        setDraft((d) => {
          const n = { ...d };
          delete n[v.it.key];
          return n;
        }),
      );
    },
    onError: (e: Error, v) => {
      toast.error(e.message);
      setDraft((d) => {
        const n = { ...d };
        delete n[v.it.key];
        return n;
      });
    },
  });

  /* ------------------------------ geser / tarik batang ------------------------------ */
  const drag = useRef<{
    it: Item;
    mode: "move" | "start" | "end";
    x0: number;
    start: string;
    end: string;
    moved: boolean;
  } | null>(null);
  const canDrag = (it: Item) =>
    manager && !it.derived && Boolean(it.start && it.end) && it.id !== "__none";
  const onPointerDown = (e: React.PointerEvent, it: Item, mode: "move" | "start" | "end") => {
    if (!canDrag(it)) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { it, mode, x0: e.clientX, start: it.start!, end: it.end!, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const delta = Math.round((e.clientX - d.x0) / ppd);
    if (Math.abs(e.clientX - d.x0) > 3) d.moved = true;
    let s = d.start;
    let en = d.end;
    if (d.mode === "move") {
      s = addDays(d.start, delta);
      en = addDays(d.end, delta);
    } else if (d.mode === "start") s = minIso([addDays(d.start, delta), d.end])!;
    else en = maxIso([addDays(d.end, delta), d.start])!;
    setDraft((x) => ({ ...x, [d.it.key]: { start: s, end: en } }));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const next = draft[d.it.key];
    if (!d.moved || !next || (next.start === d.start && next.end === d.end)) {
      setDraft((x) => {
        const n = { ...x };
        delete n[d.it.key];
        return n;
      });
      if (!d.moved) openItem(d.it);
      return;
    }
    saveDates.mutate({ it: d.it, start: next.start, end: next.end });
  };

  const openItem = (it: Item) => {
    if (it.kind === "task") setOpenTask(it.id);
    else if (it.id !== "__none") setEditing(it);
  };
  const toggle = (key: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  if (projectsQ.isLoading || tasksQ.isLoading || milestonesQ.isLoading)
    return <PageSkeleton stats={0} />;

  const sprints = (sprintsQ.data ?? []).filter(
    (s) => s.start_date && s.end_date && (!project || !s.project_id || s.project_id === project),
  );
  const unscheduled = items.filter((i) => !i.start || !i.end).length;
  const todayX = xOf(today);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">XPRO</p>
          <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">Roadmap</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {manager
              ? t(
                  "Plan projects, milestones and tasks on one timeline. Drag a bar to move it, or drag its edges to change the dates.",
                  "Rencanakan proyek, tahapan, dan tugas dalam satu linimasa. Geser batang untuk memindahkan, tarik ujungnya untuk mengubah tanggal.",
                )
              : t(
                  "Projects, milestones and tasks on one timeline.",
                  "Proyek, tahapan, dan tugas dalam satu linimasa.",
                )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AdminSelect value={project} onChange={setProject} className="sm:w-64">
          <option value="">{t("All projects", "Semua proyek")}</option>
          {(projectsQ.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.code ? `${p.code} — ` : ""}
              {p.name}
            </option>
          ))}
          <option value="__none">{t("Internal (no project)", "Internal (tanpa proyek)")}</option>
        </AdminSelect>
        <div
          className="inline-flex rounded-xl bg-muted p-1"
          role="group"
          aria-label={t("Zoom", "Skala")}
        >
          {(
            [
              ["week", t("Weeks", "Minggu")],
              ["month", t("Months", "Bulan")],
              ["quarter", t("Quarters", "Kuartal")],
            ] as const
          ).map(([z, label]) => (
            <button
              key={z}
              type="button"
              aria-pressed={zoom === z}
              onClick={() => setZoom(z)}
              className={cn(
                "min-h-9 rounded-lg px-3 text-xs font-medium",
                zoom === z
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="min-h-9" onClick={scrollToToday}>
          <CalendarDays /> {t("Today", "Hari ini")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-9"
          onClick={() =>
            setCollapsed((s) =>
              s.size ? new Set() : new Set(items.filter((i) => i.childCount > 0).map((i) => i.key)),
            )
          }
        >
          {collapsed.size ? t("Expand all", "Buka semua") : t("Collapse all", "Tutup semua")}
        </Button>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
            className="h-4 w-4"
          />
          {t("Show finished tasks", "Tampilkan tugas selesai")}
        </label>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t(
            "No projects or tasks yet. Create a project or task to see it on the roadmap.",
            "Belum ada proyek atau tugas. Buat proyek atau tugas untuk melihatnya di roadmap.",
          )}
        </div>
      ) : (
        <div
          ref={scroller}
          className="relative max-h-[calc(100vh-15rem)] overflow-auto rounded-2xl border border-border bg-card"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="relative" style={{ width: LEFT_W + width }}>
            {/* Kepala: bulan/minggu + pita sprint */}
            <div className="sticky top-0 z-30 flex border-b border-border bg-card">
              <div
                className="sticky left-0 z-40 flex shrink-0 items-end border-r border-border bg-card px-3 pb-2 text-xs font-medium text-muted-foreground"
                style={{ width: LEFT_W }}
              >
                {t("Work", "Pekerjaan")}
              </div>
              <div className="relative" style={{ width, height: zoom === "week" ? 76 : 60 }}>
                {months.map((m) => (
                  <div
                    key={`${m.year}-${m.label}-${m.x}`}
                    className="absolute top-0 border-l border-border px-2 pt-1.5 text-xs font-medium"
                    style={{ left: m.x, width: m.w }}
                  >
                    <span className="truncate">{m.label}</span>{" "}
                    {(m.label.startsWith("Jan") || m.x === 0) && (
                      <span className="text-muted-foreground">{m.year}</span>
                    )}
                  </div>
                ))}
                {weeks.map((w) => (
                  <div
                    key={w.x}
                    className="absolute top-6 border-l border-border/60 pl-1 text-[10px] text-muted-foreground"
                    style={{ left: w.x }}
                  >
                    {w.label}
                  </div>
                ))}
                {todayX >= 0 && todayX <= width && (
                  <div
                    className="absolute bottom-0 top-0 z-10 w-0.5 bg-rose-500/80"
                    style={{ left: todayX }}
                  >
                    <span className="absolute -left-6 top-0.5 w-12 rounded bg-rose-500 py-0.5 text-center text-[9px] font-semibold text-white">
                      {t("Today", "Hari ini")}
                    </span>
                  </div>
                )}
                {sprints.map((s) => {
                  const x = xOf(d10(s.start_date)!);
                  const w = Math.max(
                    ppd,
                    (dayDiff(d10(s.start_date)!, d10(s.end_date)!) + 1) * ppd,
                  );
                  return (
                    <div
                      key={s.id}
                      title={`${s.name} (${d10(s.start_date)} – ${d10(s.end_date)})`}
                      className={cn(
                        "absolute bottom-1.5 h-5 truncate rounded-md px-2 text-[10px] font-medium leading-5",
                        s.status === "active"
                          ? "bg-navy text-primary-foreground dark:bg-violet-600"
                          : s.status === "completed"
                            ? "bg-muted text-muted-foreground"
                            : "border border-dashed border-border text-muted-foreground",
                      )}
                      style={{ left: x, width: w }}
                    >
                      {s.name}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Garis bulan & hari ini di belakang baris */}
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-0"
              style={{ left: LEFT_W, width }}
            >
              {months.map((m) => (
                <div
                  key={m.x}
                  className="absolute bottom-0 top-0 border-l border-border/50"
                  style={{ left: m.x }}
                />
              ))}
              {todayX >= 0 && todayX <= width && (
                <div
                  className="absolute bottom-0 top-0 z-20 w-0.5 bg-rose-500/80"
                  style={{ left: todayX }}
                />
              )}
            </div>

            {items.map((raw) => {
              const it = withDraft(raw);
              const c = COLORS[it.colorIdx];
              const Icon =
                it.kind === "project" ? FolderKanban : it.kind === "milestone" ? Flag : ListTodo;
              const has = Boolean(it.start && it.end);
              const x = has ? xOf(it.start!) : 0;
              const w = has ? Math.max(ppd * 1, (dayDiff(it.start!, it.end!) + 1) * ppd) : 0;
              const late = !it.done && it.end && it.end < today && it.kind !== "project";
              return (
                <div
                  key={it.key}
                  className="group relative z-10 flex border-b border-border/60"
                  style={{ height: ROW_H }}
                >
                  <div
                    className={cn(
                      "sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-border bg-card pr-2 group-hover:bg-muted/40",
                      it.kind === "project" && "font-medium",
                    )}
                    style={{ width: LEFT_W, paddingLeft: 8 + it.depth * 18 }}
                  >
                    {it.childCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => toggle(it.key)}
                        aria-label={
                          collapsed.has(it.key) ? t("Expand", "Buka") : t("Collapse", "Tutup")
                        }
                        aria-expanded={!collapsed.has(it.key)}
                        className="grid size-6 shrink-0 place-items-center rounded hover:bg-muted"
                      >
                        {collapsed.has(it.key) ? (
                          <ChevronRight className="size-4" />
                        ) : (
                          <ChevronDown className="size-4" />
                        )}
                      </button>
                    ) : (
                      <span className="w-6 shrink-0" />
                    )}
                    <Icon className={cn("size-4 shrink-0", c.text)} aria-hidden="true" />
                    <button
                      type="button"
                      onClick={() => openItem(it)}
                      className={cn(
                        "min-w-0 flex-1 truncate text-left text-sm hover:underline",
                        it.done && "text-muted-foreground line-through",
                      )}
                      title={it.name}
                    >
                      {it.name}
                    </button>
                    {it.kind === "task" && it.task?.assignees?.[0] && (
                      <span
                        className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold"
                        title={it.task.assignees.map((a) => a.name).join(", ")}
                      >
                        {it.task.assignees[0].name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="relative" style={{ width }}>
                    {has ? (
                      <div
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openItem(it)}
                        onPointerDown={(e) =>
                          canDrag(it) ? onPointerDown(e, it, "move") : undefined
                        }
                        onClick={() => !canDrag(it) && openItem(it)}
                        title={`${it.name}\n${it.start} – ${it.end}${it.progress ? `\n${Math.round(it.progress)}%` : ""}`}
                        className={cn(
                          "absolute top-1/2 -translate-y-1/2 overflow-hidden shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          it.kind === "project"
                            ? "h-6 rounded-md"
                            : it.kind === "milestone"
                              ? "h-5 rounded-md"
                              : "h-4 rounded-full",
                          it.derived
                            ? "border border-dashed border-current bg-transparent"
                            : c.soft,
                          it.derived && c.text,
                          late && "ring-2 ring-rose-500",
                          canDrag(it)
                            ? "cursor-grab touch-none active:cursor-grabbing"
                            : "cursor-pointer",
                        )}
                        style={{ left: x, width: w }}
                      >
                        {!it.derived && (
                          <div
                            className={cn("h-full", c.bar, it.done && "opacity-60")}
                            style={{ width: `${Math.min(100, Math.max(0, it.progress))}%` }}
                          />
                        )}
                        {it.kind !== "task" && w > 70 && (
                          <span className="pointer-events-none absolute inset-0 flex items-center px-2 text-[10px] font-semibold text-foreground/80">
                            {Math.round(it.progress)}%
                          </span>
                        )}
                        {canDrag(it) && (
                          <>
                            <span
                              onPointerDown={(e) => onPointerDown(e, it, "start")}
                              className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-black/20"
                              aria-hidden="true"
                            />
                            <span
                              onPointerDown={(e) => onPointerDown(e, it, "end")}
                              className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-black/20"
                              aria-hidden="true"
                            />
                          </>
                        )}
                      </div>
                    ) : (
                      it.id !== "__none" && (
                        <button
                          type="button"
                          onClick={() => openItem(it)}
                          className="sticky left-[310px] top-2 ml-2 mt-2 inline-flex h-6 items-center rounded-full border border-dashed px-2.5 text-[11px] text-muted-foreground hover:bg-muted"
                        >
                          {manager
                            ? t("Not scheduled · set dates", "Belum dijadwalkan · atur tanggal")
                            : t("Not scheduled", "Belum dijadwalkan")}
                        </button>
                      )
                    )}
                    {draft[it.key] && (
                      <span
                        className="pointer-events-none absolute -top-0.5 z-30 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background"
                        style={{ left: x }}
                      >
                        {it.start} – {it.end}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <FolderKanban className="size-3.5" /> {t("Project", "Proyek")}
        </span>
        <span className="flex items-center gap-1.5">
          <Flag className="size-3.5" /> {t("Milestone", "Tahapan")}
        </span>
        <span className="flex items-center gap-1.5">
          <ListTodo className="size-3.5" /> {t("Task", "Tugas")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded border border-dashed border-muted-foreground" />
          {t("Range from its items (no own dates)", "Rentang dari isinya (tanpa tanggal sendiri)")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded ring-2 ring-rose-500" />{" "}
          {t("Late", "Terlambat")}
        </span>
        {unscheduled > 0 && (
          <span>
            {unscheduled} {t("not scheduled", "belum dijadwalkan")}
          </span>
        )}
      </div>

      <XproTaskDialog
        workspaceId={workspaceId}
        taskId={openTask}
        open={Boolean(openTask)}
        onOpenChange={(o) => !o && setOpenTask(null)}
      />
      {editing && (
        <DatesDialog
          item={editing}
          canEdit={manager}
          saving={saveDates.isPending}
          onClose={() => setEditing(null)}
          onSave={(start, end) =>
            saveDates.mutate({ it: editing, start, end }, { onSuccess: () => setEditing(null) })
          }
        />
      )}
    </div>
  );
}

function DatesDialog({
  item,
  canEdit,
  saving,
  onClose,
  onSave,
}: {
  item: Item;
  canEdit: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (start: string, end: string) => void;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const own = !item.derived;
  const [start, setStart] = useState((own && item.start) || todayISO());
  const [end, setEnd] = useState((own && item.end) || addDays(todayISO(), 14));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>
            {item.kind === "project"
              ? t("Project schedule", "Jadwal proyek")
              : t("Milestone schedule", "Jadwal tahapan")}
            {item.derived && item.start
              ? ` · ${t("now follows its items", "saat ini mengikuti isinya")}: ${item.start} – ${item.end}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rm-start">{t("Start", "Mulai")}</Label>
            <Input
              id="rm-start"
              type="date"
              value={start}
              disabled={!canEdit}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rm-end">
              {item.kind === "project" ? t("End", "Selesai") : t("Due", "Tenggat")}
            </Label>
            <Input
              id="rm-end"
              type="date"
              value={end}
              disabled={!canEdit}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("Progress", "Progres")}: {Math.round(item.progress)}%
        </p>
        {canEdit && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t("Cancel", "Batal")}
            </Button>
            <Button
              variant="navy"
              disabled={!start || !end || end < start || saving}
              onClick={() => onSave(start, end)}
            >
              {t("Save dates", "Simpan tanggal")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
