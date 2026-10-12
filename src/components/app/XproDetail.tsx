import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, Image as ImageIcon, Pencil, Plus, Printer, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { AdminField, AdminSelect, fmtIDR, todayISO } from "@/components/app/admin-ui";
import { openWsFile, uploadWsFile } from "@/components/app/CrmDocLibrary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp } from "@/lib/app-context";
import { deleteWorkspaceRow, listWorkspaceRows, saveWorkspaceRow } from "@/lib/data.functions";
import { uploadWorkspaceFile } from "@/lib/files.functions";
import { useI18n } from "@/lib/i18n";
import { nextDocNumber } from "@/lib/procurement";
import { useServerFn } from "@tanstack/react-start";
import type { XproRow } from "@/components/app/XproViews";

/**
 * Ronde 33 — **detail proyek XPro** (diporting apa adanya dari BS New 10
 * `src/components/app/XproDetail.tsx`): tab Tugas, Gantt, Tim, Biaya, Dokumen,
 * Laporan progres (dengan cetak LPP), dan Tagihan & pembayaran.
 *
 * Penyesuaian hanya di lapisan data: server fn MySQL Old + penyimpanan berkas
 * workspace (`uploadWorkspaceFile` → `/api/workspace-files`), bukan Supabase.
 */
const num = (v: unknown) => Number(v ?? 0) || 0;
const TASK_STATUS = ["todo", "in_progress", "review", "done"];
const EXP_CATS = ["material", "labor", "subcon", "overhead"];
type Photo = { path: string; caption: string };

function useT() {
  const { lang } = useI18n();
  return (en: string, id: string) => (lang === "id" ? id : en);
}

function useProjRows(
  table: string,
  workspaceId: string,
  projectId: string,
  order = "created_at",
  dir: "asc" | "desc" = "asc",
) {
  return useQuery({
    queryKey: ["xpro", table, "p", workspaceId, projectId, order, dir],
    queryFn: async () => {
      const res = await listWorkspaceRows({
        data: { table, workspaceId, filters: { project_id: projectId }, orderBy: order, orderDir: dir, limit: 500 },
      });
      return ((res as unknown as { rows?: XproRow[] })?.rows ?? []) as XproRow[];
    },
  });
}

function useCrud(table: string, workspaceId: string, projectId: string) {
  const qc = useQueryClient();
  const t = useT();
  const save = useMutation({
    mutationFn: async (row: XproRow) => {
      const { id, ...rest } = row;
      await saveWorkspaceRow({
        data: { table, workspaceId, id: id as string | undefined, data: { ...rest, project_id: projectId } },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["xpro"] });
      toast.success(t("Saved", "Tersimpan"));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table, workspaceId, id } });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["xpro"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  return { save, remove };
}

/** Foto laporan progres disimpan sebagai JSON di kolom `photos`. */
function photosOf(r: XproRow): Photo[] {
  const raw = r.photos;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as Photo[];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? (parsed as Photo[]) : [];
  } catch {
    return [];
  }
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <TableCell className="whitespace-nowrap text-right">
      <Button size="icon" variant="ghost" onClick={onEdit}>
        <Pencil />
      </Button>
      <Button size="icon" variant="ghost" onClick={() => confirm("Hapus / Delete?") && onDelete()}>
        <Trash2 />
      </Button>
    </TableCell>
  );
}

function Empty({ cols, text }: { cols: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}

function FormDialog({
  open,
  title,
  onClose,
  onSave,
  disabled,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">{children}</div>
        <DialogFooter>
          <Button variant="navy" disabled={disabled} onClick={onSave}>
            {t("Save", "Simpan")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- members -------------------------------- */

function MembersTab({ workspaceId, project }: { workspaceId: string; project: XproRow & { id: string } }) {
  const t = useT();
  const { data = [] } = useProjRows("prj_members", workspaceId, project.id);
  const { save, remove } = useCrud("prj_members", workspaceId, project.id);
  const [edit, setEdit] = useState<XproRow | null>(null);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{t("Project team", "Tim proyek")}</CardTitle>
        <Button size="sm" variant="navy" onClick={() => setEdit({ name: "" })}>
          <Plus />
          {t("Add member", "Tambah anggota")}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{t("Name", "Nama")}</TableHead>
              <TableHead>{t("Role", "Peran")}</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>{t("Phone", "Telepon")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data.length && <Empty cols={6} text={t("No members yet.", "Belum ada anggota.")} />}
            {data.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell className="font-medium">{String(r.name)}</TableCell>
                <TableCell>{String(r.role ?? "")}</TableCell>
                <TableCell>{String(r.email ?? "")}</TableCell>
                <TableCell>{String(r.phone ?? "")}</TableCell>
                <RowActions onEdit={() => setEdit(r)} onDelete={() => remove.mutate(String(r.id))} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <FormDialog
        open={!!edit}
        title={t("Member", "Anggota")}
        onClose={() => setEdit(null)}
        disabled={!edit?.name || save.isPending}
        onSave={() => edit && save.mutate(edit, { onSuccess: () => setEdit(null) })}
      >
        {edit && (
          <>
            <AdminField label={t("Name", "Nama")}>
              <Input value={String(edit.name ?? "")} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </AdminField>
            <AdminField label={t("Role (PM, Site Engineer, Supervisor…)", "Peran (PM, Site Engineer, Pengawas…)")}>
              <Input value={String(edit.role ?? "")} onChange={(e) => setEdit({ ...edit, role: e.target.value })} />
            </AdminField>
            <AdminField label="Email">
              <Input value={String(edit.email ?? "")} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </AdminField>
            <AdminField label={t("Phone", "Telepon")}>
              <Input value={String(edit.phone ?? "")} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </AdminField>
          </>
        )}
      </FormDialog>
    </Card>
  );
}

/* ---------------------------------- tasks --------------------------------- */

function TasksTab({
  workspaceId,
  project,
  milestones,
  members,
}: {
  workspaceId: string;
  project: XproRow & { id: string };
  milestones: XproRow[];
  members: XproRow[];
}) {
  const t = useT();
  const { data = [] } = useProjRows("prj_tasks", workspaceId, project.id, "start_date");
  const { save, remove } = useCrud("prj_tasks", workspaceId, project.id);
  const [edit, setEdit] = useState<XproRow | null>(null);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{t("Tasks", "Tugas")}</CardTitle>
        <Button
          size="sm"
          variant="navy"
          onClick={() => setEdit({ name: "", status: "todo", progress_pct: 0, start_date: todayISO(), due_date: todayISO() })}
        >
          <Plus />
          {t("Add task", "Tambah tugas")}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{t("Task", "Tugas")}</TableHead>
              <TableHead>Milestone</TableHead>
              <TableHead>PIC</TableHead>
              <TableHead>{t("Schedule", "Jadwal")}</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data.length && <Empty cols={8} text={t("No tasks yet.", "Belum ada tugas.")} />}
            {data.map((r, i) => {
              const late = r.status !== "done" && r.due_date && String(r.due_date) < todayISO();
              return (
                <TableRow key={r.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{String(r.name)}</TableCell>
                  <TableCell className="text-xs">{String(milestones.find((m) => m.id === r.milestone_id)?.name ?? "-")}</TableCell>
                  <TableCell>{String(r.assignee ?? "")}</TableCell>
                  <TableCell className={`whitespace-nowrap text-xs ${late ? "text-destructive" : ""}`}>
                    {String(r.start_date ?? "")} → {String(r.due_date ?? "")}
                  </TableCell>
                  <TableCell className="text-right">{num(r.progress_pct)}%</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "done" ? "default" : "secondary"} className="capitalize">
                      {String(r.status).replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <RowActions onEdit={() => setEdit(r)} onDelete={() => remove.mutate(String(r.id))} />
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      <FormDialog
        open={!!edit}
        title={t("Task", "Tugas")}
        onClose={() => setEdit(null)}
        disabled={!edit?.name || save.isPending}
        onSave={() =>
          edit &&
          save.mutate({ ...edit, progress_pct: edit.status === "done" ? 100 : edit.progress_pct }, { onSuccess: () => setEdit(null) })
        }
      >
        {edit && (
          <>
            <div className="sm:col-span-2">
              <AdminField label={t("Task", "Tugas")}>
                <Input value={String(edit.name ?? "")} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </AdminField>
            </div>
            <AdminField label="Milestone">
              <AdminSelect
                value={String(edit.milestone_id ?? "")}
                onChange={(v) => setEdit({ ...edit, milestone_id: v || null })}
              >
                <option value="">-</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {String(m.name)}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="PIC">
              <AdminSelect value={String(edit.assignee ?? "")} onChange={(v) => setEdit({ ...edit, assignee: v })}>
                <option value="">-</option>
                {members.map((m) => (
                  <option key={m.id} value={String(m.name)}>
                    {String(m.name)}
                  </option>
                ))}
              </AdminSelect>
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
            <AdminField label={t("Progress %", "Progres %")}>
              <Input
                type="number"
                min={0}
                max={100}
                value={String(edit.progress_pct ?? 0)}
                onChange={(e) => setEdit({ ...edit, progress_pct: Math.min(100, num(e.target.value)) })}
              />
            </AdminField>
            <AdminField label="Status">
              <AdminSelect value={String(edit.status ?? "todo")} onChange={(v) => setEdit({ ...edit, status: v })}>
                {TASK_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
          </>
        )}
      </FormDialog>
    </Card>
  );
}

/* ---------------------------------- gantt --------------------------------- */

const DAY = 86400000;
const isoDaysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

function GanttTab({ milestones, tasks }: { project: XproRow & { id: string }; milestones: XproRow[]; tasks: XproRow[] }) {
  const t = useT();
  const [scale, setScale] = useState<"day" | "week" | "month">("day");
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(todayISO());
  const all = useMemo(() => {
    const out: { key: string; label: string; start: string; end: string; pct: number; kind: "ms" | "task" }[] = [];
    milestones.forEach((m) => {
      if (m.start_date || m.due_date)
        out.push({
          key: String(m.id),
          label: String(m.name),
          start: String(m.start_date ?? m.due_date),
          end: String(m.due_date ?? m.start_date),
          pct: num(m.progress_pct),
          kind: "ms",
        });
      tasks
        .filter((x) => x.milestone_id === m.id && (x.start_date || x.due_date))
        .forEach((x) =>
          out.push({
            key: String(x.id),
            label: String(x.name),
            start: String(x.start_date ?? x.due_date),
            end: String(x.due_date ?? x.start_date),
            pct: num(x.progress_pct),
            kind: "task",
          }),
        );
    });
    tasks
      .filter((x) => !x.milestone_id && (x.start_date || x.due_date))
      .forEach((x) =>
        out.push({
          key: String(x.id),
          label: String(x.name),
          start: String(x.start_date ?? x.due_date),
          end: String(x.due_date ?? x.start_date),
          pct: num(x.progress_pct),
          kind: "task",
        }),
      );
    return out;
  }, [milestones, tasks]);
  const lo = from && to && from > to ? to : from;
  const hi = from && to && from > to ? from : to;
  const items = all.filter((i) => (!hi || i.start <= hi) && (!lo || i.end >= lo));
  const min = new Date(lo || todayISO()).getTime();
  const max = new Date(hi || todayISO()).getTime() + DAY;
  const span = max - min || DAY;
  const days = Math.round(span / DAY);
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const pos = (d: string) => clamp(((new Date(d).getTime() - min) / span) * 100);
  const today = Date.now();
  const ticks: { label: string; left: number }[] = [];
  const c = new Date(min);
  if (scale === "week") {
    const wd = (c.getDay() + 6) % 7;
    if (wd) c.setDate(c.getDate() + 7 - wd);
  }
  if (scale === "month" && c.getDate() !== 1) {
    c.setDate(1);
    c.setMonth(c.getMonth() + 1);
  }
  while (c.getTime() < max) {
    const label =
      scale === "day"
        ? c.toLocaleDateString(undefined, { day: "numeric", month: c.getDate() === 1 || ticks.length === 0 ? "short" : undefined })
        : scale === "week"
          ? c.toLocaleDateString(undefined, { day: "numeric", month: "short" })
          : c.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    ticks.push({ label, left: ((c.getTime() - min) / span) * 100 });
    if (scale === "day") c.setDate(c.getDate() + 1);
    else if (scale === "week") c.setDate(c.getDate() + 7);
    else c.setMonth(c.getMonth() + 1);
  }
  const pxPerDay = scale === "day" ? 32 : scale === "week" ? 8 : 3;
  const minW = Math.max(720, 192 + days * pxPerDay);
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-end justify-between gap-3">
        <CardTitle className="text-base">Gantt Chart</CardTitle>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            {(["day", "week", "month"] as const).map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={scale === s ? "navy" : "ghost"}
                className="h-7"
                onClick={() => setScale(s)}
              >
                {s === "day" ? t("Day", "Hari") : s === "week" ? t("Week", "Minggu") : t("Month", "Bulan")}
              </Button>
            ))}
          </div>
          <Input type="date" className="h-8 w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="pb-1 text-xs text-muted-foreground">→</span>
          <Input type="date" className="h-8 w-36" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => {
              setFrom(isoDaysAgo(30));
              setTo(todayISO());
            }}
          >
            {t("Last 30 days", "30 hari terakhir")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {!items.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("No milestones or tasks in this period.", "Tidak ada milestone atau tugas pada periode ini.")}
          </p>
        ) : (
          <div style={{ minWidth: minW }}>
            <div className="relative ml-48 h-6 border-b border-border text-[10px] text-muted-foreground">
              {ticks.map((m, idx) => (
                <span key={idx} className="absolute whitespace-nowrap border-l border-border pl-0.5" style={{ left: `${m.left}%` }}>
                  {m.label}
                </span>
              ))}
            </div>
            {items.map((i) => (
              <div key={i.key} className="flex items-center border-b border-border/50 py-1.5">
                <div className={`w-48 shrink-0 truncate pr-2 text-xs ${i.kind === "ms" ? "font-semibold" : "pl-3 text-muted-foreground"}`}>
                  {i.label}
                </div>
                <div className="relative h-5 flex-1">
                  {today > min && today < max && (
                    <div className="absolute inset-y-0 w-px bg-destructive/60" style={{ left: `${((today - min) / span) * 100}%` }} />
                  )}
                  <div
                    className={`absolute inset-y-0.5 overflow-hidden rounded ${i.kind === "ms" ? "bg-navy/25" : "bg-gold/25"}`}
                    style={{
                      left: `${pos(i.start)}%`,
                      width: `${Math.max(0.5, clamp(pos(i.end) + (DAY / span) * 100) - pos(i.start))}%`,
                    }}
                  >
                    <div className={`h-full ${i.kind === "ms" ? "bg-navy" : "bg-gold"}`} style={{ width: `${i.pct}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------- expenses -------------------------------- */

function ExpensesTab({ workspaceId, project, budget }: { workspaceId: string; project: XproRow & { id: string }; budget: XproRow[] }) {
  const t = useT();
  const { data = [] } = useProjRows("prj_expenses", workspaceId, project.id, "expense_date");
  const { save, remove } = useCrud("prj_expenses", workspaceId, project.id);
  const [edit, setEdit] = useState<XproRow | null>(null);
  const byCat = EXP_CATS.map((c) => ({
    c,
    rab: budget.filter((b) => b.category === c).reduce((s, b) => s + num(b.amount), 0),
    act: data.filter((e) => e.category === c).reduce((s, e) => s + num(e.amount), 0),
  }));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {byCat.map((x) => (
          <Card key={x.c}>
            <CardContent className="p-4">
              <p className="text-xs capitalize text-muted-foreground">{x.c}</p>
              <p className="font-semibold">{fmtIDR(x.act)}</p>
              <p className={`text-xs ${x.act > x.rab ? "text-destructive" : "text-muted-foreground"}`}>RAB {fmtIDR(x.rab)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">{t("Actual expenses", "Realisasi biaya")}</CardTitle>
          <Button size="sm" variant="navy" onClick={() => setEdit({ expense_date: todayISO(), category: "material", amount: 0 })}>
            <Plus />
            {t("Add expense", "Tambah biaya")}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{t("Date", "Tanggal")}</TableHead>
                <TableHead>{t("Category", "Kategori")}</TableHead>
                <TableHead>{t("Description", "Keterangan")}</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">{t("Amount", "Nilai")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data.length && <Empty cols={7} text={t("No expenses yet.", "Belum ada biaya.")} />}
              {data.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="whitespace-nowrap">{String(r.expense_date)}</TableCell>
                  <TableCell className="capitalize">{String(r.category)}</TableCell>
                  <TableCell>
                    {String(r.description ?? "")}
                    <p className="text-xs text-muted-foreground">{String(r.reference ?? "")}</p>
                  </TableCell>
                  <TableCell>{String(r.vendor ?? "")}</TableCell>
                  <TableCell className="text-right">{fmtIDR(num(r.amount))}</TableCell>
                  <RowActions onEdit={() => setEdit(r)} onDelete={() => remove.mutate(String(r.id))} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <FormDialog
        open={!!edit}
        title={t("Expense", "Biaya")}
        onClose={() => setEdit(null)}
        disabled={!edit?.amount || save.isPending}
        onSave={() => edit && save.mutate(edit, { onSuccess: () => setEdit(null) })}
      >
        {edit && (
          <>
            <AdminField label={t("Date", "Tanggal")}>
              <Input
                type="date"
                value={String(edit.expense_date ?? "")}
                onChange={(e) => setEdit({ ...edit, expense_date: e.target.value })}
              />
            </AdminField>
            <AdminField label={t("Category", "Kategori")}>
              <AdminSelect value={String(edit.category ?? "material")} onChange={(v) => setEdit({ ...edit, category: v })}>
                {EXP_CATS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <div className="sm:col-span-2">
              <AdminField label={t("Description", "Keterangan")}>
                <Input
                  value={String(edit.description ?? "")}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                />
              </AdminField>
            </div>
            <AdminField label="Vendor">
              <Input value={String(edit.vendor ?? "")} onChange={(e) => setEdit({ ...edit, vendor: e.target.value })} />
            </AdminField>
            <AdminField label={t("Reference / receipt no.", "Referensi / no. nota")}>
              <Input value={String(edit.reference ?? "")} onChange={(e) => setEdit({ ...edit, reference: e.target.value })} />
            </AdminField>
            <AdminField label={t("Amount", "Nilai")}>
              <Input
                type="number"
                value={String(edit.amount ?? 0)}
                onChange={(e) => setEdit({ ...edit, amount: num(e.target.value) })}
              />
            </AdminField>
          </>
        )}
      </FormDialog>
    </div>
  );
}

/* -------------------------------- documents ------------------------------- */

function DocumentsTab({ workspaceId, project }: { workspaceId: string; project: XproRow & { id: string } }) {
  const t = useT();
  const qc = useQueryClient();
  const uploadFn = useServerFn(uploadWorkspaceFile);
  const { data = [] } = useProjRows("prj_documents", workspaceId, project.id);
  const [category, setCategory] = useState("contract");
  const [busy, setBusy] = useState(false);
  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const path = await uploadWsFile(workspaceId, `xpro/${project.id}`, f, uploadFn);
        await saveWorkspaceRow({
          data: {
            table: "prj_documents",
            workspaceId,
            data: { project_id: project.id, name: f.name, category, file_path: path, file_size: f.size, mime_type: f.type },
          },
        });
      }
      void qc.invalidateQueries({ queryKey: ["xpro"] });
      toast.success(t("Uploaded", "Terunggah"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const del = async (r: XproRow) => {
    if (!confirm(t("Delete document?", "Hapus dokumen?"))) return;
    await deleteWorkspaceRow({ data: { table: "prj_documents", workspaceId, id: r.id } });
    void qc.invalidateQueries({ queryKey: ["xpro"] });
  };
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">{t("Project documents", "Dokumen proyek")}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <AdminSelect value={category} onChange={setCategory} className="w-40">
            {["contract", "drawing", "permit", "bast", "report", "other"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </AdminSelect>
          <Button size="sm" variant="navy" asChild disabled={busy}>
            <label className="cursor-pointer">
              <Upload />
              {busy ? "…" : t("Upload", "Unggah")}
              <input type="file" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
            </label>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{t("File", "Berkas")}</TableHead>
              <TableHead>{t("Category", "Kategori")}</TableHead>
              <TableHead>{t("Size", "Ukuran")}</TableHead>
              <TableHead>{t("Uploaded", "Diunggah")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data.length && (
              <Empty cols={6} text={t("No documents yet (contract, drawings, permits…).", "Belum ada dokumen (kontrak, gambar kerja, izin…).")} />
            )}
            {data.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell className="font-medium">
                  <FileText className="mr-1 inline h-4 w-4 text-gold" />
                  {String(r.name)}
                </TableCell>
                <TableCell className="capitalize">{String(r.category ?? "")}</TableCell>
                <TableCell>{(num(r.file_size) / 1024).toFixed(0)} KB</TableCell>
                <TableCell className="text-xs">{String(r.created_at ?? "").slice(0, 10)}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button size="icon" variant="ghost" onClick={() => openWsFile(String(r.file_path))}>
                    <Download />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => del(r)}>
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- progress reports --------------------------- */

function printReport(project: XproRow, r: XproRow, ws: { name?: string }) {
  const photos = photosOf(r);
  const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const html = `<!doctype html><html><head><title>${esc(String(r.report_no))}</title><style>
  body{font-family:Arial,sans-serif;color:#111;margin:32px;font-size:12px}h1{font-size:18px;margin:0}h2{font-size:13px;margin:18px 0 6px;border-bottom:1px solid #999}
  table{width:100%;border-collapse:collapse}td{padding:4px 6px;vertical-align:top}.sig{display:flex;justify-content:space-between;margin-top:48px;text-align:center}.sig div{width:40%}.bar{height:10px;background:#eee}.bar i{display:block;height:100%;background:#1e3a5f}</style></head><body>
  <p style="margin:0;color:#666">${esc(ws.name ?? "")}</p><h1>LAPORAN PROGRES PEKERJAAN</h1><p style="margin:2px 0 12px">No. ${esc(String(r.report_no))} · ${esc(String(r.report_date))}${r.period_label ? " · " + esc(String(r.period_label)) : ""}</p>
  <table><tr><td width="160">Proyek</td><td>: ${esc(String(project.code))} — ${esc(String(project.name))}</td></tr><tr><td>No. Kontrak / SPK</td><td>: ${esc(String(project.contract_no ?? "-"))}</td></tr><tr><td>Pemberi Kerja</td><td>: ${esc(String(project.customer_name ?? "-"))}</td></tr><tr><td>Progres Fisik Kumulatif</td><td>: <b>${num(r.progress_pct)}%</b><div class="bar"><i style="width:${num(r.progress_pct)}%"></i></div></td></tr></table>
  <h2>Pekerjaan yang Telah Dilaksanakan</h2><p style="white-space:pre-wrap">${esc(String(r.work_done ?? "-"))}</p>
  <h2>Kendala / Permasalahan</h2><p style="white-space:pre-wrap">${esc(String(r.issues ?? "-"))}</p>
  <h2>Rencana Pekerjaan Berikutnya</h2><p style="white-space:pre-wrap">${esc(String(r.next_plan ?? "-"))}</p>
  ${photos.length ? `<h2>Dokumentasi Lapangan</h2><table>${photos.map((p, i) => `<tr><td>${esc(p.caption || `Foto ${i + 1}`)}</td><td style="color:#666">${esc(p.path)}</td></tr>`).join("")}</table>` : ""}
  <div class="sig"><div>Dibuat oleh,<br/>Pelaksana<br/><br/><br/><br/>( ${esc(String(project.manager ?? "..................."))} )</div><div>Diperiksa &amp; disetujui,<br/>Pemberi Kerja / Pengawas<br/><br/><br/><br/>( ................................... )</div></div>
  <script>window.onload=()=>setTimeout(()=>window.print(),400)</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return toast.error("Popup blocked");
  w.document.write(html);
  w.document.close();
}

function ReportsTab({
  workspaceId,
  project,
  physical,
  wsName,
}: {
  workspaceId: string;
  project: XproRow & { id: string };
  physical: number;
  wsName?: string;
}) {
  const t = useT();
  const uploadFn = useServerFn(uploadWorkspaceFile);
  const { data = [] } = useProjRows("prj_progress_reports", workspaceId, project.id, "report_date");
  const { save, remove } = useCrud("prj_progress_reports", workspaceId, project.id);
  const [edit, setEdit] = useState<XproRow | null>(null);
  const [busy, setBusy] = useState(false);
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length || !edit) return;
    setBusy(true);
    try {
      const added: Photo[] = [];
      for (const f of Array.from(files)) {
        added.push({ path: await uploadWsFile(workspaceId, `xpro/${project.id}`, f, uploadFn), caption: f.name.replace(/\.[^.]+$/, "") });
      }
      setEdit({ ...edit, photos: JSON.stringify([...photosOf(edit), ...added]) });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{t("Progress reports", "Laporan progres")}</CardTitle>
        <Button
          size="sm"
          variant="navy"
          onClick={() =>
            setEdit({
              report_no: nextDocNumber("LPP", data.length + 1),
              report_date: todayISO(),
              progress_pct: Math.round(physical),
              photos: "[]",
              status: "draft",
            })
          }
        >
          <Plus />
          {t("New report", "Laporan baru")}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{t("Report", "Laporan")}</TableHead>
              <TableHead>{t("Period", "Periode")}</TableHead>
              <TableHead className="text-right">{t("Physical %", "Fisik %")}</TableHead>
              <TableHead>{t("Photos", "Foto")}</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data.length && (
              <Empty
                cols={7}
                text={t(
                  "No reports yet. Approved reports are required to issue BAST.",
                  "Belum ada laporan. Laporan yang disetujui menjadi syarat penerbitan BAST.",
                )}
              />
            )}
            {data.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell className="whitespace-nowrap font-medium">
                  {String(r.report_no)}
                  <p className="text-xs text-muted-foreground">{String(r.report_date)}</p>
                </TableCell>
                <TableCell>{String(r.period_label ?? "")}</TableCell>
                <TableCell className="text-right">{num(r.progress_pct)}%</TableCell>
                <TableCell>
                  <ImageIcon className="mr-1 inline h-4 w-4" />
                  {photosOf(r).length}
                </TableCell>
                <TableCell>
                  <Badge variant={r.status === "approved" ? "default" : "secondary"} className="capitalize">
                    {String(r.status)}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {r.status !== "approved" && (
                    <Button size="sm" variant="outline" onClick={() => save.mutate({ id: r.id, status: "approved" })}>
                      {t("Approve", "Setujui")}
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => printReport(project, r, { name: wsName })}>
                    <Printer />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEdit(r)}>
                    <Pencil />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => confirm(t("Delete?", "Hapus?")) && remove.mutate(String(r.id))}>
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <FormDialog
        open={!!edit}
        title={t("Progress report", "Laporan progres pekerjaan")}
        onClose={() => setEdit(null)}
        disabled={!edit?.report_no || busy || save.isPending}
        onSave={() => edit && save.mutate(edit, { onSuccess: () => setEdit(null) })}
      >
        {edit && (
          <>
            <AdminField label={t("Report no.", "No. laporan")}>
              <Input value={String(edit.report_no ?? "")} onChange={(e) => setEdit({ ...edit, report_no: e.target.value })} />
            </AdminField>
            <AdminField label={t("Date", "Tanggal")}>
              <Input
                type="date"
                value={String(edit.report_date ?? "")}
                onChange={(e) => setEdit({ ...edit, report_date: e.target.value })}
              />
            </AdminField>
            <AdminField label={t("Period (e.g. Week 3 / Oct 2026)", "Periode (mis. Minggu ke-3 / Okt 2026)")}>
              <Input value={String(edit.period_label ?? "")} onChange={(e) => setEdit({ ...edit, period_label: e.target.value })} />
            </AdminField>
            <AdminField label={t("Cumulative physical %", "Progres fisik kumulatif %")}>
              <Input
                type="number"
                value={String(edit.progress_pct ?? 0)}
                onChange={(e) => setEdit({ ...edit, progress_pct: Math.min(100, num(e.target.value)) })}
              />
            </AdminField>
            {(["work_done", "issues", "next_plan"] as const).map((k) => (
              <div key={k} className="sm:col-span-2">
                <AdminField
                  label={
                    { work_done: t("Work completed", "Pekerjaan yang dilaksanakan"), issues: t("Issues", "Kendala"), next_plan: t("Next plan", "Rencana berikutnya") }[k]
                  }
                >
                  <textarea
                    className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={String(edit[k] ?? "")}
                    onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                  />
                </AdminField>
              </div>
            ))}
            <div className="space-y-2 sm:col-span-2">
              <Button size="sm" variant="outline" asChild disabled={busy}>
                <label className="cursor-pointer">
                  <ImageIcon />
                  {busy ? "…" : t("Add site photos", "Tambah foto lapangan")}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
                </label>
              </Button>
              {photosOf(edit).map((p, i) => {
                const list = photosOf(edit);
                return (
                  <div key={p.path} className="flex items-center gap-2">
                    <Input
                      value={p.caption}
                      onChange={(e) => {
                        const next = [...list];
                        next[i] = { ...p, caption: e.target.value };
                        setEdit({ ...edit, photos: JSON.stringify(next) });
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEdit({ ...edit, photos: JSON.stringify(list.filter((_, j) => j !== i)) })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </FormDialog>
    </Card>
  );
}

/* ---------------------------- invoices & payments ------------------------- */

function InvoicesTab({ workspaceId, project, billings }: { workspaceId: string; project: XproRow & { id: string }; billings: XproRow[] }) {
  const t = useT();
  const ids = billings.map((b) => b.ar_document_id).filter(Boolean) as string[];
  const docs = useQuery({
    queryKey: ["xpro", "ar", project.id, workspaceId, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const docsRes = await listWorkspaceRows({
        data: { table: "sls_documents", workspaceId, inFilters: { id: ids }, limit: 500 },
      });
      const receiptsRes = await listWorkspaceRows({
        data: { table: "sls_documents", workspaceId, filters: { doc_type: "sales_receipt" }, inFilters: { source_document_id: ids }, limit: 500 },
      });
      return {
        invoices: ((docsRes as unknown as { rows?: XproRow[] })?.rows ?? []) as XproRow[],
        receipts: ((receiptsRes as unknown as { rows?: XproRow[] })?.rows ?? []) as XproRow[],
      };
    },
  });
  const inv = docs.data?.invoices ?? [];
  const rec = docs.data?.receipts ?? [];
  const billed = billings.reduce((s, b) => s + num(b.amount), 0);
  const invoiced = inv.reduce((s, d) => s + num(d.total), 0);
  const paid = rec
    .filter((r) => r.status !== "draft" && r.status !== "cancelled")
    .reduce((s, r) => s + num(r.total), 0);
  const kpi = [
    [t("Contract", "Kontrak"), num(project.contract_value)],
    [t("BAST value", "Nilai BAST"), billed],
    [t("Invoiced (net)", "Ditagihkan (neto)"), invoiced],
    [t("Received", "Diterima"), paid],
    [t("Outstanding", "Piutang"), invoiced - paid],
    [t("Remaining contract", "Sisa kontrak"), num(project.contract_value) - billed],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpi.map(([l, v]) => (
          <Card key={l}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{l}</p>
              <p className="font-semibold">{fmtIDR(v)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Invoices & payments", "Tagihan & pembayaran")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>BAST</TableHead>
                <TableHead>{t("AR invoice", "Faktur piutang")}</TableHead>
                <TableHead className="text-right">{t("Invoice total", "Total faktur")}</TableHead>
                <TableHead className="text-right">{t("Paid", "Dibayar")}</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!billings.length && <Empty cols={5} text={t("No BAST yet.", "Belum ada BAST.")} />}
              {billings.map((b) => {
                const d = inv.find((x) => x.id === b.ar_document_id);
                const p = rec
                  .filter((r) => r.source_document_id === b.ar_document_id && r.status !== "draft" && r.status !== "cancelled")
                  .reduce((s, r) => s + num(r.total), 0);
                return (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap">
                      {String(b.bast_no)}
                      <p className="text-xs text-muted-foreground">{num(b.progress_pct)}%</p>
                    </TableCell>
                    <TableCell>{String(b.ar_doc_number ?? "-")}</TableCell>
                    <TableCell className="text-right">{d ? fmtIDR(num(d.total)) : "-"}</TableCell>
                    <TableCell className="text-right">{fmtIDR(p)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {d ? (p >= num(d.total) && p > 0 ? "paid" : p > 0 ? "partial" : String(d.status)) : String(b.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
        <p className="px-6 pb-4 text-xs text-muted-foreground">
          {t(
            "Payments are recorded as AR Receipts in Sales; they appear here automatically.",
            "Pembayaran dicatat sebagai Penerimaan AR di Penjualan dan otomatis tampil di sini.",
          )}
        </p>
      </Card>
    </div>
  );
}

/* ---------------------------------- shell --------------------------------- */

export function XproProjectDetail({
  workspaceId,
  project,
  onBack,
  wsName,
}: {
  workspaceId: string;
  project: XproRow & { id: string };
  onBack: () => void;
  wsName?: string;
}) {
  const t = useT();
  const milestones = useProjRows("prj_milestones", workspaceId, project.id, "start_date").data ?? [];
  const tasks = useProjRows("prj_tasks", workspaceId, project.id, "start_date").data ?? [];
  const members = useProjRows("prj_members", workspaceId, project.id).data ?? [];
  const budget = useProjRows("prj_budget_lines", workspaceId, project.id).data ?? [];
  const expenses = useProjRows("prj_expenses", workspaceId, project.id).data ?? [];
  const billings = useProjRows("prj_billings", workspaceId, project.id, "bast_date").data ?? [];
  const w = milestones.reduce((s, m) => s + num(m.weight_pct), 0);
  const physical = w ? milestones.reduce((s, m) => s + num(m.weight_pct) * num(m.progress_pct), 0) / w : 0;
  const rab = budget.reduce((s, b) => s + num(b.amount), 0);
  const cost = expenses.reduce((s, e) => s + num(e.amount), 0);
  const billed = billings.reduce((s, b) => s + num(b.amount), 0);
  const { workspaceRole } = useApp();
  const canSeeValue = workspaceRole === "owner" || workspaceRole === "admin";
  const kpiAll = [
    [t("Contract value", "Nilai kontrak"), fmtIDR(num(project.contract_value))],
    [t("Physical progress", "Progres fisik"), `${physical.toFixed(1)}%`],
    ["RAB", fmtIDR(rab)],
    [t("Actual cost", "Realisasi biaya"), fmtIDR(cost)],
    [t("Billed (BAST)", "Tertagih (BAST)"), fmtIDR(billed)],
    [t("Est. margin", "Estimasi margin"), fmtIDR(num(project.contract_value) - cost)],
  ] as const;
  const kpi = canSeeValue ? kpiAll : kpiAll.filter((_, i) => i === 1);
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft />
        {t("Back to projects", "Kembali ke daftar proyek")}
      </Button>
      <div>
        <p className="text-xs font-semibold tracking-[0.28em] text-gold">XPRO · {String(project.code)}</p>
        <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">{String(project.name)}</h1>
        <p className="text-sm text-muted-foreground">
          {String(project.customer_name ?? "-")} · {String(project.contract_no ?? "-")} · {String(project.start_date ?? "")} →{" "}
          {String(project.end_date ?? "-")} · PM {String(project.manager ?? "-")}
        </p>
      </div>
      <div className={`grid gap-3 ${canSeeValue ? "sm:grid-cols-3 lg:grid-cols-6" : "sm:grid-cols-3"}`}>
        {kpi.map(([l, v]) => (
          <Card key={l}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{l}</p>
              <p className="font-semibold">{v}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Tabs defaultValue="tasks">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="tasks">{t("Tasks", "Tugas")}</TabsTrigger>
            <TabsTrigger value="gantt">Gantt</TabsTrigger>
            <TabsTrigger value="team">{t("Team", "Tim")}</TabsTrigger>
            {canSeeValue && <TabsTrigger value="expenses">{t("Expenses", "Biaya")}</TabsTrigger>}
            <TabsTrigger value="docs">{t("Documents", "Dokumen")}</TabsTrigger>
            <TabsTrigger value="reports">{t("Progress reports", "Laporan progres")}</TabsTrigger>
            {canSeeValue && <TabsTrigger value="invoices">{t("Invoices & payments", "Tagihan & pembayaran")}</TabsTrigger>}
          </TabsList>
        </div>
        <TabsContent value="tasks">
          <TasksTab workspaceId={workspaceId} project={project} milestones={milestones} members={members} />
        </TabsContent>
        <TabsContent value="gantt">
          <GanttTab project={project} milestones={milestones} tasks={tasks} />
        </TabsContent>
        <TabsContent value="team">
          <MembersTab workspaceId={workspaceId} project={project} />
        </TabsContent>
        <TabsContent value="expenses">
          <ExpensesTab workspaceId={workspaceId} project={project} budget={budget} />
        </TabsContent>
        <TabsContent value="docs">
          <DocumentsTab workspaceId={workspaceId} project={project} />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab workspaceId={workspaceId} project={project} physical={physical} wsName={wsName} />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoicesTab workspaceId={workspaceId} project={project} billings={billings} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
