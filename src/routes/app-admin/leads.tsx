import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CalendarClock, Loader2, Mail, MessageCircle, Phone, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  type AdminLead,
  LEAD_STATUSES,
  adminDeleteLead,
  adminListLeads,
  adminUpdateLead,
} from "@/lib/admin-leads.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app-admin/leads")({
  head: () => ({ meta: [{ title: "Prospek | XPERD Admin" }] }),
  component: LeadsAdmin,
});

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "Baru", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  contacted: { label: "Dihubungi", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  qualified: {
    label: "Berkualifikasi",
    cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
  won: { label: "Deal", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  lost: { label: "Batal", cls: "bg-muted text-muted-foreground" },
  spam: { label: "Spam", cls: "bg-red-500/15 text-red-700 dark:text-red-300" },
};

const fmt = (iso: string | null) =>
  iso
    ? new Date(`${iso.replace(" ", "T")}${iso.length > 10 ? "Z" : "T00:00:00Z"}`).toLocaleString(
        "id-ID",
        {
          dateStyle: "medium",
          ...(iso.length > 10 ? { timeStyle: "short" as const } : {}),
        },
      )
    : "—";

/** Nomor WhatsApp internasional: 08xx → 628xx, 8xx → 628xx. */
function waNumber(phone: string | null) {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) return `62${d.slice(1)}`;
  if (d.startsWith("8")) return `62${d}`;
  return d;
}

const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-muted" };
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", s.cls)}>
      {s.label}
    </span>
  );
}

function LeadsAdmin() {
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState<AdminLead | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setTerm(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const list = useQuery({
    queryKey: ["admin-leads", status, term],
    queryFn: () => adminListLeads({ data: { status, q: term } }),
  });
  const counts = list.data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const tabs: [string, string, number][] = [
    ["all", "Semua", total],
    ["new", "Baru", counts.new ?? 0],
    ["followup", "Jadwal follow-up", list.data?.followupDue ?? 0],
    ...LEAD_STATUSES.filter((s) => s !== "new").map(
      (s) => [s, STATUS[s].label, counts[s] ?? 0] as [string, string, number],
    ),
  ];
  const rows = list.data?.rows ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Prospek</h1>
        <p className="text-sm text-muted-foreground">
          Permintaan demo/konsultasi dari form{" "}
          <a href="/contact" target="_blank" rel="noreferrer" className="underline">
            xperd.id/contact
          </a>
          . Hubungi, catat hasilnya, dan jadwalkan follow-up berikutnya.
        </p>
      </div>

      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 md:mx-0 md:flex-wrap md:px-0">
        {tabs.map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatus(key)}
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm",
              status === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            <span
              className={cn(
                "ml-1.5 text-xs",
                status === key ? "opacity-80" : "text-muted-foreground",
              )}
            >
              {n}
            </span>
          </button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari perusahaan, nama, email, telepon…"
          className="pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card max-md:border-0 max-md:bg-transparent">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Perusahaan</TableHead>
              <TableHead>Kontak</TableHead>
              <TableHead>Produk</TableHead>
              <TableHead>Masuk</TableHead>
              <TableHead>Follow-up</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            )}
            {!list.isLoading && !rows.length && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Belum ada prospek di sini.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const late =
                r.next_follow_up &&
                r.next_follow_up <= today() &&
                !["won", "lost", "spam"].includes(r.status);
              return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                  <TableCell className="font-medium">
                    {r.company_name}
                    {r.industry && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {r.industry}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.contact_name}
                    <span className="block text-xs text-muted-foreground">{r.email}</span>
                  </TableCell>
                  <TableCell className="capitalize">{r.interested_product}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmt(r.created_at)}</TableCell>
                  <TableCell
                    className={cn(
                      "whitespace-nowrap text-sm",
                      late && "font-medium text-destructive",
                    )}
                  >
                    {r.next_follow_up ? fmt(r.next_follow_up) : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setOpen(r)}>
                      Detail
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <LeadDialog lead={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function LeadDialog({ lead, onClose }: { lead: AdminLead | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState("new");
  const [notes, setNotes] = useState("");
  const [next, setNext] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    if (!lead) return;
    setStatus(lead.status);
    setNotes(lead.notes ?? "");
    setNext(lead.next_follow_up ?? "");
    setConfirmDel(false);
  }, [lead]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-leads"] });
    qc.invalidateQueries({ queryKey: ["admin-leads-badge"] });
  };
  const save = useMutation({
    mutationFn: (extra?: { markContacted?: boolean }) =>
      adminUpdateLead({
        data: {
          id: lead!.id,
          status,
          notes: notes || null,
          next_follow_up: next || null,
          ...extra,
        },
      }),
    onSuccess: () => {
      refresh();
      toast.success("Prospek diperbarui");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const del = useMutation({
    mutationFn: () => adminDeleteLead({ data: { id: lead!.id } }),
    onSuccess: () => {
      refresh();
      toast.success("Prospek dihapus");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const contactedNow = () =>
    adminUpdateLead({ data: { id: lead!.id, markContacted: true } }).then(() => {
      if (status === "new") setStatus("contacted");
      refresh();
    });

  const wa = waNumber(lead?.phone ?? null);
  const greet = lead
    ? `Halo ${lead.contact_name}, terima kasih telah menghubungi XPERD One terkait kebutuhan ${lead.company_name}. `
    : "";

  return (
    <Dialog open={Boolean(lead)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        {lead && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {lead.company_name} <StatusBadge status={lead.status} />
              </DialogTitle>
              <DialogDescription>
                Masuk {fmt(lead.created_at)} · {lead.source ?? "website"}
                {lead.last_contacted_at && ` · terakhir dihubungi ${fmt(lead.last_contacted_at)}`}
                {lead.handled_by_email && ` oleh ${lead.handled_by_email}`}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {(
                [
                  ["Nama", lead.contact_name],
                  ["Jabatan", lead.job_title],
                  ["Email", lead.email],
                  ["Telepon", lead.phone],
                  ["Industri", lead.industry],
                  ["Jumlah karyawan", lead.employee_range],
                  ["Produk", lead.interested_product === "enterprise" ? "Enterprise" : "Business"],
                ] as [string, string | null][]
              ).map(([k, v]) => (
                <div
                  key={k}
                  className="flex justify-between gap-3 border-b border-border py-1.5 sm:block sm:border-0 sm:py-0"
                >
                  <span className="text-muted-foreground">{k}</span>
                  <span className="break-all text-right font-medium sm:block sm:text-left">
                    {v || "—"}
                  </span>
                </div>
              ))}
            </div>
            {lead.message && (
              <div className="rounded-xl bg-muted/50 p-3 text-sm">
                <p className="mb-1 text-xs text-muted-foreground">Pesan</p>
                <p className="whitespace-pre-wrap break-words">{lead.message}</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <Button asChild variant="outline" disabled={!wa} onClick={contactedNow}>
                <a
                  href={wa ? `https://wa.me/${wa}?text=${encodeURIComponent(greet)}` : undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!wa}
                  className={cn(!wa && "pointer-events-none opacity-50")}
                >
                  <MessageCircle /> WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline" onClick={contactedNow}>
                <a
                  href={`mailto:${lead.email}?subject=${encodeURIComponent(`XPERD One untuk ${lead.company_name}`)}&body=${encodeURIComponent(greet)}`}
                >
                  <Mail /> Email
                </a>
              </Button>
              <Button asChild variant="outline" disabled={!lead.phone} onClick={contactedNow}>
                <a
                  href={lead.phone ? `tel:${lead.phone}` : undefined}
                  className={cn(!lead.phone && "pointer-events-none opacity-50")}
                >
                  <Phone /> Telepon
                </a>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS[s].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" /> Follow-up berikutnya
                </Label>
                <Input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Catatan tindak lanjut</Label>
              <Textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Hasil telepon/meeting, kebutuhan, anggaran, keputusan…"
              />
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={del.isPending}
                onClick={() => (confirmDel ? del.mutate() : setConfirmDel(true))}
              >
                <Trash2 /> {confirmDel ? "Yakin hapus?" : "Hapus"}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  Tutup
                </Button>
                <Button
                  variant="navy"
                  disabled={save.isPending}
                  onClick={() => save.mutate(undefined)}
                >
                  {save.isPending && <Loader2 className="animate-spin" />}
                  Simpan
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
