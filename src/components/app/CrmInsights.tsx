import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, ShieldAlert, Target, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { AdminField, AdminSelect, fmtIDR } from "@/components/app/admin-ui";
import { PaginationBar, SearchInput, TableSkeletonRows, usePagination, useSearchFilter } from "@/components/app/ui-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { deleteWorkspaceRow, listWorkspaceRows, saveWorkspaceRow } from "@/lib/data.functions";
import { CRM_BROADCAST_CHANNELS, CRM_STAGES, stageLabel } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";

function Header({ title, kicker, children }: { title: string; kicker: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold tracking-[0.28em] text-gold">{kicker}</p>
        <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">{title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold text-navy dark:text-primary-foreground">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

interface DashLead {
  id: string;
  name: string;
  stage: string;
  status: string;
  estimated_value: number;
  probability: number;
  owner_name: string | null;
  created_at: string;
  stage_changed_at: string | null;
  lost_reason: string | null;
}

function daysSince(iso: string | null) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * #57 (BS New 3): peringatan dokumen tender yang sudah kedaluwarsa atau habis
 * dalam ≤30 hari. Sumbernya Pustaka Dokumen (#51); panel ini tidak tampil
 * selama pustaka masih kosong.
 */
function ExpiringDocsAlert({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const { data: docs = [] } = useQuery({
    queryKey: ["crm-doc-library", workspaceId],
    queryFn: async () => {
      const data = (await listWorkspaceRows({
        data: { table: "crm_doc_library", workspaceId, orderBy: "expiry_date", orderDir: "asc", limit: 500 },
      })) as { rows: Record<string, unknown>[] };
      return (data.rows ?? []).map((r) => ({
        name: String(r.name ?? ""),
        expiry_date: (r.expiry_date as string | null) ?? null,
      }));
    },
  });

  const list = docs.filter((d) => {
    if (!d.expiry_date) return false;
    const days = (new Date(d.expiry_date).getTime() - Date.now()) / 86_400_000;
    return days <= 30;
  });
  if (list.length === 0) return null;

  return (
    <Card className="border-destructive/60">
      <CardContent className="flex flex-wrap items-start gap-3 p-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-destructive">
            {lang === "id"
              ? `${list.length} dokumen tender kedaluwarsa / habis dalam 30 hari`
              : `${list.length} tender documents expired / expiring within 30 days`}
          </p>
          <p className="mt-1 text-muted-foreground">
            {list.map((d) => `${d.name} (${d.expiry_date})`).join(" · ")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function CrmDashboardView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["crm-dashboard-leads", workspaceId],
    queryFn: async () => {
      const data = (await listWorkspaceRows({
        data: { table: "crm_leads", workspaceId, orderBy: "created_at", orderDir: "desc", limit: 2000 },
      })) as { rows: Record<string, unknown>[] };
      return (data.rows ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        stage: r.stage,
        status: r.status,
        estimated_value: Number(r.estimated_value) || 0,
        probability: Number(r.probability) || 0,
        owner_name: r.owner_name ?? null,
        created_at: r.created_at ?? "",
        stage_changed_at: r.stage_changed_at ?? null,
        lost_reason: r.lost_reason ?? null,
      })) as DashLead[];
    },
  });

  const stats = useMemo(() => {
    const open = leads.filter((l) => l.status === "open");
    const won = leads.filter((l) => l.stage === "won");
    const lost = leads.filter((l) => l.stage === "lost");
    const pipeline = open.reduce((s, l) => s + Number(l.estimated_value), 0);
    const forecast = open.reduce((s, l) => s + (Number(l.estimated_value) * Number(l.probability)) / 100, 0);
    const closed = won.length + lost.length;
    const winRate = closed ? Math.round((won.length / closed) * 100) : 0;
    const since = Date.now() - 30 * 86_400_000;
    const fresh = leads.filter((l) => new Date(l.created_at).getTime() >= since).length;

    const byStage = CRM_STAGES.map((s) => {
      const rows = leads.filter((l) => l.stage === s.id);
      return { stage: s.id, count: rows.length, value: rows.reduce((a, l) => a + Number(l.estimated_value), 0) };
    });

    const owners = new Map<string, { open: number; value: number; won: number }>();
    leads.forEach((l) => {
      const key = l.owner_name?.trim() || (lang === "id" ? "Belum ditugaskan" : "Unassigned");
      const cur = owners.get(key) ?? { open: 0, value: 0, won: 0 };
      if (l.status === "open") {
        cur.open += 1;
        cur.value += Number(l.estimated_value);
      }
      if (l.stage === "won") cur.won += 1;
      owners.set(key, cur);
    });

    const stuck = open
      .map((l) => ({ ...l, age: daysSince(l.stage_changed_at ?? l.created_at) }))
      .filter((l) => l.age >= 14)
      .sort((a, b) => b.age - a.age)
      .slice(0, 8);

    const lostReasons = new Map<string, number>();
    lost.forEach((l) => {
      const key = l.lost_reason?.trim() || (lang === "id" ? "Tanpa alasan" : "No reason");
      lostReasons.set(key, (lostReasons.get(key) ?? 0) + 1);
    });

    const maxStageValue = Math.max(1, ...byStage.map((s) => s.value));

    return { pipeline, forecast, winRate, fresh, byStage, owners: [...owners.entries()], stuck, lostReasons: [...lostReasons.entries()], maxStageValue };
  }, [leads, lang]);

  return (
    <div className="space-y-6">
      <Header kicker="QALLING CRM" title={lang === "id" ? "Dasbor CRM" : "CRM Dashboard"} />

      <ExpiringDocsAlert workspaceId={workspaceId} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={lang === "id" ? "Nilai pipeline" : "Pipeline value"} value={fmtIDR(stats.pipeline)} />
        <Metric
          label={lang === "id" ? "Forecast tertimbang" : "Weighted forecast"}
          value={fmtIDR(stats.forecast)}
          hint={lang === "id" ? "Nilai × probabilitas" : "Value × probability"}
        />
        <Metric label={lang === "id" ? "Win rate" : "Win rate"} value={`${stats.winRate}%`} />
        <Metric label={lang === "id" ? "Prospek baru (30 hari)" : "New leads (30 days)"} value={String(stats.fresh)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-6">
            <p className="flex items-center gap-2 font-medium text-navy dark:text-primary-foreground">
              <TrendingUp className="h-4 w-4 text-gold" /> {lang === "id" ? "Nilai per tahap" : "Value by stage"}
            </p>
            {isLoading && <p className="text-sm text-muted-foreground">{lang === "id" ? "Memuat…" : "Loading…"}</p>}
            {stats.byStage.map((s) => (
              <div key={s.stage} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {stageLabel(s.stage, lang)} <span className="text-muted-foreground">({s.count})</span>
                  </span>
                  <span className="font-medium">{fmtIDR(s.value)}</span>
                </div>
                <Progress value={(s.value / stats.maxStageValue) * 100} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{lang === "id" ? "Sales" : "Owner"}</TableHead>
                  <TableHead className="text-right">{lang === "id" ? "Prospek aktif" : "Open leads"}</TableHead>
                  <TableHead className="text-right">{lang === "id" ? "Nilai" : "Value"}</TableHead>
                  <TableHead className="text-right">{lang === "id" ? "Menang" : "Won"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.owners.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      {lang === "id" ? "Belum ada data." : "No data yet."}
                    </TableCell>
                  </TableRow>
                )}
                {stats.owners.map(([owner, v]) => (
                  <TableRow key={owner}>
                    <TableCell>{owner}</TableCell>
                    <TableCell className="text-right">{v.open}</TableCell>
                    <TableCell className="text-right">{fmtIDR(v.value)}</TableCell>
                    <TableCell className="text-right">{v.won}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="font-medium text-navy dark:text-primary-foreground">
              {lang === "id" ? "Prospek mandek (≥ 14 hari)" : "Stuck leads (14+ days)"}
            </p>
            {stats.stuck.length === 0 && (
              <p className="text-sm text-muted-foreground">{lang === "id" ? "Semua prospek bergerak." : "Everything is moving."}</p>
            )}
            {stats.stuck.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="truncate">{l.name}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">{stageLabel(l.stage, lang)}</Badge>
                  <Badge variant="outline">{l.age} {lang === "id" ? "hari" : "days"}</Badge>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="font-medium text-navy dark:text-primary-foreground">
              {lang === "id" ? "Alasan kalah" : "Lost reasons"}
            </p>
            {stats.lostReasons.length === 0 && (
              <p className="text-sm text-muted-foreground">{lang === "id" ? "Belum ada prospek kalah." : "No lost leads yet."}</p>
            )}
            {stats.lostReasons.map(([reason, count]) => (
              <div key={reason} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span className="truncate">{reason}</span>
                <Badge variant="outline">{count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface TargetRow {
  id: string;
  owner_name: string;
  period_month: string;
  target_amount: number;
  notes: string | null;
}

export function CrmTargetsView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const month = new Date().toISOString().slice(0, 7);
  const [form, setForm] = useState({ id: "", owner_name: "", period_month: month, target_amount: 0, notes: "" });
  // #57: pencarian + paginasi tabel bersama.
  const [term, setTerm] = useState("");

  const { data: targets = [], isLoading: targetsLoading } = useQuery({
    queryKey: ["crm-targets", workspaceId],
    queryFn: async () => {
      const data = (await listWorkspaceRows({
        data: { table: "crm_targets", workspaceId, orderBy: "period_month", orderDir: "desc", limit: 500 },
      })) as { rows: Record<string, unknown>[] };
      return (data.rows ?? []).map((r) => ({
        id: r.id,
        owner_name: r.owner_name,
        period_month: r.period_month ?? "",
        target_amount: Number(r.target_amount) || 0,
        notes: r.notes ?? null,
      })) as TargetRow[];
    },
  });

  const { data: wonLeads = [] } = useQuery({
    queryKey: ["crm-won-leads", workspaceId],
    queryFn: async () => {
      const data = (await listWorkspaceRows({
        data: { table: "crm_leads", workspaceId, filters: { stage: "won" }, orderBy: "created_at", orderDir: "desc", limit: 2000 },
      })) as { rows: Record<string, unknown>[] };
      return (data.rows ?? []).map((r) => ({
        owner_name: r.owner_name ?? null,
        estimated_value: Number(r.estimated_value) || 0,
        stage_changed_at: r.stage_changed_at ?? null,
      })) as { owner_name: string | null; estimated_value: number; stage_changed_at: string | null }[];
    },
  });

  const realized = (owner: string, period: string) =>
    wonLeads
      .filter((l) => (l.owner_name ?? "") === owner && (l.stage_changed_at ?? "").slice(0, 7) === period.slice(0, 7))
      .reduce((s, l) => s + Number(l.estimated_value), 0);

  const visibleTargets = useSearchFilter(targets, term, (r) => [r.owner_name, r.period_month, r.notes]);
  const pager = usePagination(visibleTargets);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        owner_name: form.owner_name.trim(),
        period_month: `${form.period_month.slice(0, 7)}-01`,
        target_amount: Number(form.target_amount) || 0,
        notes: form.notes || null,
      };
      await saveWorkspaceRow({ data: { table: "crm_targets", workspaceId, id: form.id || undefined, data: payload } });
    },
    onSuccess: () => {
      toast.success(lang === "id" ? "Target tersimpan" : "Target saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["crm-targets", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table: "crm_targets", workspaceId, id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-targets", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Header kicker="QALLING CRM" title={lang === "id" ? "Target Sales" : "Sales Targets"}>
        <SearchInput
          value={term}
          onChange={setTerm}
          placeholder={lang === "id" ? "Cari sales/periode…" : "Search owner/period…"}
        />
        <Button
          variant="navy"
          onClick={() => {
            setForm({ id: "", owner_name: "", period_month: month, target_amount: 0, notes: "" });
            setOpen(true);
          }}
        >
          <Plus /> {lang === "id" ? "Target baru" : "New target"}
        </Button>
      </Header>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{lang === "id" ? "Periode" : "Period"}</TableHead>
                <TableHead>{lang === "id" ? "Sales" : "Owner"}</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">{lang === "id" ? "Realisasi" : "Achieved"}</TableHead>
                <TableHead className="w-40">{lang === "id" ? "Pencapaian" : "Attainment"}</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {targetsLoading && <TableSkeletonRows columns={6} />}
              {!targetsLoading && visibleTargets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {lang === "id" ? "Belum ada target." : "No targets yet."}
                  </TableCell>
                </TableRow>
              )}
              {pager.items.map((t) => {
                const got = realized(t.owner_name, t.period_month);
                const pct = t.target_amount ? Math.min(100, Math.round((got / Number(t.target_amount)) * 100)) : 0;
                return (
                  <TableRow key={t.id}>
                    <TableCell>{t.period_month.slice(0, 7)}</TableCell>
                    <TableCell>{t.owner_name}</TableCell>
                    <TableCell className="text-right">{fmtIDR(Number(t.target_amount))}</TableCell>
                    <TableCell className="text-right">{fmtIDR(got)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={pct} />
                        <span className="w-10 text-right text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => remove.mutate(t.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <PaginationBar p={pager} />
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-4 w-4 text-gold" /> {lang === "id" ? "Target bulanan" : "Monthly target"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <AdminField label={lang === "id" ? "Sales" : "Owner"}>
              <Input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
            </AdminField>
            <AdminField label={lang === "id" ? "Periode" : "Period"}>
              <Input type="month" value={form.period_month.slice(0, 7)} onChange={(e) => setForm({ ...form, period_month: e.target.value })} />
            </AdminField>
            <AdminField label={lang === "id" ? "Nilai target" : "Target amount"}>
              <Input type="number" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: Number(e.target.value) })} />
            </AdminField>
            <AdminField label={lang === "id" ? "Catatan" : "Notes"}>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </AdminField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {lang === "id" ? "Batal" : "Cancel"}
            </Button>
            <Button variant="navy" disabled={!form.owner_name.trim() || save.isPending} onClick={() => save.mutate()}>
              {lang === "id" ? "Simpan" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TemplateRow {
  id: string;
  name: string;
  channel: string;
  body: string;
  is_active: boolean;
}

export function CrmTemplatesView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", channel: "whatsapp", body: "" });
  // #57: pencarian + paginasi daftar bersama.
  const [term, setTerm] = useState("");

  const { data: rows = [] } = useQuery({
    queryKey: ["crm-templates", workspaceId],
    queryFn: async () => {
      const data = (await listWorkspaceRows({
        data: { table: "crm_templates", workspaceId, orderBy: "created_at", orderDir: "desc", limit: 500 },
      })) as { rows: Record<string, unknown>[] };
      return (data.rows ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        channel: r.channel,
        body: r.body,
        is_active: Boolean(r.is_active),
      })) as TemplateRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name.trim(), channel: form.channel, body: form.body };
      await saveWorkspaceRow({ data: { table: "crm_templates", workspaceId, id: form.id || undefined, data: payload } });
    },
    onSuccess: () => {
      toast.success(lang === "id" ? "Template tersimpan" : "Template saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["crm-templates", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table: "crm_templates", workspaceId, id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-templates", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const visibleTemplates = useSearchFilter(rows, term, (r) => [r.name, r.channel, r.body]);
  const pager = usePagination(visibleTemplates, 10);

  return (
    <div className="space-y-6">
      <Header kicker="QALLING CRM" title={lang === "id" ? "Template Pesan" : "Message Templates"}>
        <SearchInput
          value={term}
          onChange={setTerm}
          placeholder={lang === "id" ? "Cari template…" : "Search templates…"}
        />
        <Button
          variant="navy"
          onClick={() => {
            setForm({ id: "", name: "", channel: "whatsapp", body: "" });
            setOpen(true);
          }}
        >
          <Plus /> {lang === "id" ? "Template baru" : "New template"}
        </Button>
      </Header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleTemplates.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {term.trim()
                ? lang === "id"
                  ? "Tidak ada template yang cocok."
                  : "No template matches your search."
                : lang === "id"
                  ? "Belum ada template. Gunakan {{name}} untuk menyisipkan nama penerima."
                  : "No templates yet. Use {{name}} to insert the recipient name."}
            </CardContent>
          </Card>
        )}
        {pager.items.map((t) => (
          <Card key={t.id}>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-navy dark:text-primary-foreground">{t.name}</p>
                  <Badge variant="secondary" className="mt-1 capitalize">
                    {t.channel}
                  </Badge>
                </div>
                <div className="flex">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard.writeText(t.body);
                      toast.success(lang === "id" ? "Template disalin" : "Template copied");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove.mutate(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setForm({ id: t.id, name: t.name, channel: t.channel, body: t.body });
                  setOpen(true);
                }}
              >
                {lang === "id" ? "Ubah" : "Edit"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {visibleTemplates.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <PaginationBar p={pager} />
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lang === "id" ? "Template pesan" : "Message template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <AdminField label={lang === "id" ? "Nama" : "Name"}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </AdminField>
            <AdminField label={lang === "id" ? "Kanal" : "Channel"}>
              <AdminSelect value={form.channel} onChange={(v) => setForm({ ...form, channel: v })}>
                {CRM_BROADCAST_CHANNELS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {lang === "id" ? c.id_ : c.en}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label={lang === "id" ? "Isi pesan" : "Message body"}>
              <Textarea rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </AdminField>
            <p className="text-xs text-muted-foreground">
              {lang === "id" ? "Variabel tersedia: {{name}}" : "Available variable: {{name}}"}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {lang === "id" ? "Batal" : "Cancel"}
            </Button>
            <Button variant="navy" disabled={!form.name.trim() || !form.body.trim() || save.isPending} onClick={() => save.mutate()}>
              {lang === "id" ? "Simpan" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
