import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WaChat } from "@/components/app/WaChat";
import { ManagedWhatsApp } from "@/components/app/ManagedWhatsApp";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  ExternalLink,
  Megaphone,
  Plug,
  Plus,
  Send,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminField, AdminSelect, fmtIDR } from "@/components/app/admin-ui";
import {
  PaginationBar,
  SearchInput,
  usePagination,
  useSearchFilter,
} from "@/components/app/ui-states";
import {
  deleteWorkspaceRow,
  listWorkspaceRows,
  saveWorkspaceRow,
  upsertWorkspaceRows,
} from "@/lib/data.functions";
import { sqlDateTime } from "@/lib/datetime";
import { useI18n } from "@/lib/i18n";
import {
  CRM_BROADCAST_CHANNELS,
  CRM_CAMPAIGN_OBJECTIVES,
  CRM_CAMPAIGN_STATUSES,
  CRM_SOCIAL_PLATFORMS,
  CRM_STAGES,
  CRM_WA_PROVIDERS,
  parsePlatforms,
  renderBroadcastMessage,
  waLink,
} from "@/lib/crm";
import { deleteCrmBroadcast, getCrmWaSettings, saveCrmWaSettings } from "@/lib/crm.functions";
import { sendWaBroadcast, testWaGateway } from "@/lib/crm-broadcast.functions";

function PageHeader({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children?: React.ReactNode;
}) {
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

interface BroadcastRow {
  id: string;
  name: string;
  channel: string;
  message: string;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
}

interface RecipientRow {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
}

const EMPTY_BROADCAST = {
  name: "",
  channel: "whatsapp",
  message: "Halo {{name}}, ",
  scheduled_at: "",
  audience: "leads" as "leads" | "customers" | "manual",
  stage: "",
  manual: "",
};

export function BroadcastView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_BROADCAST });
  const [activeId, setActiveId] = useState<string | null>(null);
  const send = useServerFn(sendWaBroadcast);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["crm-broadcasts", workspaceId],
    queryFn: async () => {
      const data = (await listWorkspaceRows({
        data: {
          table: "crm_broadcasts",
          workspaceId,
          orderBy: "created_at",
          orderDir: "desc",
          limit: 500,
        },
      })) as { rows: Record<string, unknown>[] };
      return (data.rows ?? []).map((row) => {
        return {
          ...row,
          total_recipients: Number(row.total_recipients) || 0,
          sent_count: Number(row.sent_count) || 0,
          failed_count: Number(row.failed_count) || 0,
        } as unknown as BroadcastRow;
      });
    },
  });

  // #57: pencarian + paginasi daftar broadcast.
  const [term, setTerm] = useState("");
  const visibleRows = useSearchFilter(rows, term, (r) => [r.name, r.channel, r.status, r.message]);
  const pager = usePagination(visibleRows);

  const { data: recipients = [] } = useQuery({
    queryKey: ["crm-broadcast-recipients", activeId],
    enabled: Boolean(activeId),
    queryFn: async () => {
      if (!activeId) return [] as RecipientRow[];
      const data = (await listWorkspaceRows({
        data: {
          table: "crm_broadcast_recipients",
          workspaceId,
          filters: { broadcast_id: activeId },
          orderBy: "created_at",
          orderDir: "asc",
          limit: 2000,
        },
      })) as { rows: Record<string, unknown>[] };
      return (data.rows ?? []) as unknown as RecipientRow[];
    },
  });

  const active = rows.find((r) => r.id === activeId) ?? null;

  const save = useMutation({
    mutationFn: async () => {
      let audience: {
        name: string;
        phone: string | null;
        email: string | null;
        lead_id?: string | null;
      }[] = [];

      if (form.audience === "leads") {
        const data = (await listWorkspaceRows({
          data: {
            table: "crm_leads",
            workspaceId,
            filters: form.stage ? { stage: form.stage } : undefined,
            orderBy: "created_at",
            orderDir: "desc",
            limit: 2000,
          },
        })) as { rows: Record<string, unknown>[] };
        const rows = (data.rows ?? []) as unknown as {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
          stage: string;
        }[];
        audience = rows.map((l) => ({
          name: l.name,
          phone: l.phone,
          email: l.email,
          lead_id: l.id,
        }));
      } else if (form.audience === "customers") {
        const data = (await listWorkspaceRows({
          data: {
            table: "md_customers",
            workspaceId,
            filters: { is_active: 1 },
            orderBy: "name",
            orderDir: "asc",
            limit: 2000,
          },
        })) as { rows: Record<string, unknown>[] };
        const rows = (data.rows ?? []) as unknown as {
          name: string;
          phone: string | null;
          email: string | null;
        }[];
        audience = rows.map((c) => ({ name: c.name, phone: c.phone, email: c.email }));
      } else {
        audience = form.manual
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [name, phone] = line.split(",").map((p) => (p ?? "").trim());
            return { name: name || phone || "", phone: phone || name || null, email: null };
          });
      }

      if (audience.length === 0)
        throw new Error(t("No recipients found", "Tidak ada penerima ditemukan"));

      const bc = (await saveWorkspaceRow({
        data: {
          table: "crm_broadcasts",
          workspaceId,
          data: {
            name: form.name.trim(),
            channel: form.channel,
            message: form.message,
            status: form.scheduled_at ? "scheduled" : "draft",
            scheduled_at: form.scheduled_at ? sqlDateTime(new Date(form.scheduled_at)) : null,
            total_recipients: audience.length,
          },
        },
      })) as { id: string };

      await upsertWorkspaceRows({
        data: {
          table: "crm_broadcast_recipients",
          workspaceId,
          rows: audience.map((a) => ({
            broadcast_id: bc.id,
            lead_id: a.lead_id ?? null,
            name: a.name,
            phone: a.phone,
            email: a.email,
          })),
        },
      });
      return bc.id as string;
    },
    onSuccess: (id) => {
      toast.success(t("Broadcast created", "Broadcast dibuat"));
      setOpen(false);
      setForm({ ...EMPTY_BROADCAST });
      setActiveId(id);
      qc.invalidateQueries({ queryKey: ["crm-broadcasts", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteCrmBroadcast({ data: { workspaceId, broadcastId: id } });
    },
    onSuccess: (_d, id) => {
      if (activeId === id) setActiveId(null);
      qc.invalidateQueries({ queryKey: ["crm-broadcasts", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dispatch = useMutation({
    mutationFn: async (id: string) => send({ data: { workspaceId, broadcastId: id } }),
    onSuccess: (res) => {
      toast.success(
        t(`Sent ${res.sent}, failed ${res.failed}`, `Terkirim ${res.sent}, gagal ${res.failed}`),
      );
      qc.invalidateQueries({ queryKey: ["crm-broadcasts", workspaceId] });
      qc.invalidateQueries({ queryKey: ["crm-broadcast-recipients", activeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markSent = useMutation({
    mutationFn: async (id: string) => {
      await saveWorkspaceRow({
        data: {
          table: "crm_broadcast_recipients",
          workspaceId,
          id,
          data: { status: "sent", sent_at: sqlDateTime(), error: null },
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-broadcast-recipients", activeId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader kicker="QALLING CRM" title={t("Broadcast", "Broadcast Pesan")}>
        <SearchInput
          value={term}
          onChange={setTerm}
          placeholder={t("Search broadcasts…", "Cari broadcast…")}
        />
        <Button variant="navy" onClick={() => setOpen(true)}>
          <Plus /> {t("New broadcast", "Broadcast baru")}
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{t("Name", "Nama")}</TableHead>
                <TableHead>{t("Channel", "Kanal")}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">{t("Recipients", "Penerima")}</TableHead>
                <TableHead className="text-right">{t("Sent", "Terkirim")}</TableHead>
                <TableHead>{t("Schedule", "Jadwal")}</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(isLoading || visibleRows.length === 0) && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {isLoading
                      ? t("Loading…", "Memuat…")
                      : term.trim()
                        ? t("No broadcast matches your search.", "Tidak ada broadcast yang cocok.")
                        : t("No broadcasts yet.", "Belum ada broadcast.")}
                  </TableCell>
                </TableRow>
              )}
              {pager.items.map((r, i) => (
                <TableRow key={r.id} className={activeId === r.id ? "bg-muted/50" : undefined}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="capitalize">{r.channel}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "sent" ? "secondary" : "outline"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{r.total_recipients}</TableCell>
                  <TableCell className="text-right">{r.sent_count}</TableCell>
                  <TableCell>
                    {r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setActiveId(r.id === activeId ? null : r.id)}
                    >
                      {t("Open", "Buka")}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationBar p={pager} />
        </CardContent>
      </Card>

      {active && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4 text-gold" />
              {active.name}
            </CardTitle>
            <Button
              variant="navy"
              disabled={dispatch.isPending || active.channel !== "whatsapp"}
              onClick={() => dispatch.mutate(active.id)}
            >
              <Send />{" "}
              {dispatch.isPending
                ? t("Sending…", "Mengirim…")
                : t("Send via gateway", "Kirim via gateway")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-3 text-sm">
              {active.message}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Name", "Nama")}</TableHead>
                  <TableHead>{t("Phone", "Telepon")}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>{t("Note", "Catatan")}</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.name ?? "—"}</TableCell>
                    <TableCell>{r.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === "sent"
                            ? "secondary"
                            : r.status === "failed"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                      {r.error ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.phone && (
                        <Button size="sm" variant="ghost" asChild>
                          <a
                            href={waLink(
                              r.phone,
                              renderBroadcastMessage(active.message, r.name ?? ""),
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" /> WA
                          </a>
                        </Button>
                      )}
                      {r.status !== "sent" && (
                        <Button size="icon" variant="ghost" onClick={() => markSent.mutate(r.id)}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("New broadcast", "Broadcast baru")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label={t("Name", "Nama")}>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </AdminField>
            <AdminField label={t("Channel", "Kanal")}>
              <AdminSelect value={form.channel} onChange={(v) => setForm({ ...form, channel: v })}>
                {CRM_BROADCAST_CHANNELS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {lang === "id" ? c.id_ : c.en}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label={t("Audience", "Audiens")}>
              <AdminSelect
                value={form.audience}
                onChange={(v) => setForm({ ...form, audience: v as typeof form.audience })}
              >
                <option value="leads">{t("Leads", "Prospek")}</option>
                <option value="customers">{t("Customers", "Pelanggan")}</option>
                <option value="manual">{t("Manual list", "Daftar manual")}</option>
              </AdminSelect>
            </AdminField>
            {form.audience === "leads" && (
              <AdminField label={t("Filter stage", "Filter tahap")}>
                <AdminSelect value={form.stage} onChange={(v) => setForm({ ...form, stage: v })}>
                  <option value="">{t("All stages", "Semua tahap")}</option>
                  {CRM_STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {lang === "id" ? s.id_ : s.en}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
            )}
            <AdminField label={t("Schedule (optional)", "Jadwal (opsional)")}>
              <Input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
              />
            </AdminField>
            {form.audience === "manual" && (
              <div className="sm:col-span-2">
                <AdminField
                  label={t(
                    "Recipients (name, phone per line)",
                    "Penerima (nama, telepon per baris)",
                  )}
                >
                  <Textarea
                    rows={4}
                    value={form.manual}
                    onChange={(e) => setForm({ ...form, manual: e.target.value })}
                    placeholder="Budi, 08123456789"
                  />
                </AdminField>
              </div>
            )}
            <div className="sm:col-span-2">
              <AdminField
                label={t(
                  "Message — use {{name}} for personalisation",
                  "Pesan — gunakan {{name}} untuk personalisasi",
                )}
              >
                <Textarea
                  rows={5}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                />
              </AdminField>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("Cancel", "Batal")}
            </Button>
            <Button
              variant="navy"
              disabled={!form.name.trim() || !form.message.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? t("Building…", "Menyiapkan…") : t("Create", "Buat")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function WaGatewayView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const { data } = useQuery({
    queryKey: ["crm-wa-settings", workspaceId],
    queryFn: async () => getCrmWaSettings({ data: { workspaceId } }),
  });

  return (
    <div className="space-y-6">
      <PageHeader kicker="QALLING CRM" title={t("WhatsApp Gateway", "WhatsApp Gateway")} />
      {data?.managed && data.phone_number_id ? (
        <Tabs defaultValue="chat" className="space-y-4">
          <TabsList className="grid w-full max-w-xs grid-cols-2 rounded-full">
            <TabsTrigger value="chat" className="rounded-full">
              {t("Chat", "Chat")}
            </TabsTrigger>
            <TabsTrigger value="number" className="rounded-full">
              {t("Number", "Nomor")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat">
            <WaChat workspaceId={workspaceId} />
          </TabsContent>
          <TabsContent value="number">
            <div className="mx-auto max-w-3xl">
              <ManagedWhatsApp workspaceId={workspaceId} />
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        <div className="mx-auto max-w-3xl">
          <ManagedWhatsApp workspaceId={workspaceId} />
        </div>
      )}
    </div>
  );
}

interface CampaignRow {
  id: string;
  name: string;
  objective: string;
  platforms: string[];
  content: string | null;
  media_url: string | null;
  budget: number;
  start_date: string | null;
  end_date: string | null;
  status: string;
  reach: number;
  clicks: number;
  leads_generated: number;
  owner_name: string | null;
}

type CampaignForm = Omit<CampaignRow, "id"> & { id?: string };

const EMPTY_CAMPAIGN: CampaignForm = {
  name: "",
  objective: "awareness",
  platforms: [],
  content: "",
  media_url: "",
  budget: 0,
  start_date: "",
  end_date: "",
  status: "draft",
  reach: 0,
  clicks: 0,
  leads_generated: 0,
  owner_name: "",
};

export function CampaignView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CampaignForm>(EMPTY_CAMPAIGN);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["crm-campaigns", workspaceId],
    queryFn: async () => {
      const data = (await listWorkspaceRows({
        data: {
          table: "crm_campaigns",
          workspaceId,
          orderBy: "created_at",
          orderDir: "desc",
          limit: 500,
        },
      })) as { rows: Record<string, unknown>[] };
      return (data.rows ?? []).map((row) => {
        return {
          ...row,
          platforms: parsePlatforms(row.platforms),
          budget: Number(row.budget) || 0,
          reach: Number(row.reach) || 0,
          clicks: Number(row.clicks) || 0,
          leads_generated: Number(row.leads_generated) || 0,
        } as unknown as CampaignRow;
      });
    },
  });

  const totals = useMemo(
    () => ({
      budget: rows.reduce((a, b) => a + Number(b.budget || 0), 0),
      reach: rows.reduce((a, b) => a + Number(b.reach || 0), 0),
      leads: rows.reduce((a, b) => a + Number(b.leads_generated || 0), 0),
    }),
    [rows],
  );

  // #57: pencarian + paginasi daftar kampanye.
  const [term, setTerm] = useState("");
  const visibleRows = useSearchFilter(rows, term, (r) => [
    r.name,
    r.objective,
    r.status,
    r.owner_name,
    (r.platforms ?? []).join(" "),
  ]);
  const pager = usePagination(visibleRows);

  const save = useMutation({
    mutationFn: async (v: CampaignForm) => {
      const payload = {
        name: v.name.trim(),
        objective: v.objective,
        platforms: JSON.stringify(v.platforms ?? []),
        content: v.content || null,
        media_url: v.media_url || null,
        budget: Number(v.budget) || 0,
        start_date: v.start_date || null,
        end_date: v.end_date || null,
        status: v.status,
        reach: Number(v.reach) || 0,
        clicks: Number(v.clicks) || 0,
        leads_generated: Number(v.leads_generated) || 0,
        owner_name: v.owner_name || null,
      };
      await saveWorkspaceRow({
        data: { table: "crm_campaigns", workspaceId, id: v.id || undefined, data: payload },
      });
    },
    onSuccess: () => {
      toast.success(t("Campaign saved", "Kampanye tersimpan"));
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["crm-campaigns", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table: "crm_campaigns", workspaceId, id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-campaigns", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePlatform = (id: string) =>
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(id)
        ? f.platforms.filter((p) => p !== id)
        : [...f.platforms, id],
    }));

  return (
    <div className="space-y-6">
      <PageHeader kicker="QALLING CRM" title={t("Social Campaigns", "Kampanye Sosial")}>
        <SearchInput
          value={term}
          onChange={setTerm}
          placeholder={t("Search campaigns…", "Cari kampanye…")}
        />
        <Button
          variant="navy"
          onClick={() => {
            setForm(EMPTY_CAMPAIGN);
            setOpen(true);
          }}
        >
          <Plus /> {t("New campaign", "Kampanye baru")}
        </Button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("Total budget", "Total anggaran")}</p>
            <p className="text-lg font-semibold text-navy dark:text-primary-foreground">
              {fmtIDR(totals.budget)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("Total reach", "Total jangkauan")}</p>
            <p className="text-lg font-semibold text-navy dark:text-primary-foreground">
              {totals.reach.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              {t("Leads generated", "Prospek dihasilkan")}
            </p>
            <p className="text-lg font-semibold text-navy dark:text-primary-foreground">
              {totals.leads}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{t("Campaign", "Kampanye")}</TableHead>
                <TableHead>{t("Platforms", "Platform")}</TableHead>
                <TableHead>{t("Objective", "Tujuan")}</TableHead>
                <TableHead className="text-right">{t("Budget", "Anggaran")}</TableHead>
                <TableHead>{t("Period", "Periode")}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(isLoading || visibleRows.length === 0) && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {isLoading
                      ? t("Loading…", "Memuat…")
                      : term.trim()
                        ? t("No campaign matches your search.", "Tidak ada kampanye yang cocok.")
                        : t("No campaigns yet.", "Belum ada kampanye.")}
                  </TableCell>
                </TableRow>
              )}
              {pager.items.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(r.platforms ?? []).map((p) => (
                        <Badge key={p} variant="secondary" className="capitalize">
                          {p}
                        </Badge>
                      ))}
                      {(r.platforms ?? []).length === 0 && "—"}
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{r.objective}</TableCell>
                  <TableCell className="text-right">{fmtIDR(Number(r.budget))}</TableCell>
                  <TableCell className="text-xs">
                    {r.start_date ?? "—"} → {r.end_date ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "running" ? "secondary" : "outline"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setForm({
                          ...r,
                          platforms: r.platforms ?? [],
                          content: r.content ?? "",
                          media_url: r.media_url ?? "",
                          start_date: r.start_date ?? "",
                          end_date: r.end_date ?? "",
                          owner_name: r.owner_name ?? "",
                        });
                        setOpen(true);
                      }}
                    >
                      {t("Edit", "Ubah")}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationBar p={pager} />
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-gold" />
              {form.id ? t("Edit campaign", "Ubah kampanye") : t("New campaign", "Kampanye baru")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label={t("Name", "Nama")}>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </AdminField>
            <AdminField label={t("Objective", "Tujuan")}>
              <AdminSelect
                value={form.objective}
                onChange={(v) => setForm({ ...form, objective: v })}
              >
                {CRM_CAMPAIGN_OBJECTIVES.map((o) => (
                  <option key={o.id} value={o.id}>
                    {lang === "id" ? o.id_ : o.en}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <div className="sm:col-span-2">
              <AdminField label={t("Platforms", "Platform")}>
                <div className="flex flex-wrap gap-3 pt-1">
                  {CRM_SOCIAL_PLATFORMS.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.platforms.includes(p.id)}
                        onCheckedChange={() => togglePlatform(p.id)}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </AdminField>
            </div>
            <AdminField label={t("Budget", "Anggaran")}>
              <Input
                type="number"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })}
              />
            </AdminField>
            <AdminField label="Status">
              <AdminSelect value={form.status} onChange={(v) => setForm({ ...form, status: v })}>
                {CRM_CAMPAIGN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label={t("Start date", "Tanggal mulai")}>
              <Input
                type="date"
                value={form.start_date ?? ""}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </AdminField>
            <AdminField label={t("End date", "Tanggal selesai")}>
              <Input
                type="date"
                value={form.end_date ?? ""}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </AdminField>
            <AdminField label={t("Media link", "Tautan media")}>
              <Input
                value={form.media_url ?? ""}
                onChange={(e) => setForm({ ...form, media_url: e.target.value })}
              />
            </AdminField>
            <AdminField label={t("Owner", "Penanggung jawab")}>
              <Input
                value={form.owner_name ?? ""}
                onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
              />
            </AdminField>
            <AdminField label={t("Reach", "Jangkauan")}>
              <Input
                type="number"
                value={form.reach}
                onChange={(e) => setForm({ ...form, reach: Number(e.target.value) })}
              />
            </AdminField>
            <AdminField label={t("Clicks", "Klik")}>
              <Input
                type="number"
                value={form.clicks}
                onChange={(e) => setForm({ ...form, clicks: Number(e.target.value) })}
              />
            </AdminField>
            <AdminField label={t("Leads generated", "Prospek dihasilkan")}>
              <Input
                type="number"
                value={form.leads_generated}
                onChange={(e) => setForm({ ...form, leads_generated: Number(e.target.value) })}
              />
            </AdminField>
            <div className="sm:col-span-2">
              <AdminField label={t("Content / caption", "Konten / caption")}>
                <Textarea
                  rows={4}
                  value={form.content ?? ""}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                />
              </AdminField>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("Cancel", "Batal")}
            </Button>
            <Button
              variant="navy"
              disabled={!form.name.trim() || save.isPending}
              onClick={() => save.mutate(form)}
            >
              {t("Save", "Simpan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
