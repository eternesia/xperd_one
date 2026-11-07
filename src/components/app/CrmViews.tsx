import { SocialContactsPanel } from "@/components/app/CrmSocialContacts";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  MessageCircle,
  Check,
  Construction,
  FileOutput,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRound,
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
import { BroadcastView, CampaignView, WaGatewayView } from "@/components/app/CrmOutreach";
import { CrmDashboardView, CrmTargetsView, CrmTemplatesView } from "@/components/app/CrmInsights";
// #50 (BS New 3): checklist dokumen tender.
import { TenderView } from "@/components/app/CrmTender";
// #54–56 (BS New 3): akun media sosial & penjadwal postingan.
import { PostSchedulerView, SocialAccountsView } from "@/components/app/CrmSocial";
import { SocialInsightsView } from "@/components/app/SocialInsights";
// #51 (BS New 3): pustaka dokumen tender.
import { DocLibraryView } from "@/components/app/CrmDocLibrary";
import { MediaLibraryView } from "@/components/app/CrmMedia";
import { CrmIdeasView } from "@/components/app/CrmIdeas";
import { CrmInboxView } from "@/components/app/CrmInbox";
import { CrmCommentsView, CrmAutomationsView } from "@/components/app/CrmInteractions";
import {
  deleteWorkspaceRow,
  listWorkspaceRows,
  saveWorkspaceRow,
  upsertWorkspaceRows,
} from "@/lib/data.functions";
import { sqlDateTime } from "@/lib/datetime";
import { QuickInvoice } from "@/components/app/QuickReplies";
import { CalendarPage } from "@/components/qalling/pages/CalendarPage";
import { ClientsPage } from "@/components/qalling/pages/ClientsPage";
import { LeadPanel } from "@/components/app/CrmLeadPanel";
import { getLeadHealth } from "@/lib/lead-followup.functions";
import { AttributionPage } from "@/components/qalling/pages/AttributionPage";
import { AgencyPage } from "@/components/qalling/pages/AgencyPage";
import { ReportsPage } from "@/components/qalling/pages/ReportsPage";
import { TeamPage } from "@/components/app/TeamPage";
import { AiPage } from "@/components/qalling/pages/AiPage";
import { useI18n } from "@/lib/i18n";
import {
  CRM_ACTIVITY_TYPES,
  CRM_SOURCES,
  CRM_STAGES,
  nextLeadCode,
  stageLabel,
  waLink,
} from "@/lib/crm";
import {
  convertLeadToQuotation,
  listWorkspaceOwners,
  type WorkspaceOwner,
} from "@/lib/crm.functions";

interface LeadRow {
  id: string;
  code: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  stage: string;
  status: string;
  estimated_value: number;
  probability: number;
  owner_name: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  lost_reason: string | null;
  stage_changed_at: string | null;
  quotation_id: string | null;
  source_post_id?: string | null;
  source_campaign_id?: string | null;
}

interface ActivityRow {
  id: string;
  lead_id: string | null;
  activity_type: string;
  subject: string;
  body: string | null;
  due_at: string | null;
  done_at: string | null;
  owner_name: string | null;
}

type LeadForm = Omit<LeadRow, "id"> & { id?: string };

const EMPTY_LEAD: LeadForm = {
  code: "",
  name: "",
  company_name: "",
  email: "",
  phone: "",
  source: "website",
  stage: "new",
  status: "open",
  estimated_value: 0,
  probability: 10,
  owner_name: "",
  next_follow_up_at: "",
  notes: "",
  lost_reason: "",
  stage_changed_at: null,
  quotation_id: null,
  source_post_id: null,
  source_campaign_id: null,
};

function useLeads(workspaceId: string) {
  return useQuery({
    queryKey: ["crm-leads", workspaceId],
    queryFn: async () => {
      const data = (await listWorkspaceRows({
        data: {
          table: "crm_leads",
          workspaceId,
          orderBy: "created_at",
          orderDir: "desc",
          limit: 500,
        },
      })) as { rows: Record<string, unknown>[] };
      return (data.rows ?? []).map((row) => {
        return {
          ...row,
          estimated_value: Number(row.estimated_value) || 0,
          probability: Number(row.probability) || 0,
        } as unknown as LeadRow;
      });
    },
  });
}

function useContentSources(workspaceId: string) {
  return useQuery({
    queryKey: ["lead-content-sources", workspaceId],
    queryFn: async () => {
      const list = async (table: string, orderBy: string) =>
        (
          (await listWorkspaceRows({
            data: { table, workspaceId, orderBy, orderDir: "desc", limit: 100 },
          })) as {
            rows: Record<string, unknown>[];
          }
        ).rows ?? [];
      const [posts, campaigns] = await Promise.all([
        list("crm_scheduled_posts", "scheduled_at"),
        list("crm_campaigns", "created_at"),
      ]);
      return {
        posts: posts
          .filter((p) => ["published", "scheduled"].includes(String(p.status)))
          .map((p) => ({ id: String(p.id), title: String(p.title ?? "") })),
        campaigns: campaigns.map((c) => ({ id: String(c.id), title: String(c.name ?? "") })),
      };
    },
  });
}

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

export function CrmView({
  submoduleId,
  workspaceId,
}: {
  submoduleId: string;
  workspaceId: string;
}) {
  if (submoduleId === "dashboard") return <CrmDashboardView workspaceId={workspaceId} />;
  if (submoduleId === "calendar") return <CalendarPage />;
  if (submoduleId === "clients") return <ClientsPage />;
  if (submoduleId === "reports") return <ReportsPage />;
  if (submoduleId === "agency") return <AgencyPage />;
  if (submoduleId === "attribution") return <AttributionPage />;
  if (submoduleId === "ai") return <AiPage />;
  if (submoduleId === "team") return <TeamPage embedded />;
  if (submoduleId === "leads") return <LeadsView workspaceId={workspaceId} />;
  if (submoduleId === "pipeline") return <PipelineView workspaceId={workspaceId} />;
  if (submoduleId === "contacts") return <ContactsHub workspaceId={workspaceId} />;
  if (submoduleId === "follow-ups") return <FollowUpView workspaceId={workspaceId} />;
  if (submoduleId === "broadcast") return <BroadcastView workspaceId={workspaceId} />;
  if (submoduleId === "wa-gateway") return <WaGatewayView workspaceId={workspaceId} />;
  if (submoduleId === "campaigns") return <CampaignView workspaceId={workspaceId} />;
  if (submoduleId === "targets") return <CrmTargetsView workspaceId={workspaceId} />;
  if (submoduleId === "templates") return <CrmTemplatesView workspaceId={workspaceId} />;
  // #50 (BS New 3): checklist dokumen tender.
  if (submoduleId === "tenders") return <TenderView workspaceId={workspaceId} />;
  // #54–56 (BS New 3): akun media sosial, penjadwal postingan, dasbor sosial.
  if (submoduleId === "social-accounts") return <SocialAccountsView workspaceId={workspaceId} />;
  if (submoduleId === "post-scheduler") return <PostSchedulerView workspaceId={workspaceId} />;
  if (submoduleId === "social-dashboard") return <SocialInsightsView workspaceId={workspaceId} />;
  // #51 (BS New 3): pustaka dokumen tender.
  if (submoduleId === "media") return <MediaLibraryView workspaceId={workspaceId} />;
  if (submoduleId === "inbox") return <CrmInboxView workspaceId={workspaceId} />;
  if (submoduleId === "comments") return <CrmCommentsView workspaceId={workspaceId} />;
  if (submoduleId === "automations") return <CrmAutomationsView workspaceId={workspaceId} />;
  if (submoduleId === "ideas") return <CrmIdeasView workspaceId={workspaceId} />;
  if (submoduleId === "doc-library") return <DocLibraryView workspaceId={workspaceId} />;
  return <ComingSoon submoduleId={submoduleId} />;
}

function LeadsView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useLeads(workspaceId);
  const sources = useContentSources(workspaceId);
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LeadForm>(EMPTY_LEAD);
  const convert = useServerFn(convertLeadToQuotation);
  const listOwners = useServerFn(listWorkspaceOwners);
  const [converting, setConverting] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [importing, setImporting] = useState(false);

  // #17 (BS New): owner dipilih dari anggota workspace.
  const { data: owners = [] } = useQuery({
    queryKey: ["crm-owners", workspaceId],
    queryFn: async () => {
      const result = await listOwners({ data: { workspaceId } });
      return (result ?? []) as WorkspaceOwner[];
    },
  });
  // #16: pemilik default + filter "prospek saya" memakai pengguna yang login.
  const me = owners.find((o) => o.isCurrentUser)?.name ?? null;

  const filtered = useMemo(() => {
    let list = rows;
    if (mineOnly && me) list = list.filter((r) => (r.owner_name ?? "") === me);
    const q = term.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      [r.code, r.name, r.company_name, r.email, r.phone, r.owner_name].some((v) =>
        (v ?? "").toLowerCase().includes(q),
      ),
    );
  }, [rows, term, mineOnly, me]);
  const pager = usePagination(filtered);

  /** #18 (BS New): buat quotation dari lead langsung dari baris tabel. */
  async function convertLead(id: string) {
    setConverting(id);
    try {
      const res = await convert({ data: { workspaceId, leadId: id } });
      toast.success(
        lang === "id" ? `Penawaran ${res.docNumber} dibuat` : `Quotation ${res.docNumber} created`,
      );
      qc.invalidateQueries({ queryKey: ["crm-leads", workspaceId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Convert failed");
    } finally {
      setConverting(null);
    }
  }

  /** #15 (BS New): import prospek dari Excel/CSV, lewati duplikat email/no. HP. */
  async function handleImport(file: File) {
    setImporting(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!);
      const seenEmail = new Set(rows.map((r) => (r.email ?? "").toLowerCase()).filter(Boolean));
      const seenPhone = new Set(
        rows.map((r) => (r.phone ?? "").replace(/\D/g, "")).filter(Boolean),
      );
      const payload: Record<string, unknown>[] = [];
      let skipped = 0;
      parsed.forEach((raw) => {
        // Alias header EN/ID supaya template apa pun bisa dipakai.
        const pick = (...keys: string[]) => {
          for (const k of keys) {
            const hit = Object.keys(raw).find((c) => c.trim().toLowerCase() === k);
            if (hit && raw[hit] != null && String(raw[hit]).trim()) return String(raw[hit]).trim();
          }
          return "";
        };
        const name = pick("name", "nama", "contact", "kontak");
        if (!name) return;
        const email = pick("email").toLowerCase();
        const phone = pick("phone", "telepon", "wa", "whatsapp");
        const digits = phone.replace(/\D/g, "");
        if ((email && seenEmail.has(email)) || (digits && seenPhone.has(digits))) {
          skipped += 1;
          return;
        }
        if (email) seenEmail.add(email);
        if (digits) seenPhone.add(digits);
        payload.push({
          code: nextLeadCode(
            rows.map((r) => r.code),
            payload.length,
          ),
          name,
          company_name: pick("company", "perusahaan") || null,
          email: email || null,
          phone: phone || null,
          source: pick("source", "sumber") || "website",
          stage: "new",
          status: "open",
          probability: 10,
          estimated_value: Number(pick("value", "nilai", "estimated_value")) || 0,
          owner_name: pick("owner", "sales") || me || null,
          notes: pick("notes", "catatan") || null,
        });
      });
      if (!payload.length) {
        toast.info(
          lang === "id"
            ? `Tidak ada baris baru (${skipped} duplikat)`
            : `No new rows (${skipped} duplicates)`,
        );
        return;
      }
      // Insert massal lewat server fn (nama kolom difilter whitelist di server).
      await upsertWorkspaceRows({ data: { table: "crm_leads", workspaceId, rows: payload } });
      toast.success(
        lang === "id"
          ? `${payload.length} prospek diimpor, ${skipped} duplikat dilewati`
          : `${payload.length} leads imported, ${skipped} duplicates skipped`,
      );
      qc.invalidateQueries({ queryKey: ["crm-leads", workspaceId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const save = useMutation({
    mutationFn: async (v: LeadForm) => {
      const payload = {
        code: v.code.trim() || nextLeadCode(rows.map((r) => r.code)),
        name: v.name.trim(),
        company_name: v.company_name || null,
        email: v.email || null,
        phone: v.phone || null,
        source: v.source || null,
        source_post_id: v.source_post_id || null,
        source_campaign_id: v.source_campaign_id || null,
        stage: v.stage,
        status: v.stage === "won" ? "won" : v.stage === "lost" ? "lost" : "open",
        estimated_value: Number(v.estimated_value) || 0,
        probability: Number(v.probability) || 0,
        owner_name: v.owner_name || null,
        next_follow_up_at: v.next_follow_up_at || null,
        notes: v.notes || null,
        lost_reason: v.stage === "lost" ? v.lost_reason || null : null,
        stage_changed_at: sqlDateTime(),
      };
      await saveWorkspaceRow({
        data: { table: "crm_leads", workspaceId, id: v.id || undefined, data: payload },
      });
    },
    onSuccess: () => {
      toast.success(lang === "id" ? "Prospek tersimpan" : "Lead saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["crm-leads", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteWorkspaceRow({ data: { table: "crm_leads", workspaceId, id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-leads", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader kicker="QALLING CRM" title={lang === "id" ? "Prospek" : "Leads"}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-56 pl-9"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={lang === "id" ? "Cari prospek…" : "Search leads…"}
          />
        </div>
        <input
          id="crm-lead-import"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void handleImport(f);
          }}
        />
        <Button
          variant="outline"
          disabled={importing}
          onClick={() => document.getElementById("crm-lead-import")?.click()}
        >
          {importing ? <Loader2 className="animate-spin" /> : <Upload />}{" "}
          {lang === "id" ? "Impor Excel" : "Import Excel"}
        </Button>
        <Button variant={mineOnly ? "navy" : "outline"} onClick={() => setMineOnly((v) => !v)}>
          <UserRound /> {lang === "id" ? "Prospek saya" : "My leads"}
        </Button>
        <Button
          variant="navy"
          onClick={() => {
            setForm({
              ...EMPTY_LEAD,
              code: nextLeadCode(rows.map((r) => r.code)),
              owner_name: me ?? "",
            });
            setOpen(true);
          }}
        >
          <Plus /> {lang === "id" ? "Tambah" : "New"}
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{lang === "id" ? "Kode" : "Code"}</TableHead>
                <TableHead>{lang === "id" ? "Nama" : "Name"}</TableHead>
                <TableHead>{lang === "id" ? "Perusahaan" : "Company"}</TableHead>
                <TableHead>{lang === "id" ? "Tahap" : "Stage"}</TableHead>
                <TableHead className="text-right">{lang === "id" ? "Nilai" : "Value"}</TableHead>
                <TableHead>{lang === "id" ? "Sales" : "Owner"}</TableHead>
                <TableHead>{lang === "id" ? "Follow up" : "Follow up"}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {lang === "id" ? "Memuat…" : "Loading…"}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {lang === "id" ? "Belum ada prospek." : "No leads yet."}
                  </TableCell>
                </TableRow>
              )}
              {pager.items.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{pager.start + i + 1}</TableCell>
                  <TableCell className="font-medium">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.company_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{stageLabel(r.stage, lang)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{fmtIDR(Number(r.estimated_value))}</TableCell>
                  <TableCell>{r.owner_name ?? "—"}</TableCell>
                  <TableCell>{r.next_follow_up_at ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {r.phone && (
                      <Button asChild size="icon" variant="ghost" title="WhatsApp">
                        <a
                          href={waLink(
                            r.phone,
                            lang === "id" ? `Halo ${r.name}, ` : `Hi ${r.name}, `,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    <QuickInvoice workspaceId={workspaceId} customer={r.name} phone={r.phone} />
                    {r.status === "open" && !r.quotation_id && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title={lang === "id" ? "Konversi ke penawaran" : "Convert to quotation"}
                        disabled={converting === r.id}
                        onClick={() => void convertLead(r.id)}
                      >
                        <FileOutput className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setForm({
                          ...r,
                          company_name: r.company_name ?? "",
                          email: r.email ?? "",
                          phone: r.phone ?? "",
                          source: r.source ?? "",
                          owner_name: r.owner_name ?? "",
                          next_follow_up_at: r.next_follow_up_at ?? "",
                          notes: r.notes ?? "",
                          lost_reason: r.lost_reason ?? "",
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
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
            <DialogTitle>
              {form.id
                ? lang === "id"
                  ? "Ubah prospek"
                  : "Edit lead"
                : lang === "id"
                  ? "Prospek baru"
                  : "New lead"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label={lang === "id" ? "Kode" : "Code"}>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </AdminField>
            <AdminField label={lang === "id" ? "Nama kontak" : "Contact name"}>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </AdminField>
            <AdminField label={lang === "id" ? "Perusahaan" : "Company"}>
              <Input
                value={form.company_name ?? ""}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              />
            </AdminField>
            <AdminField label="Email">
              <Input
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </AdminField>
            <AdminField label={lang === "id" ? "Telepon / WA" : "Phone / WA"}>
              <Input
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </AdminField>
            <AdminField label={lang === "id" ? "Sumber" : "Source"}>
              <AdminSelect
                value={form.source ?? ""}
                onChange={(v) => setForm({ ...form, source: v })}
              >
                {CRM_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField
              label={lang === "id" ? "Konten sumber (opsional)" : "Content source (optional)"}
            >
              <AdminSelect
                value={
                  form.source_post_id
                    ? `p:${form.source_post_id}`
                    : form.source_campaign_id
                      ? `c:${form.source_campaign_id}`
                      : ""
                }
                onChange={(v) =>
                  setForm({
                    ...form,
                    source_post_id: v.startsWith("p:") ? v.slice(2) : null,
                    source_campaign_id: v.startsWith("c:") ? v.slice(2) : null,
                  })
                }
              >
                <option value="">{lang === "id" ? "— tidak diketahui —" : "— unknown —"}</option>
                {(sources.data?.posts ?? []).length > 0 && (
                  <optgroup label={lang === "id" ? "Postingan" : "Posts"}>
                    {sources.data!.posts.map((p) => (
                      <option key={p.id} value={`p:${p.id}`}>
                        {p.title}
                      </option>
                    ))}
                  </optgroup>
                )}
                {(sources.data?.campaigns ?? []).length > 0 && (
                  <optgroup label={lang === "id" ? "Kampanye" : "Campaigns"}>
                    {sources.data!.campaigns.map((c) => (
                      <option key={c.id} value={`c:${c.id}`}>
                        {c.title}
                      </option>
                    ))}
                  </optgroup>
                )}
              </AdminSelect>
            </AdminField>
            <AdminField label={lang === "id" ? "Tahap" : "Stage"}>
              <AdminSelect
                value={form.stage}
                onChange={(v) => {
                  const st = CRM_STAGES.find((s) => s.id === v);
                  setForm({ ...form, stage: v, probability: st?.probability ?? form.probability });
                }}
              >
                {CRM_STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {lang === "id" ? s.id_ : s.en}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label={lang === "id" ? "Nilai estimasi" : "Estimated value"}>
              <Input
                type="number"
                value={form.estimated_value}
                onChange={(e) => setForm({ ...form, estimated_value: Number(e.target.value) })}
              />
            </AdminField>
            <AdminField label={lang === "id" ? "Sales penanggung jawab" : "Assigned sales"}>
              <AdminSelect
                value={form.owner_name ?? ""}
                onChange={(v) => setForm({ ...form, owner_name: v })}
              >
                <option value="">—</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.name}>
                    {o.name}
                  </option>
                ))}
                {form.owner_name && !owners.some((o) => o.name === form.owner_name) && (
                  <option value={form.owner_name}>{form.owner_name}</option>
                )}
              </AdminSelect>
            </AdminField>
            {form.stage === "lost" && (
              <AdminField label={lang === "id" ? "Alasan kalah" : "Lost reason"}>
                <Input
                  value={form.lost_reason ?? ""}
                  onChange={(e) => setForm({ ...form, lost_reason: e.target.value })}
                />
              </AdminField>
            )}
            <AdminField label={lang === "id" ? "Follow up berikutnya" : "Next follow up"}>
              <Input
                type="date"
                value={form.next_follow_up_at ?? ""}
                onChange={(e) => setForm({ ...form, next_follow_up_at: e.target.value })}
              />
            </AdminField>
            <div className="sm:col-span-2">
              <AdminField label={lang === "id" ? "Catatan" : "Notes"}>
                <Textarea
                  value={form.notes ?? ""}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </AdminField>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {lang === "id" ? "Batal" : "Cancel"}
            </Button>
            <Button
              variant="navy"
              disabled={
                !form.name.trim() ||
                save.isPending ||
                (form.stage === "lost" && !(form.lost_reason ?? "").trim())
              }
              onClick={() => save.mutate(form)}
            >
              {lang === "id" ? "Simpan" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PipelineView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const { data: rows = [] } = useLeads(workspaceId);
  const health = useQuery({
    queryKey: ["lead-health", workspaceId],
    queryFn: () => getLeadHealth({ data: { workspaceId } }),
    refetchInterval: 120_000,
  });
  const healthById = new Map((health.data?.items ?? []).map((h) => [h.leadId, h]));
  const [detailId, setDetailId] = useState<string | null>(null);
  const [onlyAttention, setOnlyAttention] = useState(false);
  const needsAttention = (id: string) => {
    const h = healthById.get(id);
    return !!h && (h.stale || h.followUpOverdueDays !== null || h.overdueTasks > 0);
  };
  const attentionCount = rows.filter((r) => r.status === "open" && needsAttention(r.id)).length;

  const move = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const st = CRM_STAGES.find((s) => s.id === stage);
      await saveWorkspaceRow({
        data: {
          table: "crm_leads",
          workspaceId,
          id,
          data: {
            stage,
            probability: st?.probability ?? 0,
            status: stage === "won" ? "won" : stage === "lost" ? "lost" : "open",
            stage_changed_at: sqlDateTime(),
          },
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-leads", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const STAGE_TONE: Record<string, { bar: string; bg: string; dot: string }> = {
    new: { bar: "bg-info", bg: "bg-info/10", dot: "bg-info" },
    contacted: { bar: "bg-chart-3", bg: "bg-chart-3/10", dot: "bg-chart-3" },
    qualified: { bar: "bg-chart-5", bg: "bg-chart-5/10", dot: "bg-chart-5" },
    proposal: { bar: "bg-warning", bg: "bg-warning/10", dot: "bg-warning" },
    negotiation: { bar: "bg-gold", bg: "bg-gold/15", dot: "bg-gold" },
    won: { bar: "bg-success", bg: "bg-success/10", dot: "bg-success" },
    lost: { bar: "bg-destructive", bg: "bg-destructive/10", dot: "bg-destructive" },
  };
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader kicker="QALLING CRM" title="Pipeline" />
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted-foreground">
          {lang === "id"
            ? "Seret kartu ke kolom lain untuk memindahkan tahap. Klik kartu untuk melihat detail, linimasa, dan tugas."
            : "Drag a card to another column to change its stage. Click a card for details, timeline and tasks."}
        </p>
        <Button
          size="sm"
          variant={onlyAttention ? "default" : "outline"}
          onClick={() => setOnlyAttention((v) => !v)}
        >
          {lang === "id"
            ? `Perlu tindak lanjut (${attentionCount})`
            : `Needs follow-up (${attentionCount})`}
        </Button>
      </div>
      <LeadPanel workspaceId={workspaceId} leadId={detailId} onClose={() => setDetailId(null)} />
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-4">
          {CRM_STAGES.map((stage) => {
            const tone = STAGE_TONE[stage.id] ?? STAGE_TONE.new;
            const items = rows.filter(
              (r) => r.stage === stage.id && (!onlyAttention || needsAttention(r.id)),
            );
            const total = items.reduce((a, b) => a + Number(b.estimated_value || 0), 0);
            const isOver = overStage === stage.id;
            return (
              <div
                key={stage.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverStage(stage.id);
                }}
                onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain") || dragId;
                  setOverStage(null);
                  setDragId(null);
                  const lead = rows.find((r) => r.id === id);
                  if (lead && lead.stage !== stage.id)
                    move.mutate({ id: lead.id, stage: stage.id });
                }}
                className={cn(
                  "flex w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-border transition-all",
                  tone.bg,
                  isOver && "ring-2 ring-gold",
                )}
              >
                <div className={cn("h-1.5 w-full", tone.bar)} />
                <div className="flex items-center justify-between px-4 pt-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", tone.dot)} />
                    <p className="text-sm font-semibold text-navy dark:text-foreground">
                      {lang === "id" ? stage.id_ : stage.en}
                    </p>
                  </div>
                  <Badge variant="secondary">{items.length}</Badge>
                </div>
                <p className="px-4 text-xs font-medium text-muted-foreground">
                  {fmtIDR(total)} · {stage.probability}%
                </p>
                <div className="mt-3 min-h-[60vh] flex-1 space-y-2.5 px-3 pb-3">
                  {items.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", lead.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(lead.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverStage(null);
                      }}
                      onClick={() => setDetailId(lead.id)}
                      className={cn(
                        "cursor-grab rounded-xl border border-border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing",
                        dragId === lead.id && "opacity-50",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", tone.dot)} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-navy dark:text-foreground">
                            {lead.name}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {lead.company_name ?? lead.code}
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-sm font-semibold">
                        {fmtIDR(Number(lead.estimated_value))}
                      </p>
                      {lead.status === "open" &&
                        (() => {
                          const h = healthById.get(lead.id);
                          if (!h) return null;
                          return (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {h.followUpOverdueDays !== null && (
                                <Badge variant="destructive" className="text-[10px]">
                                  {lang === "id"
                                    ? `Follow-up telat ${h.followUpOverdueDays} hr`
                                    : `Follow-up ${h.followUpOverdueDays}d late`}
                                </Badge>
                              )}
                              {h.overdueTasks > 0 && (
                                <Badge variant="destructive" className="text-[10px]">
                                  {lang === "id"
                                    ? `${h.overdueTasks} tugas telat`
                                    : `${h.overdueTasks} tasks late`}
                                </Badge>
                              )}
                              {h.stale && (
                                <Badge variant="outline" className="text-[10px]">
                                  {lang === "id" ? `Diam ${h.idleDays} hr` : `Idle ${h.idleDays}d`}
                                </Badge>
                              )}
                            </div>
                          );
                        })()}
                      <AdminSelect
                        className="mt-2 h-8 text-xs md:hidden"
                        value={lead.stage}
                        onChange={(v) => move.mutate({ id: lead.id, stage: v })}
                      >
                        {CRM_STAGES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {lang === "id" ? s.id_ : s.en}
                          </option>
                        ))}
                      </AdminSelect>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border py-8 text-center text-[11px] text-muted-foreground">
                      {lang === "id" ? "Letakkan kartu di sini" : "Drop cards here"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Kontak sosial (otomatis dari DM, bisa ditambah manual) + pelanggan ERP sebagai tab terpisah. */
function ContactsHub({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const id = lang === "id";
  const [tab, setTab] = useState<"social" | "erp">("social");
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-widest text-gold">Qalling CRM</p>
        <h1 className="text-2xl font-semibold text-navy dark:text-foreground">
          {id ? "Kontak" : "Contacts"}
        </h1>
      </div>
      <div className="flex gap-1 border-b">
        {(
          [
            ["social", id ? "Kontak" : "Contacts"],
            ["erp", id ? "Pelanggan (ERP)" : "Customers (ERP)"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "social" ? (
        <SocialContactsPanel workspaceId={workspaceId} />
      ) : (
        <ContactsView workspaceId={workspaceId} />
      )}
    </div>
  );
}

function ContactsView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const [term, setTerm] = useState("");
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["crm-contacts", workspaceId],
    queryFn: async () => {
      const data = (await listWorkspaceRows({
        data: { table: "md_customers", workspaceId, orderBy: "name", orderDir: "asc", limit: 500 },
      })) as { rows: Record<string, unknown>[] };
      return (data.rows ?? []) as unknown as {
        id: string;
        code: string;
        name: string;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
        city: string | null;
      }[];
    },
  });

  const visibleContacts = useSearchFilter(rows, term, (r) => [
    r.code,
    r.name,
    r.contact_name,
    r.email,
    r.phone,
    r.city,
  ]);
  const pager = usePagination(visibleContacts);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="QALLING CRM"
        title={lang === "id" ? "Kontak Pelanggan" : "Customer Contacts"}
      >
        <SearchInput
          value={term}
          onChange={setTerm}
          placeholder={lang === "id" ? "Cari kontak…" : "Search contacts…"}
        />
      </PageHeader>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{lang === "id" ? "Kode" : "Code"}</TableHead>
                <TableHead>{lang === "id" ? "Nama" : "Name"}</TableHead>
                <TableHead>PIC</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>{lang === "id" ? "Telepon" : "Phone"}</TableHead>
                <TableHead>{lang === "id" ? "Kota" : "City"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(isLoading || visibleContacts.length === 0) && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {isLoading
                      ? lang === "id"
                        ? "Memuat…"
                        : "Loading…"
                      : term.trim()
                        ? lang === "id"
                          ? "Tidak ada kontak yang cocok."
                          : "No contact matches your search."
                        : lang === "id"
                          ? "Belum ada pelanggan."
                          : "No customers yet."}
                  </TableCell>
                </TableRow>
              )}
              {pager.items.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{pager.start + i + 1}</TableCell>
                  <TableCell className="font-medium">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.contact_name ?? "—"}</TableCell>
                  <TableCell>{r.email ?? "—"}</TableCell>
                  <TableCell>{r.phone ?? "—"}</TableCell>
                  <TableCell>{r.city ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationBar p={pager} />
        </CardContent>
      </Card>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <UserRound className="h-3.5 w-3.5" />
        {lang === "id"
          ? "Kontak diambil dari Master Data → Pelanggan agar data tetap satu sumber."
          : "Contacts are sourced from Master Data → Customers to keep one source of truth."}
      </p>
    </div>
  );
}

function FollowUpView({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const { data: leads = [] } = useLeads(workspaceId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    lead_id: "",
    activity_type: "call",
    subject: "",
    body: "",
    due_at: "",
    owner_name: "",
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["crm-activities", workspaceId],
    queryFn: async () => {
      const data = (await listWorkspaceRows({
        data: {
          table: "crm_activities",
          workspaceId,
          orderBy: "due_at",
          orderDir: "asc",
          limit: 500,
        },
      })) as { rows: Record<string, unknown>[] };
      return (data.rows ?? []) as unknown as ActivityRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      await saveWorkspaceRow({
        data: {
          table: "crm_activities",
          workspaceId,
          data: {
            lead_id: form.lead_id || null,
            activity_type: form.activity_type,
            subject: form.subject.trim(),
            body: form.body || null,
            due_at: form.due_at ? sqlDateTime(new Date(form.due_at)) : null,
            owner_name: form.owner_name || null,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success(lang === "id" ? "Aktivitas tersimpan" : "Activity saved");
      setOpen(false);
      setForm({
        lead_id: "",
        activity_type: "call",
        subject: "",
        body: "",
        due_at: "",
        owner_name: "",
      });
      qc.invalidateQueries({ queryKey: ["crm-activities", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: async (id: string) => {
      await saveWorkspaceRow({
        data: {
          table: "crm_activities",
          workspaceId,
          id,
          data: { done_at: sqlDateTime() },
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-activities", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const leadName = (id: string | null) => leads.find((l) => l.id === id)?.name ?? "—";
  // Parity live: Follow Ups memakai kolom #, pencarian, dan paginasi.
  const [term, setTerm] = useState("");
  const shown = useSearchFilter(rows, term, (r) => [
    r.subject,
    r.activity_type,
    r.owner_name,
    leadName(r.lead_id),
  ]);
  const pager = usePagination(shown);

  return (
    <div className="space-y-6">
      <PageHeader kicker="QALLING CRM" title={lang === "id" ? "Follow Up" : "Follow Ups"}>
        <SearchInput
          value={term}
          onChange={setTerm}
          placeholder={lang === "id" ? "Cari follow up…" : "Search follow ups…"}
        />
        <Button variant="navy" onClick={() => setOpen(true)}>
          <Plus /> {lang === "id" ? "Jadwalkan" : "Schedule"}
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{lang === "id" ? "Jadwal" : "Due"}</TableHead>
                <TableHead>{lang === "id" ? "Jenis" : "Type"}</TableHead>
                <TableHead>{lang === "id" ? "Judul" : "Subject"}</TableHead>
                <TableHead>{lang === "id" ? "Prospek" : "Lead"}</TableHead>
                <TableHead>{lang === "id" ? "Sales" : "Owner"}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(isLoading || rows.length === 0) && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {isLoading
                      ? lang === "id"
                        ? "Memuat…"
                        : "Loading…"
                      : lang === "id"
                        ? "Belum ada aktivitas."
                        : "No activities yet."}
                  </TableCell>
                </TableRow>
              )}
              {pager.items.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{pager.start + i + 1}</TableCell>
                  <TableCell>{r.due_at ? new Date(r.due_at).toLocaleString() : "—"}</TableCell>
                  <TableCell className="capitalize">{r.activity_type}</TableCell>
                  <TableCell>{r.subject}</TableCell>
                  <TableCell>{leadName(r.lead_id)}</TableCell>
                  <TableCell>{r.owner_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.done_at ? "secondary" : "outline"}>
                      {r.done_at
                        ? lang === "id"
                          ? "Selesai"
                          : "Done"
                        : lang === "id"
                          ? "Terjadwal"
                          : "Open"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {!r.done_at && (
                      <Button size="icon" variant="ghost" onClick={() => complete.mutate(r.id)}>
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationBar p={pager} />
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-gold" />
              {lang === "id" ? "Jadwalkan follow up" : "Schedule follow up"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <AdminField label={lang === "id" ? "Prospek" : "Lead"}>
              <AdminSelect value={form.lead_id} onChange={(v) => setForm({ ...form, lead_id: v })}>
                <option value="">—</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} · {l.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label={lang === "id" ? "Jenis" : "Type"}>
              <AdminSelect
                value={form.activity_type}
                onChange={(v) => setForm({ ...form, activity_type: v })}
              >
                {CRM_ACTIVITY_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {lang === "id" ? t.id_ : t.en}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label={lang === "id" ? "Judul" : "Subject"}>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </AdminField>
            <AdminField label={lang === "id" ? "Jadwal" : "Due"}>
              <Input
                type="datetime-local"
                value={form.due_at}
                onChange={(e) => setForm({ ...form, due_at: e.target.value })}
              />
            </AdminField>
            <AdminField label={lang === "id" ? "Sales" : "Owner"}>
              <Input
                value={form.owner_name}
                onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
              />
            </AdminField>
            <AdminField label={lang === "id" ? "Catatan" : "Notes"}>
              <Textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </AdminField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {lang === "id" ? "Batal" : "Cancel"}
            </Button>
            <Button
              variant="navy"
              disabled={!form.subject.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              {lang === "id" ? "Simpan" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ComingSoon({ submoduleId }: { submoduleId: string }) {
  const { lang } = useI18n();
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center">
      <Construction className="h-8 w-8 text-gold" />
      <p className="mt-4 font-medium text-navy dark:text-primary-foreground">
        {lang === "id" ? "Tahap berikutnya" : "Next rollout"}
      </p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {lang === "id"
          ? `Menu ${submoduleId} sedang disiapkan dan akan tersambung lewat Tebar pada tahap berikutnya.`
          : `The ${submoduleId} menu is being prepared and will connect via Tebar in the next rollout.`}
      </p>
    </div>
  );
}
