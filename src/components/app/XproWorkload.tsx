/**
 * XPro — Beban Kerja Tim berbasis jam: heatmap jam terjadwal per minggu vs kapasitas per orang.
 * Perhitungan murni ada di src/lib/xpro-workload.ts.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, Gauge, HelpCircle, Mail, Users } from "lucide-react";
import { toast } from "sonner";

import { AdminSelect, todayISO } from "@/components/app/admin-ui";
import { PageSkeleton } from "@/components/app/ui-states";
import { XproTaskDialog, useT, useXproPeople, useXproTaskList } from "@/components/app/XproTasks";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/lib/app-context";
import { getNotificationPrefs, setNotificationPref } from "@/lib/notification-prefs.functions";
import {
  PersonDetailDialog,
  WorkloadInsights,
  currentTaskOf,
} from "@/components/app/XproWorkloadInsights";
import { cn } from "@/lib/utils";
import { type LoadLevel, type PersonLoad, computeHoursLoad } from "@/lib/xpro-workload";
import { setXproCapacity } from "@/lib/xpro-tasks.functions";

const LEVEL: Record<LoadLevel, { en: string; id: string; cls: string; rank: number }> = {
  overload: {
    en: "Overload",
    id: "Overload",
    cls: "bg-red-500/15 text-red-700 dark:text-red-300",
    rank: 0,
  },
  full: {
    en: "Full",
    id: "Penuh",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    rank: 1,
  },
  normal: {
    en: "Normal",
    id: "Normal",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    rank: 2,
  },
  light: { en: "Available", id: "Longgar", cls: "bg-muted text-muted-foreground", rank: 3 },
};

/** Warna sel heatmap menurut rasio jam terhadap kapasitas mingguan. */
function cellTone(hours: number, capacity: number) {
  if (hours <= 0.05) return "bg-muted/40 text-muted-foreground";
  const r = capacity > 0 ? hours / capacity : 2;
  if (r > 1) return "bg-red-500/80 text-white";
  if (r >= 0.85) return "bg-amber-400/80 text-amber-950";
  if (r >= 0.5) return "bg-emerald-500/70 text-white";
  return "bg-emerald-500/25 text-emerald-900 dark:text-emerald-100";
}

const fmtH = (h: number) => (Math.round(h * 10) / 10).toLocaleString("id-ID");

function weekLabel(iso: string, lang: "id" | "en") {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(lang === "id" ? "id-ID" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function XproWorkloadView({ workspaceId }: { workspaceId: string }) {
  const t = useT();
  const lang = t("en", "id") as "id" | "en";
  const qc = useQueryClient();
  const peopleQ = useXproPeople(workspaceId);
  // 60 hari agar grafik "selesai per minggu" (8 minggu) punya data.
  const tasksQ = useXproTaskList(workspaceId, "all", 60);
  const [horizon, setHorizon] = useState(6);
  const [project, setProject] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<PersonLoad | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const manager = Boolean(peopleQ.data?.manager);

  const tasks = useMemo(() => {
    const all = tasksQ.data?.tasks ?? [];
    if (!project) return all;
    return all.filter((x) => (project === "__none" ? !x.project_id : x.project_id === project));
  }, [tasksQ.data, project]);
  const projects = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of tasksQ.data?.tasks ?? [])
      if (x.project_id) m.set(x.project_id, `${x.project_code ?? ""} — ${x.project_name ?? ""}`);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasksQ.data]);

  const today = todayISO();
  const load = useMemo(
    () => computeHoursLoad(tasks, peopleQ.data?.people ?? [], today, horizon),
    [tasks, peopleQ.data, today, horizon],
  );

  const { activeWorkspace } = useApp();
  const tenantId = activeWorkspace?.tenant_id ?? "";
  const prefsKey = ["notification-prefs", tenantId];
  const prefsQ = useQuery({
    queryKey: prefsKey,
    enabled: Boolean(tenantId) && manager,
    queryFn: () => getNotificationPrefs({ data: { tenantId } }),
  });
  const savePref = useMutation({
    mutationFn: (enabled: boolean) =>
      setNotificationPref({ data: { tenantId, kind: "xpro_task_digest", enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: prefsKey }),
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const saveCap = useMutation({
    mutationFn: (p: { userId: string; hours: number }) =>
      setXproCapacity({ data: { workspaceId, userId: p.userId, hours: p.hours } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["xpro", "people", workspaceId] });
      toast.success(t("Capacity saved", "Kapasitas tersimpan"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  if (peopleQ.isLoading || tasksQ.isLoading) return <PageSkeleton stats={4} />;

  // Hanya orang yang terlibat: punya tugas aktif, atau menyelesaikan tugas 30 hari terakhir
  // (mengikuti filter proyek). "Tampilkan semua anggota" untuk mengatur kapasitas orang lain.
  const involved = load.rows.filter((r) => r.active > 0 || r.done30 > 0);
  const hiddenCount = load.rows.length - involved.length;
  const rows = [...(showAll ? load.rows : involved)].sort(
    (a, b) =>
      LEVEL[a.level].rank - LEVEL[b.level].rank ||
      b.weeks[0] - a.weeks[0] ||
      a.name.localeCompare(b.name),
  );
  if (load.unassigned.active)
    rows.push({ ...load.unassigned, name: t("Unassigned", "Belum ditugaskan") });

  const teamRemaining = load.rows.reduce((s, r) => s + r.remaining, 0) + load.unassigned.remaining;
  const teamCapacity = involved.filter((r) => r.user_id).reduce((s, r) => s + r.capacity, 0);
  const thisWeek = load.rows.reduce((s, r) => s + r.weeks[0], 0) + load.unassigned.weeks[0];
  const overloaded = load.rows.filter((r) => r.level === "overload").length;
  const noEstimate = new Set(
    tasks.filter((x) => !x.is_done && x.estimate_hours === null).map((x) => x.id),
  ).size;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">XPRO</p>
          <h1 className="text-xl font-semibold text-navy sm:text-2xl dark:text-primary-foreground">
            {t("Team Workload", "Beban Kerja Tim")}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t(
              "Remaining estimated hours spread over working days until each due date, compared with each person's weekly capacity.",
              "Sisa jam estimasi disebar ke hari kerja hingga tenggat, dibandingkan dengan kapasitas mingguan tiap orang.",
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          icon={Clock}
          label={t("This week", "Minggu ini")}
          value={`${fmtH(thisWeek)} / ${fmtH(teamCapacity)} ${t("h", "jam")}`}
        />
        <Tile
          icon={Gauge}
          label={t("Remaining hours", "Sisa jam tim")}
          value={`${fmtH(teamRemaining)} ${t("h", "jam")}`}
        />
        <Tile
          icon={AlertTriangle}
          label={t("Overloaded people", "Orang overload")}
          value={String(overloaded)}
          tone={overloaded ? "text-destructive" : undefined}
        />
        <Tile
          icon={HelpCircle}
          label={t("Tasks without estimate", "Tugas tanpa estimasi")}
          value={String(noEstimate)}
          tone={noEstimate ? "text-amber-600 dark:text-amber-400" : undefined}
        />
      </div>

      <WorkloadInsights tasks={tasks} rows={load.rows} />

      <div className="q-filters flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <AdminSelect value={project} onChange={setProject} className="sm:w-64">
          <option value="">{t("All projects", "Semua proyek")}</option>
          <option value="__none">{t("Internal (no project)", "Internal (tanpa proyek)")}</option>
          {projects.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </AdminSelect>
        <AdminSelect
          value={String(horizon)}
          onChange={(v) => setHorizon(Number(v))}
          className="sm:w-44"
        >
          {[4, 6, 8, 12].map((n) => (
            <option key={n} value={n}>
              {n} {t("weeks", "minggu")}
            </option>
          ))}
        </AdminSelect>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground sm:ml-auto">
          <Legend cls="bg-emerald-500/25" label="< 50%" />
          <Legend cls="bg-emerald-500/70" label="50–85%" />
          <Legend cls="bg-amber-400/80" label="85–100%" />
          <Legend cls="bg-red-500/80" label="> 100%" />
        </div>
      </div>

      {manager && tenantId && (
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-card p-3 sm:p-4">
          <div className="flex min-w-0 items-start gap-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {t("Daily task reminder email", "Email pengingat tugas harian")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Every morning (07:00 WIB) each PIC gets one email listing overdue tasks and tasks due today or tomorrow. In-app notifications are always on.",
                  "Setiap pagi (07.00 WIB) tiap PIC menerima satu email berisi tugas terlambat serta yang bertenggat hari ini atau besok. Notifikasi di aplikasi selalu aktif.",
                )}
              </p>
            </div>
          </div>
          <Switch
            checked={prefsQ.data?.xpro_task_digest ?? true}
            disabled={!prefsQ.data || savePref.isPending}
            onCheckedChange={(v) => savePref.mutate(v)}
            aria-label={t("Daily task reminder email", "Email pengingat tugas harian")}
          />
        </div>
      )}

      {/* Heatmap: tetap tabel (q-keep) dan bisa digeser horizontal di HP; kolom nama menempel. */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="q-keep w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 border-b border-border bg-card px-3 py-2.5 font-medium">
                {t("Person", "Orang")}
              </th>
              <th className="border-b border-border px-2 py-2.5 text-right font-medium">
                {t("Capacity/wk", "Kapasitas/mgg")}
              </th>
              {load.weekStarts.map((w, i) => (
                <th key={w} className="border-b border-border px-1 py-2.5 text-center font-medium">
                  {i === 0 ? t("This wk", "Mgg ini") : weekLabel(w, lang)}
                </th>
              ))}
              <th className="border-b border-border px-2 py-2.5 text-right font-medium">
                {t("No date", "Tanpa jadwal")}
              </th>
              <th className="border-b border-border px-2 py-2.5 text-right font-medium">
                {t("Active", "Aktif")}
              </th>
              <th className="border-b border-border px-3 py-2.5 text-right font-medium">
                {t("Late", "Telat")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key || "__unassigned"} className="group">
                <td className="sticky left-0 z-10 border-b border-border bg-card px-3 py-2 group-hover:bg-muted/40">
                  <button
                    type="button"
                    onClick={() => setSelected(r)}
                    className="flex max-w-[11rem] flex-col items-start text-left"
                  >
                    <span className="truncate font-medium text-navy hover:underline dark:text-foreground">
                      {r.name}
                    </span>
                    {currentTaskOf(r, today) && (
                      <span className="mt-0.5 max-w-[11rem] truncate text-[11px] text-muted-foreground">
                        ▸ {currentTaskOf(r, today)!.name}
                      </span>
                    )}
                    <span
                      className={cn(
                        "mt-0.5 rounded-full px-1.5 text-[10px] font-medium",
                        LEVEL[r.level].cls,
                      )}
                    >
                      {t(LEVEL[r.level].en, LEVEL[r.level].id)}
                    </span>
                  </button>
                </td>
                <td className="border-b border-border px-2 py-2 text-right">
                  {r.user_id && manager ? (
                    <CapacityInput
                      value={r.capacity}
                      onSave={(hours) => saveCap.mutate({ userId: r.user_id!, hours })}
                    />
                  ) : r.key ? (
                    <span className="text-muted-foreground">{fmtH(r.capacity)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                {r.weeks.map((h, i) => (
                  <td key={i} className="border-b border-border p-1">
                    <div
                      title={`${fmtH(h)} / ${fmtH(r.capacity)} ${t("h", "jam")}`}
                      className={cn(
                        "flex h-10 min-w-[3.25rem] flex-col items-center justify-center rounded-lg text-xs font-semibold tabular-nums",
                        r.key ? cellTone(h, r.capacity) : "bg-muted/40 text-muted-foreground",
                      )}
                    >
                      {h > 0.05 ? fmtH(h) : "·"}
                      {h > 0.05 && r.capacity > 0 && r.key && (
                        <span className="text-[10px] font-normal opacity-80">
                          {Math.round((h / r.capacity) * 100)}%
                        </span>
                      )}
                    </div>
                  </td>
                ))}
                <td className="border-b border-border px-2 py-2 text-right tabular-nums text-muted-foreground">
                  {r.unscheduled > 0.05 ? fmtH(r.unscheduled) : "—"}
                </td>
                <td className="border-b border-border px-2 py-2 text-right tabular-nums">
                  {r.active}
                  {r.noEstimate > 0 && (
                    <span
                      className="ml-1 text-[10px] text-amber-600"
                      title={t("without estimate", "tanpa estimasi")}
                    >
                      ({r.noEstimate}?)
                    </span>
                  )}
                </td>
                <td
                  className={cn(
                    "border-b border-border px-3 py-2 text-right tabular-nums",
                    r.overdue > 0 && "font-semibold text-destructive",
                  )}
                >
                  {r.overdue || "—"}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={load.weekStarts.length + 5}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  {hiddenCount > 0
                    ? t(
                        "Nobody has tasks here yet. Assign tasks to see their workload.",
                        "Belum ada yang mendapat tugas. Tugaskan seseorang untuk melihat beban kerjanya.",
                      )
                    : t("No team members yet.", "Belum ada anggota tim.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-xs font-medium text-navy underline-offset-2 hover:underline dark:text-foreground"
        >
          {showAll
            ? t("Show only people with tasks", "Tampilkan hanya yang punya tugas")
            : t(
                `Show all members (${hiddenCount} without tasks hidden)`,
                `Tampilkan semua anggota (${hiddenCount} tanpa tugas disembunyikan)`,
              )}
        </button>
      )}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t(
          "Tasks with several PICs split their hours evenly. Overdue work counts in this week. Default capacity is 40 h/week; managers can change it per person.",
          "Tugas dengan beberapa PIC dibagi rata jamnya. Pekerjaan terlambat dihitung di minggu ini. Kapasitas bawaan 40 jam/minggu; pengelola dapat mengubahnya per orang.",
        )}
      </p>

      <PersonDetailDialog
        person={selected}
        allTasks={tasks}
        weekStarts={load.weekStarts}
        onClose={() => setSelected(null)}
        onOpenTask={setOpenTask}
      />

      <XproTaskDialog
        workspaceId={workspaceId}
        taskId={openTask}
        open={Boolean(openTask)}
        onOpenChange={(o) => !o && setOpenTask(null)}
      />
    </div>
  );
}

function CapacityInput({ value, onSave }: { value: number; onSave: (hours: number) => void }) {
  const [v, setV] = useState(String(value));
  const commit = () => {
    const n = Number(v);
    if (!Number.isFinite(n) || n === value) {
      setV(String(value));
      return;
    }
    onSave(n);
  };
  return (
    <Input
      type="number"
      min={0}
      max={168}
      inputMode="numeric"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="ml-auto h-8 w-16 text-right tabular-nums"
      aria-label="Kapasitas jam per minggu"
    />
  );
}

function Tile({
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

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-3 rounded", cls)} />
      {label}
    </span>
  );
}
