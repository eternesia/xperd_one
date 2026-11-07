import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Receipt,
  CheckCircle2,
  MessageSquare,
  Phone,
  StickyNote,
  Users,
  Flag,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  completeLeadTask,
  getLeadDetail,
  logLeadActivity,
  snoozeLeadFollowUp,
} from "@/lib/lead-followup.functions";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/app-context";
import { qallingPagePath } from "@/lib/qalling-urls";
import {
  createLeadInvoice,
  listLeadInvoices,
  markLeadInvoiceSent,
  sendLeadInvoiceWhatsApp,
  setLeadInvoiceStatus,
} from "@/lib/lead-invoice.functions";

const TYPES = ["note", "call", "message", "meeting", "task"] as const;
const ICON: Record<string, typeof StickyNote> = {
  note: StickyNote,
  call: Phone,
  message: MessageSquare,
  meeting: Users,
  task: Flag,
};
const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
const when = (v: string) =>
  new Date(`${v.replace(" ", "T")}Z`).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
const plusDays = (n: number) =>
  new Date(Date.now() + 7 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);

type Row = { description: string; qty: string; price: string };

function InvoiceSection({
  workspaceId,
  leadId,
  leadName,
  leadPhone,
  leadValue,
}: {
  workspaceId: string;
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  leadValue: number;
}) {
  const { pick } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([
    { description: "", qty: "1", price: leadValue ? String(Math.round(leadValue)) : "" },
  ]);
  const [tax, setTax] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const key = ["lead-invoices", workspaceId, leadId];
  const list = useQuery({
    queryKey: key,
    queryFn: () => listLeadInvoices({ data: { workspaceId, leadId } }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const total = rows.reduce((t, r) => t + (Number(r.qty) || 0) * (Number(r.price) || 0), 0);
  const create = useMutation({
    mutationFn: () =>
      createLeadInvoice({
        data: {
          workspaceId,
          leadId,
          dueDate: dueDate || null,
          taxRate: Number(tax) || 0,
          notes: notes.trim() || null,
          items: rows
            .filter((r) => r.description.trim())
            .map((r) => ({
              description: r.description.trim(),
              qty: Number(r.qty) || 0,
              price: Number(r.price) || 0,
            })),
        },
      }),
    onSuccess: () => {
      toast.success(pick("Invoice created", "Invoice dibuat"));
      setOpen(false);
      setRows([{ description: "", qty: "1", price: "" }]);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const status = useMutation({
    mutationFn: (v: { id: string; s: "unpaid" | "paid" | "cancelled" }) =>
      setLeadInvoiceStatus({ data: { workspaceId, invoiceId: v.id, status: v.s } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const link = (token: string) =>
    `${window.location.origin}${qallingPagePath(window.location.hostname, `/qalling/invoice/${token}`)}`;
  const sendOfficial = useMutation({
    mutationFn: (inv: { id: string; token: string }) =>
      sendLeadInvoiceWhatsApp({ data: { workspaceId, invoiceId: inv.id, link: link(inv.token) } }),
    onSuccess: () => {
      toast.success(pick("Invoice sent via WhatsApp", "Invoice terkirim lewat WhatsApp"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sendWa = (inv: NonNullable<typeof list.data>[number]) => {
    const digits = (leadPhone ?? inv.phone ?? "").replace(/\D/g, "");
    const phone = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
    const text = pick(
      `Hello ${leadName}, here is your invoice ${inv.number} (${idr(inv.total)}): ${link(inv.token)}`,
      `Halo ${leadName}, berikut invoice ${inv.number} sebesar ${idr(inv.total)}: ${link(inv.token)}`,
    );
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    void markLeadInvoiceSent({ data: { workspaceId, invoiceId: inv.id } }).then(refresh);
  };
  const set = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-medium">
          <Receipt className="h-4 w-4" /> Invoice
        </p>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? pick("Cancel", "Batal") : pick("Create invoice", "Buat invoice")}
        </Button>
      </div>
      {open && (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_56px_110px] gap-1">
              <Input
                value={r.description}
                onChange={(e) => set(i, { description: e.target.value })}
                placeholder={pick("Item", "Item")}
                maxLength={300}
              />
              <Input
                value={r.qty}
                onChange={(e) => set(i, { qty: e.target.value })}
                inputMode="decimal"
                aria-label="Qty"
              />
              <Input
                value={r.price}
                onChange={(e) => set(i, { price: e.target.value })}
                inputMode="numeric"
                placeholder={pick("Price", "Harga")}
              />
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRows((r) => [...r, { description: "", qty: "1", price: "" }])}
          >
            + {pick("Add item", "Tambah item")}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground">{pick("Tax %", "Pajak %")}</label>
            <Input
              className="w-16"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              inputMode="decimal"
            />
            <label className="text-xs text-muted-foreground">{pick("Due", "Jatuh tempo")}</label>
            <Input
              type="date"
              className="w-auto"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={pick("Notes (optional)", "Catatan (opsional)")}
            maxLength={2000}
          />
          <div className="flex items-center justify-between">
            <span className="font-semibold">
              Total: {idr(total * (1 + (Number(tax) || 0) / 100))}
            </span>
            <Button
              disabled={create.isPending || total <= 0 || !rows.some((r) => r.description.trim())}
              onClick={() => create.mutate()}
            >
              {pick("Save invoice", "Simpan invoice")}
            </Button>
          </div>
        </div>
      )}
      {list.data?.map((inv) => (
        <div key={inv.id} className="rounded-md bg-secondary/40 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{inv.number}</span>
            <span>{idr(inv.total)}</span>
            <Badge
              variant={
                inv.status === "paid" ? "secondary" : inv.overdue ? "destructive" : "outline"
              }
            >
              {inv.status === "paid"
                ? pick("Paid", "Lunas")
                : inv.status === "cancelled"
                  ? pick("Cancelled", "Batal")
                  : inv.overdue
                    ? pick("Overdue", "Jatuh tempo")
                    : pick("Unpaid", "Belum bayar")}
            </Badge>
            {inv.sentAt && (
              <span className="text-xs text-muted-foreground">{pick("sent", "terkirim")}</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Button
              size="sm"
              disabled={sendOfficial.isPending}
              onClick={() => sendOfficial.mutate(inv)}
            >
              {pick("Send via gateway", "Kirim via gateway")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => sendWa(inv)}>
              WhatsApp
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(link(inv.token));
                toast.success(pick("Link copied", "Link disalin"));
              }}
            >
              {pick("Copy link", "Salin link")}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={link(inv.token)} target="_blank" rel="noreferrer">
                PDF
              </a>
            </Button>
            {inv.status === "unpaid" && (
              <Button size="sm" onClick={() => status.mutate({ id: inv.id, s: "paid" })}>
                {pick("Mark paid", "Tandai lunas")}
              </Button>
            )}
            {inv.status === "paid" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => status.mutate({ id: inv.id, s: "unpaid" })}
              >
                {pick("Undo paid", "Batalkan lunas")}
              </Button>
            )}
            {inv.status === "unpaid" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => status.mutate({ id: inv.id, s: "cancelled" })}
              >
                {pick("Cancel", "Batalkan")}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LeadPanel({
  workspaceId,
  leadId,
  onClose,
}: {
  workspaceId: string;
  leadId: string | null;
  onClose: () => void;
}) {
  const { pick } = useI18n();
  const { entitlements } = useApp();
  const canInvoice = entitlements.qalling?.features?.lead_invoice === true;
  const qc = useQueryClient();
  const [type, setType] = useState<(typeof TYPES)[number]>("note");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");
  const key = ["lead-detail", workspaceId, leadId];
  const q = useQuery({
    queryKey: key,
    enabled: Boolean(leadId),
    queryFn: () => getLeadDetail({ data: { workspaceId, leadId: leadId! } }),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["lead-health", workspaceId] });
    qc.invalidateQueries({ queryKey: ["crm-leads", workspaceId] });
    qc.invalidateQueries({ queryKey: ["crm-activities", workspaceId] });
  };
  const add = useMutation({
    mutationFn: () =>
      logLeadActivity({
        data: {
          workspaceId,
          leadId: leadId!,
          type,
          subject: subject.trim(),
          body: body.trim() || null,
          dueAt: due || null,
        },
      }),
    onSuccess: () => {
      setSubject("");
      setBody("");
      setDue("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const done = useMutation({
    mutationFn: (activityId: string) => completeLeadTask({ data: { workspaceId, activityId } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const snooze = useMutation({
    mutationFn: (date: string | null) =>
      snoozeLeadFollowUp({ data: { workspaceId, leadId: leadId!, date } }),
    onSuccess: () => {
      toast.success(pick("Follow-up updated", "Follow-up diperbarui"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const d = q.data;
  return (
    <Sheet open={Boolean(leadId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{d?.lead.name ?? pick("Lead", "Prospek")}</SheetTitle>
        </SheetHeader>
        {q.isLoading && (
          <p className="mt-4 text-sm text-muted-foreground">{pick("Loading…", "Memuat…")}</p>
        )}
        {q.error && <p className="mt-4 text-sm text-destructive">{(q.error as Error).message}</p>}
        {d && (
          <div className="mt-4 space-y-5 text-sm">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{d.lead.stage}</Badge>
                <span className="font-semibold">{idr(d.lead.value)}</span>
                <span className="text-muted-foreground">{d.lead.code}</span>
              </div>
              <p className="text-muted-foreground">
                {[d.lead.company, d.lead.phone, d.lead.email].filter(Boolean).join(" · ") || "—"}
              </p>
              <p className="text-muted-foreground">
                {pick("Owner", "Penanggung jawab")}: {d.lead.owner ?? "—"}
              </p>
              {(d.lead.sourcePost || d.lead.sourceCampaign) && (
                <p className="text-muted-foreground">
                  {pick("Content source", "Konten sumber")}:{" "}
                  {d.lead.sourcePost ?? d.lead.sourceCampaign}
                </p>
              )}
              {d.lead.notes && <p className="rounded-md bg-secondary/50 p-2">{d.lead.notes}</p>}
            </div>

            <div className="rounded-lg border p-3">
              <p className="flex items-center gap-2 font-medium">
                <CalendarClock className="h-4 w-4" />{" "}
                {pick("Next follow-up", "Follow-up berikutnya")}:{" "}
                {d.lead.nextFollowUp ?? pick("not set", "belum diatur")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[1, 3, 7].map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant="outline"
                    onClick={() => snooze.mutate(plusDays(n))}
                  >
                    {pick(`In ${n} days`, `${n} hari lagi`)}
                  </Button>
                ))}
                {d.lead.nextFollowUp && (
                  <Button size="sm" variant="ghost" onClick={() => snooze.mutate(null)}>
                    {pick("Clear", "Hapus")}
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <p className="font-medium">
                {pick("Log activity or add task", "Catat aktivitas atau tambah tugas")}
              </p>
              <div className="flex flex-wrap gap-1">
                {TYPES.map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={type === t ? "default" : "outline"}
                    onClick={() => setType(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={pick("Subject", "Judul")}
                maxLength={255}
              />
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={pick("Details (optional)", "Detail (opsional)")}
                rows={2}
                maxLength={5000}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="datetime-local"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className="w-auto"
                  aria-label={pick("Due", "Tenggat")}
                />
                <span className="text-xs text-muted-foreground">
                  {pick(
                    "Set a due time to make it a task.",
                    "Isi tenggat untuk menjadikannya tugas.",
                  )}
                </span>
              </div>
              <Button disabled={!subject.trim() || add.isPending} onClick={() => add.mutate()}>
                {pick("Save", "Simpan")}
              </Button>
            </div>

            <div>
              <p className="mb-2 font-medium">{pick("Timeline", "Linimasa")}</p>
              <ol className="space-y-3 border-l pl-4">
                {d.timeline.map((it, i) => {
                  const Icon =
                    it.kind === "activity"
                      ? (ICON[it.title.split(":")[0]] ?? StickyNote)
                      : it.kind === "message"
                        ? MessageSquare
                        : CheckCircle2;
                  return (
                    <li key={`${it.at}-${i}`} className="relative">
                      <Icon className="absolute -left-[26px] top-0.5 h-4 w-4 rounded-full bg-background text-muted-foreground" />
                      <p className={it.done ? "text-muted-foreground line-through" : "font-medium"}>
                        {it.title}
                      </p>
                      {it.body && <p className="text-muted-foreground">{it.body}</p>}
                      <p className="text-xs text-muted-foreground">
                        {when(it.at)}
                        {it.dueAt ? ` · ${pick("due", "tenggat")} ${when(it.dueAt)}` : ""}
                      </p>
                      {it.kind === "activity" && it.dueAt && !it.done && it.activityId && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1"
                          onClick={() => done.mutate(it.activityId!)}
                        >
                          {pick("Mark done", "Tandai selesai")}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
