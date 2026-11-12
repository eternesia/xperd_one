import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  FileText,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { AdminField, AdminSelect, fmtIDR, todayISO } from "@/components/app/admin-ui";
import { PartyPicker } from "@/components/app/Pickers";
import {
  PageSkeleton,
  PaginationBar,
  SearchInput,
  usePagination,
  useSearchFilter,
} from "@/components/app/ui-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApp } from "@/lib/app-context";
import {
  countWorkspaceRows,
  deleteWorkspaceRow,
  listWorkspaceRows,
  saveWorkspaceRow,
} from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import { nextDocNumber } from "@/lib/procurement";
import { XproProjectDetail } from "@/components/app/XproDetail";
import { XproMyTasksView } from "@/components/app/XproTasks";
import { XproBacklogView } from "@/components/app/XproBacklog";
import { XproKanbanView } from "@/components/app/XproKanban";
import { XproWorkloadView } from "@/components/app/XproWorkload";
import { XproRoadmapView } from "@/components/app/XproRoadmap";

/**
 * Ronde 33 — modul add-on **XPro** (Proyek & Kontrak, Milestone & Tugas, RAB,
 * Tagihan Termin/BAST). Diporting **apa adanya** dari `Xperd One Business Suite
 * New 10` (`src/components/app/XproViews.tsx` + `XproDetail.tsx`) sesuai
 * permintaan pemilik produk, hanya lapisan datanya yang memakai server fn MySQL
 * Old (`listWorkspaceRows` / `saveWorkspaceRow` / `deleteWorkspaceRow`) —
 * bukan Supabase.
 *
 * Perilaku yang dipertahankan sama:
 *  - progres fisik proyek = Σ(bobot × progres) / Σ(bobot);
 *  - BAST disetujui diterbitkan menjadi **draft AR Invoice** (neto retensi),
 *    tanpa jurnal — posting terjadi saat invoice di-submit di modul Sales;
 *  - nilai uang (kontrak/RAB/tagihan) hanya tampil untuk owner/admin.
 */
export interface XproRow {
  /** Baris baru belum punya id (dibuat server); baris lama selalu punya. */
  id?: string;
  [key: string]: unknown;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

const PROJECT_STATUS = ["planning", "active", "on_hold", "completed", "cancelled"];
const MS_STATUS = ["not_started", "in_progress", "done"];
const BUDGET_CATS = [
  { id: "material", en: "Material", id_: "Material" },
  { id: "labor", en: "Labor", id_: "Tenaga Kerja / Upah" },
  { id: "subcon", en: "Subcontractor / Equipment", id_: "Subkon / Sewa Alat" },
  { id: "overhead", en: "Site Overhead", id_: "Operasional Lapangan" },
];

function useT() {
  const { lang } = useI18n();
  return (en: string, id: string) => (lang === "id" ? id : en);
}

/** Owner/admin melihat nilai uang; peran lain hanya progres. */
function useCanSeeValue() {
  const { workspaceRole } = useApp();
  return workspaceRole === "owner" || workspaceRole === "admin";
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

const asRows = (r: unknown) => ((r as { rows?: XproRow[] } | undefined)?.rows ?? []) as XproRow[];

function useRows(
  table: string,
  workspaceId: string,
  order = "created_at",
  dir: "asc" | "desc" = "desc",
) {
  return useQuery({
    queryKey: ["xpro", table, workspaceId, order, dir],
    queryFn: async () =>
      asRows(
        await listWorkspaceRows({
          data: { table, workspaceId, orderBy: order, orderDir: dir, limit: 1000 },
        }),
      ),
  });
}

function useSave(table: string, workspaceId: string) {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: async (row: XproRow) => {
      const { id, ...rest } = row;
      await saveWorkspaceRow({
        data: { table, workspaceId, id: id as string | undefined, data: rest },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["xpro"] });
      toast.success(t("Saved", "Tersimpan"));
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function useRemove(table: string, workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table, workspaceId, id } });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["xpro"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

function ProjectFilter({
  projects,
  value,
  onChange,
  all = true,
}: {
  projects: XproRow[];
  value: string;
  onChange: (v: string) => void;
  all?: boolean;
}) {
  const t = useT();
  return (
    <AdminSelect value={value} onChange={onChange} className="sm:w-64">
      {all && <option value="">{t("All projects", "Semua proyek")}</option>}
      {!all && <option value="">{t("Select project…", "Pilih proyek…")}</option>}
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {String(p.code)} — {String(p.name)}
        </option>
      ))}
    </AdminSelect>
  );
}

function statusBadge(s: string) {
  const tone =
    s === "completed" || s === "done" || s === "invoiced"
      ? "default"
      : s === "cancelled"
        ? "destructive"
        : "secondary";
  return (
    <Badge variant={tone} className="capitalize">
      {s.replace("_", " ")}
    </Badge>
  );
}

/**
 * Progres fisik proyek. Utamakan nilai tersimpan (prj_projects.progress_pct, dihitung server dari
 * tahapan & tugas); cadangan: Σ(bobot × progres tahapan) / Σ(bobot).
 */
function projectProgress(projectId: string, milestones: XproRow[], row?: XproRow) {
  if (row && row.progress_pct !== null && row.progress_pct !== undefined)
    return num(row.progress_pct);
  const ms = milestones.filter((m) => m.project_id === projectId);
  const w = ms.reduce((s, m) => s + num(m.weight_pct), 0);
  if (!w) return 0;
  return ms.reduce((s, m) => s + num(m.weight_pct) * num(m.progress_pct), 0) / w;
}

/* ------------------------------- dashboard ------------------------------- */

export function XproDashboard({ workspaceId }: { workspaceId: string }) {
  const t = useT();
  const projects = useRows("prj_projects", workspaceId);
  const milestones = useRows("prj_milestones", workspaceId);
  const budget = useRows("prj_budget_lines", workspaceId);
  const billings = useRows("prj_billings", workspaceId);
  const tasks = useRows("prj_tasks", workspaceId);
  const members = useRows("prj_members", workspaceId);
  const canSeeValue = useCanSeeValue();
  const { email } = useApp();

  // BS New 11: penerima tugas (Staff/Viewer) hanya bekerja dari papan Kanban-nya.
  if (!canSeeValue) return <XproKanbanView workspaceId={workspaceId} />;

  if (projects.isLoading || milestones.isLoading || budget.isLoading || billings.isLoading)
    return <PageSkeleton stats={4} />;
  const P = projects.data ?? [];
  const M = milestones.data ?? [];
  const B = budget.data ?? [];
  const BL = billings.data ?? [];
  const today = todayISO();
  const active = P.filter((p) => p.status === "active");
  const contract = P.reduce((s, p) => s + num(p.contract_value), 0);
  const rab = B.reduce((s, b) => s + num(b.amount), 0);
  const billed = BL.filter((b) => b.status === "invoiced").reduce((s, b) => s + num(b.amount), 0);
  const avgProg = active.length
    ? active.reduce((s, p) => s + projectProgress(String(p.id ?? ""), M, p), 0) / active.length
    : 0;
  const late = M.filter((m) => m.status !== "done" && m.due_date && String(m.due_date) < today);
  const chart = P.slice(0, 8).map((p) => ({
    name: p.code,
    [t("Contract", "Kontrak")]: num(p.contract_value),
    RAB: B.filter((b) => b.project_id === p.id).reduce((s, b) => s + num(b.amount), 0),
    [t("Billed", "Ditagih")]: BL.filter(
      (b) => b.project_id === p.id && b.status === "invoiced",
    ).reduce((s, b) => s + num(b.amount), 0),
  }));

  const me = (email ?? "").toLowerCase();
  const myNames = new Set(
    (members.data ?? [])
      .filter((m) => me && String(m.email ?? "").toLowerCase() === me)
      .map((m) => String(m.name ?? "").toLowerCase()),
  );
  if (me) myNames.add(me);
  const allTasks = tasks.data ?? [];
  const visibleTasks = (
    canSeeValue
      ? allTasks
      : allTasks.filter((x) => myNames.has(String(x.assignee ?? "").toLowerCase()))
  )
    .slice()
    .sort(
      (a, b) =>
        (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0) ||
        String(a.due_date ?? "9").localeCompare(String(b.due_date ?? "9")),
    );
  const openTasks = visibleTasks.filter((x) => x.status !== "done");
  const taskCard = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {canSeeValue ? t("Tasks", "Tugas") : t("My tasks", "Tugas saya")} ({openTasks.length}{" "}
          {t("open", "aktif")})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{t("Task", "Tugas")}</TableHead>
              <TableHead>{t("Project", "Proyek")}</TableHead>
              {canSeeValue && <TableHead>PIC</TableHead>}
              <TableHead>{t("Due", "Tenggat")}</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!visibleTasks.length && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {canSeeValue
                    ? t("No tasks yet.", "Belum ada tugas.")
                    : t(
                        "No tasks assigned to you. Ask your PM to add you (with your login email) to the project team.",
                        "Belum ada tugas untuk Anda. Minta PM menambahkan Anda (dengan email login) ke tim proyek.",
                      )}
                </TableCell>
              </TableRow>
            )}
            {visibleTasks.slice(0, 20).map((x, i) => {
              const isLate = x.status !== "done" && x.due_date && String(x.due_date) < today;
              return (
                <TableRow key={x.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{String(x.name)}</TableCell>
                  <TableCell className="text-xs">
                    {String(P.find((p) => p.id === x.project_id)?.code ?? "-")}
                  </TableCell>
                  {canSeeValue && (
                    <TableCell className="text-xs">{String(x.assignee ?? "-")}</TableCell>
                  )}
                  <TableCell
                    className={`whitespace-nowrap text-xs ${isLate ? "text-destructive" : ""}`}
                  >
                    {String(x.due_date ?? "-")}
                  </TableCell>
                  <TableCell className="text-right">{num(x.progress_pct)}%</TableCell>
                  <TableCell>
                    <Badge
                      variant={x.status === "done" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {String(x.status).replace("_", " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  if (!canSeeValue) {
    return (
      <div className="space-y-6">
        <Header
          title={t("Project Dashboard", "Dasbor Proyek")}
          desc={t("Your tasks and project progress.", "Tugas Anda dan progres proyek.")}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              [t("Active projects", "Proyek aktif"), `${active.length} / ${P.length}`],
              [t("My open tasks", "Tugas aktif saya"), String(openTasks.length)],
              [t("Avg. physical progress", "Rata-rata progres fisik"), `${avgProg.toFixed(1)}%`],
            ] as const
          ).map(([l, v]) => (
            <Card key={l}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{l}</p>
                <p className="text-lg font-semibold">{v}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        {taskCard}
      </div>
    );
  }

  const kpis = [
    {
      label: t("Active projects", "Proyek aktif"),
      value: `${active.length} / ${P.length}`,
      icon: Briefcase,
    },
    { label: t("Contract value", "Nilai kontrak"), value: fmtIDR(contract), icon: FileText },
    { label: t("Total budget (RAB)", "Total RAB"), value: fmtIDR(rab), icon: Wallet },
    { label: t("Billed (invoiced)", "Sudah ditagih"), value: fmtIDR(billed), icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-6">
      <Header
        title={t("Project Dashboard", "Dasbor Proyek")}
        desc={t(
          "Progress, budget and progress billing across projects.",
          "Progres, anggaran, dan tagihan termin seluruh proyek.",
        )}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <k.icon className="h-8 w-8 shrink-0 text-gold" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="truncate text-lg font-semibold">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {t("Contract vs budget vs billed", "Kontrak vs RAB vs Tagihan")}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(Number(v) / 1e6)}jt`} />
                <Tooltip formatter={(v) => fmtIDR(Number(v))} />
                <Bar dataKey={t("Contract", "Kontrak")} fill="hsl(220 60% 25%)" />
                <Bar dataKey="RAB" fill="hsl(43 80% 55%)" />
                <Bar dataKey={t("Billed", "Ditagih")} fill="hsl(160 60% 40%)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Health", "Kesehatan Proyek")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span>{t("Avg. physical progress", "Rata-rata progres fisik")}</span>
              <b>{avgProg.toFixed(1)}%</b>
            </div>
            <div className="flex justify-between">
              <span>{t("Remaining to bill", "Sisa belum ditagih")}</span>
              <b>{fmtIDR(contract - billed)}</b>
            </div>
            <div className="flex justify-between">
              <span>
                {t("Est. gross margin (contract − RAB)", "Estimasi margin (kontrak − RAB)")}
              </span>
              <b>{fmtIDR(contract - rab)}</b>
            </div>
            <div className="border-t pt-3">
              <p className="mb-2 flex items-center gap-1 font-medium">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                {t("Overdue milestones", "Milestone terlambat")} ({late.length})
              </p>
              {late.slice(0, 5).map((m) => (
                <p key={m.id} className="truncate text-muted-foreground">
                  {String(P.find((p) => p.id === m.project_id)?.code ?? "")} · {String(m.name)} ·{" "}
                  {String(m.due_date)}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      {taskCard}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Project progress", "Progres proyek")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {P.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("No projects yet.", "Belum ada proyek.")}
            </p>
          )}
          {P.slice(0, 10).map((p) => {
            const prog = projectProgress(String(p.id ?? ""), M, p);
            return (
              <div key={p.id}>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate">
                    {String(p.code)} — {String(p.name)}
                  </span>
                  <span>{prog.toFixed(0)}%</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-gold"
                    style={{ width: `${Math.min(100, prog)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------- projects ------------------------------- */

function ProjectsView({ workspaceId }: { workspaceId: string }) {
  const t = useT();
  const { activeWorkspace } = useApp();
  const { data = [], isLoading } = useRows("prj_projects", workspaceId);
  const milestones = useRows("prj_milestones", workspaceId);
  const save = useSave("prj_projects", workspaceId);
  const remove = useRemove("prj_projects", workspaceId);
  const [term, setTerm] = useState("");
  const [edit, setEdit] = useState<XproRow | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const canSeeValue = useCanSeeValue();
  const rows = useSearchFilter(data, term, (r) => [
    String(r.code ?? ""),
    String(r.name ?? ""),
    String(r.customer_name ?? ""),
    String(r.contract_no ?? ""),
  ]);
  const p = usePagination(rows);

  const openNew = () =>
    setEdit({
      code: nextDocNumber("PRJ", data.length + 1),
      name: "",
      status: "planning",
      contract_value: 0,
      retention_pct: 5,
      start_date: todayISO(),
    });

  if (isLoading) return <PageSkeleton />;
  const opened = data.find((x) => x.id === openId);
  if (opened)
    return (
      <XproProjectDetail
        workspaceId={workspaceId}
        project={opened as XproRow & { id: string }}
        onBack={() => setOpenId(null)}
        wsName={activeWorkspace?.name}
      />
    );
  return (
    <div className="space-y-4">
      <Header
        title={t("Projects & Contracts", "Proyek & Kontrak")}
        action={
          <div className="flex flex-wrap gap-2">
            <SearchInput value={term} onChange={setTerm} />
            <Button variant="navy" onClick={openNew}>
              <Plus />
              {t("New project", "Proyek baru")}
            </Button>
          </div>
        }
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{t("Code", "Kode")}</TableHead>
                <TableHead>{t("Name", "Nama")}</TableHead>
                <TableHead>{t("Client", "Klien")}</TableHead>
                <TableHead>{t("Period", "Periode")}</TableHead>
                {canSeeValue && (
                  <TableHead className="text-right">{t("Contract", "Kontrak")}</TableHead>
                )}
                <TableHead>{t("Progress", "Progres")}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    {t("No projects.", "Belum ada proyek.")}
                  </TableCell>
                </TableRow>
              )}
              {p.items.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell>{p.start + i + 1}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium">{String(r.code)}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium text-navy underline-offset-2 hover:underline dark:text-primary-foreground"
                      onClick={() => setOpenId(String(r.id ?? ""))}
                    >
                      {String(r.name)}
                    </button>
                    <p className="text-xs text-muted-foreground">{String(r.contract_no ?? "")}</p>
                  </TableCell>
                  <TableCell>{String(r.customer_name ?? "")}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {String(r.start_date ?? "")} → {String(r.end_date ?? "-")}
                  </TableCell>
                  {canSeeValue && (
                    <TableCell className="text-right">{fmtIDR(num(r.contract_value))}</TableCell>
                  )}
                  <TableCell>
                    {projectProgress(String(r.id ?? ""), milestones.data ?? [], r).toFixed(0)}%
                  </TableCell>
                  <TableCell>{statusBadge(String(r.status))}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => setEdit(r)}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        confirm(
                          t(
                            "Delete project and all its data?",
                            "Hapus proyek beserta seluruh datanya?",
                          ),
                        ) && remove.mutate(String(r.id))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationBar p={p} />
        </CardContent>
      </Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {edit?.id ? t("Edit project", "Ubah proyek") : t("New project", "Proyek baru")}
            </DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="grid gap-3 sm:grid-cols-2">
              <AdminField label={t("Code", "Kode")}>
                <Input
                  value={String(edit.code ?? "")}
                  onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                />
              </AdminField>
              <AdminField label={t("Contract / SPK no.", "No. Kontrak / SPK")}>
                <Input
                  value={String(edit.contract_no ?? "")}
                  onChange={(e) => setEdit({ ...edit, contract_no: e.target.value })}
                />
              </AdminField>
              <div className="sm:col-span-2">
                <AdminField label={t("Project name", "Nama proyek")}>
                  <Input
                    value={String(edit.name ?? "")}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                </AdminField>
              </div>
              <AdminField label={t("Client", "Klien")}>
                <PartyPicker
                  workspaceId={workspaceId}
                  kind="customer"
                  value={String(edit.customer_code ?? "")}
                  onPick={(c) => setEdit({ ...edit, customer_code: c.code, customer_name: c.name })}
                />
              </AdminField>
              <AdminField label={t("Project manager", "Project Manager")}>
                <Input
                  value={String(edit.manager ?? "")}
                  onChange={(e) => setEdit({ ...edit, manager: e.target.value })}
                />
              </AdminField>
              <AdminField label={t("Start", "Mulai")}>
                <Input
                  type="date"
                  value={String(edit.start_date ?? "")}
                  onChange={(e) => setEdit({ ...edit, start_date: e.target.value || null })}
                />
              </AdminField>
              <AdminField label={t("End", "Selesai")}>
                <Input
                  type="date"
                  value={String(edit.end_date ?? "")}
                  onChange={(e) => setEdit({ ...edit, end_date: e.target.value || null })}
                />
              </AdminField>
              {canSeeValue && (
                <AdminField label={t("Contract value", "Nilai kontrak")}>
                  <Input
                    type="number"
                    value={String(edit.contract_value ?? 0)}
                    onChange={(e) => setEdit({ ...edit, contract_value: num(e.target.value) })}
                  />
                </AdminField>
              )}
              <AdminField label={t("Retention %", "Retensi %")}>
                <Input
                  type="number"
                  value={String(edit.retention_pct ?? 0)}
                  onChange={(e) => setEdit({ ...edit, retention_pct: num(e.target.value) })}
                />
              </AdminField>
              <AdminField label="Status">
                <AdminSelect
                  value={String(edit.status ?? "planning")}
                  onChange={(v) => setEdit({ ...edit, status: v })}
                >
                  {PROJECT_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminField label={t("Notes", "Catatan")}>
                <Input
                  value={String(edit.notes ?? "")}
                  onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                />
              </AdminField>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="navy"
              disabled={!edit?.name || !edit?.code || save.isPending}
              onClick={() => edit && save.mutate(edit, { onSuccess: () => setEdit(null) })}
            >
              {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------- milestones ------------------------------ */

function MilestonesView({ workspaceId }: { workspaceId: string }) {
  const t = useT();
  const projects = useRows("prj_projects", workspaceId);
  const { data = [], isLoading } = useRows("prj_milestones", workspaceId, "due_date", "asc");
  // Tugas per tahapan: progres tahapan dihitung otomatis dari tugasnya.
  const tasksQ = useRows("prj_tasks", workspaceId);
  const taskStats = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>();
    for (const x of tasksQ.data ?? []) {
      if (!x.milestone_id) continue;
      const k = String(x.milestone_id);
      const v = m.get(k) ?? { total: 0, done: 0 };
      v.total += 1;
      if (x.completed_at) v.done += 1;
      m.set(k, v);
    }
    return m;
  }, [tasksQ.data]);
  const save = useSave("prj_milestones", workspaceId);
  const remove = useRemove("prj_milestones", workspaceId);
  const [project, setProject] = useState("");
  const [edit, setEdit] = useState<XproRow | null>(null);
  const P = projects.data ?? [];
  const rows = useMemo(
    () => (project ? data.filter((m) => m.project_id === project) : data),
    [data, project],
  );
  const p = usePagination(rows);
  const weight = rows.reduce((s, m) => s + num(m.weight_pct), 0);

  if (isLoading || projects.isLoading) return <PageSkeleton />;
  return (
    <div className="space-y-4">
      <Header
        title={t("Milestones & Tasks", "Tahapan & Tugas")}
        desc={t(
          "Weights should total 100% per project; progress is weighted.",
          "Total bobot per proyek idealnya 100%; progres dihitung tertimbang.",
        )}
        action={
          <div className="flex flex-wrap gap-2">
            <ProjectFilter projects={P} value={project} onChange={setProject} />
            <Button
              variant="navy"
              disabled={!P.length}
              onClick={() =>
                setEdit({
                  project_id: project || P[0]?.id,
                  name: "",
                  weight_pct: 0,
                  progress_pct: 0,
                  status: "not_started",
                })
              }
            >
              <Plus />
              {t("New milestone", "Milestone baru")}
            </Button>
          </div>
        }
      />
      {project && (
        <p
          className={`text-sm ${Math.abs(weight - 100) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}
        >
          {t("Total weight", "Total bobot")}: {weight}% ·{" "}
          {t("Weighted progress", "Progres tertimbang")}:{" "}
          {projectProgress(project, data).toFixed(1)}%
        </p>
      )}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{t("Project", "Proyek")}</TableHead>
                <TableHead>Milestone</TableHead>
                <TableHead>PIC</TableHead>
                <TableHead>{t("Due", "Tenggat")}</TableHead>
                <TableHead className="text-right">{t("Weight", "Bobot")}</TableHead>
                <TableHead>{t("Progress", "Progres")}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    {t("No milestones.", "Belum ada milestone.")}
                  </TableCell>
                </TableRow>
              )}
              {p.items.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell>{p.start + i + 1}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {String(P.find((x) => x.id === r.project_id)?.code ?? "")}
                  </TableCell>
                  <TableCell>{String(r.name)}</TableCell>
                  <TableCell>{String(r.pic ?? "")}</TableCell>
                  <TableCell
                    className={
                      r.status !== "done" && r.due_date && String(r.due_date) < todayISO()
                        ? "text-destructive"
                        : ""
                    }
                  >
                    {String(r.due_date ?? "")}
                  </TableCell>
                  <TableCell className="text-right">{num(r.weight_pct)}%</TableCell>
                  <TableCell className="min-w-28">
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-gold"
                        style={{ width: `${Math.min(100, num(r.progress_pct))}%` }}
                      />
                    </div>
                    <span className="text-xs">
                      {num(r.progress_pct)}%
                      {taskStats.get(String(r.id)) && (
                        <span className="ml-1 text-muted-foreground">
                          · {taskStats.get(String(r.id))!.done}/{taskStats.get(String(r.id))!.total}{" "}
                          {t("tasks", "tugas")}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{statusBadge(String(r.status))}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => setEdit(r)}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => confirm(t("Delete?", "Hapus?")) && remove.mutate(String(r.id))}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationBar p={p} />
        </CardContent>
      </Card>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Milestone</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <AdminField label={t("Project", "Proyek")}>
                  <ProjectFilter
                    all={false}
                    projects={P}
                    value={String(edit.project_id ?? "")}
                    onChange={(v) => setEdit({ ...edit, project_id: v })}
                  />
                </AdminField>
              </div>
              <div className="sm:col-span-2">
                <AdminField label={t("Name", "Nama")}>
                  <Input
                    value={String(edit.name ?? "")}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                </AdminField>
              </div>
              <AdminField label={t("Weight %", "Bobot %")}>
                <Input
                  type="number"
                  value={String(edit.weight_pct ?? 0)}
                  onChange={(e) => setEdit({ ...edit, weight_pct: num(e.target.value) })}
                />
              </AdminField>
              <AdminField
                label={
                  Number(edit.progress_auto) === 1
                    ? t("Progress % (from tasks)", "Progres % (otomatis dari tugas)")
                    : t("Progress %", "Progres %")
                }
              >
                <Input
                  type="number"
                  min={0}
                  max={100}
                  disabled={Number(edit.progress_auto) === 1}
                  title={
                    Number(edit.progress_auto) === 1
                      ? t(
                          "Calculated from this milestone's tasks (estimated hours weighted).",
                          "Dihitung dari tugas tahapan ini (tertimbang estimasi jam).",
                        )
                      : undefined
                  }
                  value={String(edit.progress_pct ?? 0)}
                  onChange={(e) => {
                    const v = Math.min(100, num(e.target.value));
                    setEdit({
                      ...edit,
                      progress_pct: v,
                      status: v >= 100 ? "done" : v > 0 ? "in_progress" : edit.status,
                    });
                  }}
                />
              </AdminField>
              <AdminField label={t("Start", "Mulai")}>
                <Input
                  type="date"
                  value={String(edit.start_date ?? "")}
                  onChange={(e) => setEdit({ ...edit, start_date: e.target.value || null })}
                />
              </AdminField>
              <AdminField label={t("Due", "Tenggat")}>
                <Input
                  type="date"
                  value={String(edit.due_date ?? "")}
                  onChange={(e) => setEdit({ ...edit, due_date: e.target.value || null })}
                />
              </AdminField>
              <AdminField label="PIC">
                <Input
                  value={String(edit.pic ?? "")}
                  onChange={(e) => setEdit({ ...edit, pic: e.target.value })}
                />
              </AdminField>
              <AdminField label="Status">
                <AdminSelect
                  value={String(edit.status ?? "not_started")}
                  onChange={(v) => setEdit({ ...edit, status: v })}
                >
                  {MS_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="navy"
              disabled={!edit?.name || !edit?.project_id || save.isPending}
              onClick={() => edit && save.mutate(edit, { onSuccess: () => setEdit(null) })}
            >
              {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------------------------- RAB ---------------------------------- */

function BudgetView({ workspaceId }: { workspaceId: string }) {
  const t = useT();
  const { lang } = useI18n();
  const projects = useRows("prj_projects", workspaceId);
  const { data = [], isLoading } = useRows("prj_budget_lines", workspaceId);
  const save = useSave("prj_budget_lines", workspaceId);
  const remove = useRemove("prj_budget_lines", workspaceId);
  const [project, setProject] = useState("");
  const [edit, setEdit] = useState<XproRow | null>(null);
  const P = projects.data ?? [];
  const rows = useMemo(
    () => (project ? data.filter((b) => b.project_id === project) : data),
    [data, project],
  );
  const p = usePagination(rows);
  const total = rows.reduce((s, b) => s + num(b.amount), 0);
  const contract = project
    ? num(P.find((x) => x.id === project)?.contract_value)
    : P.reduce((s, x) => s + num(x.contract_value), 0);
  const catName = (id: string) => {
    const c = BUDGET_CATS.find((x) => x.id === id);
    return c ? (lang === "id" ? c.id_ : c.en) : id;
  };

  if (isLoading || projects.isLoading) return <PageSkeleton />;
  return (
    <div className="space-y-4">
      <Header
        title={t("Project Budget (RAB)", "Rencana Anggaran Biaya (RAB)")}
        action={
          <div className="flex flex-wrap gap-2">
            <ProjectFilter projects={P} value={project} onChange={setProject} />
            <Button
              variant="navy"
              disabled={!P.length}
              onClick={() =>
                setEdit({
                  project_id: project || P[0]?.id,
                  category: "material",
                  description: "",
                  qty: 1,
                  unit_cost: 0,
                })
              }
            >
              <Plus />
              {t("Add line", "Tambah baris")}
            </Button>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {BUDGET_CATS.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{lang === "id" ? c.id_ : c.en}</p>
              <p className="font-semibold">
                {fmtIDR(
                  rows.filter((b) => b.category === c.id).reduce((s, b) => s + num(b.amount), 0),
                )}
              </p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total RAB</p>
            <p className="font-semibold">{fmtIDR(total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{t("Contract − RAB", "Kontrak − RAB")}</p>
            <p className={`font-semibold ${contract - total < 0 ? "text-destructive" : ""}`}>
              {fmtIDR(contract - total)}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{t("Project", "Proyek")}</TableHead>
                <TableHead>{t("Category", "Kategori")}</TableHead>
                <TableHead>{t("Description", "Uraian")}</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">{t("Unit cost", "Harga satuan")}</TableHead>
                <TableHead className="text-right">{t("Amount", "Jumlah")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    {t("No budget lines.", "Belum ada RAB.")}
                  </TableCell>
                </TableRow>
              )}
              {p.items.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell>{p.start + i + 1}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {String(P.find((x) => x.id === r.project_id)?.code ?? "")}
                  </TableCell>
                  <TableCell>{catName(String(r.category))}</TableCell>
                  <TableCell>{String(r.description)}</TableCell>
                  <TableCell className="text-right">
                    {num(r.qty)} {String(r.uom ?? "")}
                  </TableCell>
                  <TableCell className="text-right">{fmtIDR(num(r.unit_cost))}</TableCell>
                  <TableCell className="text-right font-medium">{fmtIDR(num(r.amount))}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => setEdit(r)}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => confirm(t("Delete?", "Hapus?")) && remove.mutate(String(r.id))}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationBar p={p} />
        </CardContent>
      </Card>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>RAB</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <AdminField label={t("Project", "Proyek")}>
                  <ProjectFilter
                    all={false}
                    projects={P}
                    value={String(edit.project_id ?? "")}
                    onChange={(v) => setEdit({ ...edit, project_id: v })}
                  />
                </AdminField>
              </div>
              <AdminField label={t("Category", "Kategori")}>
                <AdminSelect
                  value={String(edit.category ?? "material")}
                  onChange={(v) => setEdit({ ...edit, category: v })}
                >
                  {BUDGET_CATS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {lang === "id" ? c.id_ : c.en}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminField label={t("Unit", "Satuan")}>
                <Input
                  value={String(edit.uom ?? "")}
                  onChange={(e) => setEdit({ ...edit, uom: e.target.value })}
                />
              </AdminField>
              <div className="sm:col-span-2">
                <AdminField label={t("Description", "Uraian")}>
                  <Input
                    value={String(edit.description ?? "")}
                    onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                  />
                </AdminField>
              </div>
              <AdminField label="Qty">
                <Input
                  type="number"
                  value={String(edit.qty ?? 1)}
                  onChange={(e) => setEdit({ ...edit, qty: num(e.target.value) })}
                />
              </AdminField>
              <AdminField label={t("Unit cost", "Harga satuan")}>
                <Input
                  type="number"
                  value={String(edit.unit_cost ?? 0)}
                  onChange={(e) => setEdit({ ...edit, unit_cost: num(e.target.value) })}
                />
              </AdminField>
              <p className="text-sm sm:col-span-2">
                {t("Amount", "Jumlah")}: <b>{fmtIDR(num(edit.qty) * num(edit.unit_cost))}</b>
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="navy"
              disabled={!edit?.description || !edit?.project_id || save.isPending}
              onClick={() =>
                edit &&
                save.mutate(
                  { ...edit, amount: num(edit.qty) * num(edit.unit_cost) },
                  { onSuccess: () => setEdit(null) },
                )
              }
            >
              {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------- progress billing / BAST ------------------------ */

function BillingView({ workspaceId }: { workspaceId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const projects = useRows("prj_projects", workspaceId);
  const milestones = useRows("prj_milestones", workspaceId);
  const reports = useRows("prj_progress_reports", workspaceId);
  const { data = [], isLoading } = useRows("prj_billings", workspaceId);
  const save = useSave("prj_billings", workspaceId);
  const remove = useRemove("prj_billings", workspaceId);
  const [project, setProject] = useState("");
  const [edit, setEdit] = useState<XproRow | null>(null);
  const P = projects.data ?? [];
  const M = milestones.data ?? [];
  const rows = useMemo(
    () => (project ? data.filter((b) => b.project_id === project) : data),
    [data, project],
  );
  const p = usePagination(rows);

  const recalc = (row: XproRow) => {
    const pr = P.find((x) => x.id === row.project_id);
    const amount = Math.round((num(pr?.contract_value) * num(row.progress_pct)) / 100);
    return {
      ...row,
      amount,
      retention_amount: Math.round((amount * num(pr?.retention_pct)) / 100),
    };
  };

  /**
   * BAST yang disetujui → **draft AR Invoice** (neto retensi), persis BS New 10:
   * hanya membuat dokumen + barisnya, TANPA jurnal. Posting jurnal terjadi saat
   * invoice di-submit di modul Sales (perilaku referensi, diport apa adanya).
   */
  const issueAr = useMutation({
    mutationFn: async (b: XproRow) => {
      const pr = P.find((x) => x.id === b.project_id);
      if (!pr?.customer_code)
        throw new Error(t("Set the project client first.", "Isi klien proyek terlebih dulu."));
      const count = await countWorkspaceRows({
        data: { table: "sls_documents", workspaceId, filters: { doc_type: "ar_invoice" } },
      });
      const net = num(b.amount) - num(b.retention_amount);
      const docNumber = nextDocNumber("ARI", Number(count?.count ?? 0) + 1);
      const doc = await saveWorkspaceRow({
        data: {
          table: "sls_documents",
          workspaceId,
          data: {
            doc_type: "ar_invoice",
            doc_number: docNumber,
            doc_date: todayISO(),
            status: "draft",
            customer_code: pr.customer_code,
            customer_name: pr.customer_name,
            reference: b.bast_no,
            subtotal: net,
            total: net,
            notes: `${String(pr.code)} — ${String(pr.name)} · BAST ${String(b.bast_no)} (${num(b.progress_pct)}%)${
              num(b.retention_amount) ? ` · Retensi ${fmtIDR(num(b.retention_amount))}` : ""
            }`,
            exchange_rate: 1,
          },
        },
      });
      await saveWorkspaceRow({
        data: {
          table: "sls_document_lines",
          workspaceId,
          data: {
            document_id: doc.id,
            line_no: 1,
            qty: 1,
            unit_price: net,
            line_total: net,
            description: `Termin ${num(b.progress_pct)}% — ${String(pr.name)}${b.description ? ` (${String(b.description)})` : ""}`,
          },
        },
      });
      await saveWorkspaceRow({
        data: {
          table: "prj_billings",
          workspaceId,
          id: b.id,
          data: { status: "invoiced", ar_document_id: doc.id, ar_doc_number: docNumber },
        },
      });
      return docNumber;
    },
    onSuccess: (n) => {
      void qc.invalidateQueries({ queryKey: ["xpro"] });
      toast.success(
        t(
          `AR draft ${n} created — review & submit it in Sales → AR Invoices.`,
          `Draft faktur ${n} dibuat — periksa & submit di Penjualan → Faktur Piutang.`,
        ),
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || projects.isLoading) return <PageSkeleton />;
  return (
    <div className="space-y-4">
      <Header
        title={t("Progress Billing & BAST", "Tagihan Termin & BAST")}
        desc={t(
          "Approved BAST is issued as a draft AR invoice (net of retention).",
          "BAST yang disetujui diterbitkan menjadi draft Faktur Piutang (setelah dipotong retensi).",
        )}
        action={
          <div className="flex flex-wrap gap-2">
            <ProjectFilter projects={P} value={project} onChange={setProject} />
            <Button
              variant="navy"
              disabled={!P.length}
              onClick={() =>
                setEdit(
                  recalc({
                    project_id: project || P[0]?.id,
                    bast_no: nextDocNumber("BAST", data.length + 1),
                    bast_date: todayISO(),
                    progress_pct: 0,
                    status: "draft",
                  }),
                )
              }
            >
              <Plus />
              {t("New BAST", "BAST baru")}
            </Button>
          </div>
        }
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>BAST</TableHead>
                <TableHead>{t("Project", "Proyek")}</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">{t("Amount", "Nilai")}</TableHead>
                <TableHead className="text-right">{t("Retention", "Retensi")}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>AR</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    {t("No BAST yet.", "Belum ada BAST.")}
                  </TableCell>
                </TableRow>
              )}
              {p.items.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell>{p.start + i + 1}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {String(r.bast_no)}
                    <p className="text-xs text-muted-foreground">{String(r.bast_date)}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {String(P.find((x) => x.id === r.project_id)?.code ?? "")}
                  </TableCell>
                  <TableCell className="text-right">{num(r.progress_pct)}%</TableCell>
                  <TableCell className="text-right">{fmtIDR(num(r.amount))}</TableCell>
                  <TableCell className="text-right">{fmtIDR(num(r.retention_amount))}</TableCell>
                  <TableCell>{statusBadge(String(r.status))}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {String(r.ar_doc_number ?? "-")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.status === "draft" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          r.progress_report_id
                            ? save.mutate({
                                id: r.id,
                                project_id: r.project_id,
                                status: "approved",
                              })
                            : toast.error(
                                t(
                                  "Attach an approved progress report first.",
                                  "Lampirkan laporan progres yang sudah disetujui terlebih dahulu.",
                                ),
                              )
                        }
                      >
                        {t("Approve", "Setujui")}
                      </Button>
                    )}
                    {r.status === "approved" && (
                      <Button
                        size="sm"
                        variant="navy"
                        disabled={issueAr.isPending}
                        onClick={() => issueAr.mutate(r)}
                      >
                        {t("Issue AR", "Terbitkan AR")}
                      </Button>
                    )}
                    {r.status !== "invoiced" && (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => setEdit(r)}>
                          <Pencil />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            confirm(t("Delete?", "Hapus?")) && remove.mutate(String(r.id))
                          }
                        >
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationBar p={p} />
        </CardContent>
      </Card>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>BAST</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <AdminField label={t("Project", "Proyek")}>
                  <ProjectFilter
                    all={false}
                    projects={P}
                    value={String(edit.project_id ?? "")}
                    onChange={(v) =>
                      setEdit(recalc({ ...edit, project_id: v, milestone_id: null }))
                    }
                  />
                </AdminField>
              </div>
              <AdminField label={t("BAST no.", "No. BAST")}>
                <Input
                  value={String(edit.bast_no ?? "")}
                  onChange={(e) => setEdit({ ...edit, bast_no: e.target.value })}
                />
              </AdminField>
              <AdminField label={t("Date", "Tanggal")}>
                <Input
                  type="date"
                  value={String(edit.bast_date ?? "")}
                  onChange={(e) => setEdit({ ...edit, bast_date: e.target.value })}
                />
              </AdminField>
              <div className="sm:col-span-2">
                <AdminField label="Milestone">
                  <AdminSelect
                    value={String(edit.milestone_id ?? "")}
                    onChange={(v) => {
                      const m = M.find((x) => x.id === v);
                      setEdit(
                        recalc({
                          ...edit,
                          milestone_id: v || null,
                          progress_pct: m ? num(m.weight_pct) : edit.progress_pct,
                        }),
                      );
                    }}
                  >
                    <option value="">-</option>
                    {M.filter((m) => m.project_id === edit.project_id).map((m) => (
                      <option key={m.id} value={m.id}>
                        {String(m.name)} ({num(m.weight_pct)}%)
                      </option>
                    ))}
                  </AdminSelect>
                </AdminField>
              </div>
              <div className="sm:col-span-2">
                <AdminField
                  label={t(
                    "Approved progress report (required)",
                    "Laporan progres disetujui (wajib)",
                  )}
                >
                  <AdminSelect
                    value={String(edit.progress_report_id ?? "")}
                    onChange={(v) => setEdit({ ...edit, progress_report_id: v || null })}
                  >
                    <option value="">-</option>
                    {(reports.data ?? [])
                      .filter((r) => r.project_id === edit.project_id && r.status === "approved")
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {String(r.report_no)} — {num(r.progress_pct)}% ({String(r.report_date)})
                        </option>
                      ))}
                  </AdminSelect>
                </AdminField>
              </div>
              <AdminField label={t("Billing % of contract", "% tagihan dari kontrak")}>
                <Input
                  type="number"
                  value={String(edit.progress_pct ?? 0)}
                  onChange={(e) => setEdit(recalc({ ...edit, progress_pct: num(e.target.value) }))}
                />
              </AdminField>
              <AdminField label={t("Description", "Keterangan")}>
                <Input
                  value={String(edit.description ?? "")}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                />
              </AdminField>
              <AdminField label={t("Amount", "Nilai")}>
                <Input
                  type="number"
                  value={String(edit.amount ?? 0)}
                  onChange={(e) => setEdit({ ...edit, amount: num(e.target.value) })}
                />
              </AdminField>
              <AdminField label={t("Retention", "Retensi")}>
                <Input
                  type="number"
                  value={String(edit.retention_amount ?? 0)}
                  onChange={(e) => setEdit({ ...edit, retention_amount: num(e.target.value) })}
                />
              </AdminField>
              <p className="text-sm sm:col-span-2">
                {t("Net to invoice", "Neto ditagihkan")}:{" "}
                <b>{fmtIDR(num(edit.amount) - num(edit.retention_amount))}</b>
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="navy"
              disabled={!edit?.bast_no || !edit?.project_id || save.isPending}
              onClick={() => edit && save.mutate(edit, { onSuccess: () => setEdit(null) })}
            >
              {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function XproView({
  submoduleId,
  workspaceId,
}: {
  submoduleId: string;
  workspaceId: string;
}) {
  if (submoduleId === "roadmap") return <XproRoadmapView workspaceId={workspaceId} />;
  if (submoduleId === "my-tasks") return <XproMyTasksView workspaceId={workspaceId} />;
  if (submoduleId === "backlog") return <XproBacklogView workspaceId={workspaceId} />;
  if (submoduleId === "kanban") return <XproKanbanView workspaceId={workspaceId} />;
  if (submoduleId === "workload") return <XproWorkloadView workspaceId={workspaceId} />;
  if (submoduleId === "projects") return <ProjectsView workspaceId={workspaceId} />;
  if (submoduleId === "milestones") return <MilestonesView workspaceId={workspaceId} />;
  if (submoduleId === "budget") return <BudgetView workspaceId={workspaceId} />;
  if (submoduleId === "billing") return <BillingView workspaceId={workspaceId} />;
  return <XproDashboard workspaceId={workspaceId} />;
}
