import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Plus, Send, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminField, AdminSelect, fmtIDR, todayISO, addDaysISO } from "@/components/app/admin-ui";
import { confirmInvoicePayment } from "@/lib/billing.functions";
import { adminList, adminSave } from "@/lib/platform.functions";

export const Route = createFileRoute("/app-admin/invoices")({
  component: InvoicesPage,
});

interface InvoiceForm {
  id?: string;
  invoice_number: string;
  tenant_id: string;
  status: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  notes: string;
  payment_url: string;
  auto_reminder: boolean;
}

const EMPTY: InvoiceForm = {
  invoice_number: "",
  tenant_id: "",
  status: "draft",
  issue_date: todayISO(),
  due_date: addDaysISO(14),
  subtotal: 0,
  tax_amount: 0,
  notes: "",
  payment_url: "",
  auto_reminder: true,
};

function InvoicesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<InvoiceForm>(EMPTY);

  const { data: tenants = [] } = useQuery({
    queryKey: ["admin-tenants-mini"],
    queryFn: async () => {
      const data = await adminList({ data: { table: "tenants", orderBy: "name", orderDir: "asc" } });
      return data?.rows ?? [];
    },
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["admin-packages-mini"],
    queryFn: async () => {
      const data = await adminList({ data: { table: "packages", orderBy: "name", orderDir: "asc" } });
      return data?.rows ?? [];
    },
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["admin-invoices"],
    queryFn: async () => {
      const data = await adminList({ data: { table: "invoices", orderBy: "issue_date", orderDir: "desc" } });
      return data?.rows ?? [];
    },
  });

  const tenantName = (id: string | null) => tenants.find((t) => t.id === id)?.name ?? "—";

  const dueSoon = useMemo(
    () =>
      tenants.filter((t) => {
        if (!t.ends_at) return false;
        const diff = Math.ceil((new Date(t.ends_at).getTime() - Date.now()) / 86_400_000);
        return diff >= 0 && diff <= 7;
      }),
    [tenants],
  );

  const save = useMutation({
    mutationFn: async (v: InvoiceForm) => {
      const subtotal = Number(v.subtotal) || 0;
      const tax = Number(v.tax_amount) || 0;
      const payload = {
        invoice_number: v.invoice_number.trim(),
        tenant_id: v.tenant_id,
        status: v.status as "draft",
        issue_date: v.issue_date,
        due_date: v.due_date,
        subtotal,
        tax_amount: tax,
        total: subtotal + tax,
        notes: v.notes || null,
        payment_url: v.payment_url || null,
        auto_reminder: v.auto_reminder,
      };
      await adminSave({ data: { table: "invoices", id: v.id ?? undefined, data: payload } });
    },
    onSuccess: () => {
      toast.success("Invoice saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await adminSave({
        data: {
          table: "invoices",
          id,
          data: {
            status: status as "sent",
            paid_at: status === "paid" ? new Date().toISOString() : null,
          },
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-invoices"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmPaid = useMutation({
    mutationFn: async (id: string) => confirmInvoicePayment({ data: { invoiceId: id, method: "manual_transfer" } }),
    onSuccess: () => {
      toast.success("Payment confirmed — tenant activated & period extended");
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      qc.invalidateQueries({ queryKey: ["admin-tenants-mini"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generate = useMutation({
    mutationFn: async () => {
      if (dueSoon.length === 0) throw new Error("No tenant renews within 7 days");
      const stamp = Date.now().toString().slice(-6);
      const rows = dueSoon.map((t, i) => {
        const price = Number(packages.find((p) => p.id === t.package_id)?.monthly_price ?? 0);
        const tax = Math.round(price * 0.11);
        return {
          invoice_number: `INV-${new Date().getFullYear()}-${stamp}${i + 1}`,
          tenant_id: t.id,
          status: "sent" as const,
          issue_date: todayISO(),
          due_date: t.ends_at ?? addDaysISO(7),
          subtotal: price,
          tax_amount: tax,
          total: price + tax,
          notes: "Auto-generated renewal invoice (7 days before package end).",
          auto_reminder: true,
        };
      });
      for (const row of rows) {
        await adminSave({ data: { table: "invoices", data: row as Record<string, unknown> } });
      }

      const reminders = dueSoon.map((t) => ({
        tenant_id: t.id,
        type: "renewal" as const,
        status: "scheduled" as const,
        channel: "email",
        scheduled_at: new Date().toISOString(),
        message: "Renewal invoice sent automatically 7 days before package end.",
      }));
      for (const r of reminders) {
        await adminSave({ data: { table: "reminders", data: r as Record<string, unknown> } });
      }
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} renewal invoice(s) generated & sent`);
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Issue manual invoices or auto-send renewal invoices 7 days before a package ends.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => generate.mutate()} disabled={generate.isPending}>
            <BellRing /> Auto-generate ({dueSoon.length})
          </Button>
          <Button
            variant="gold"
            onClick={() => {
              setForm({ ...EMPTY, invoice_number: `INV-${Date.now().toString().slice(-8)}` });
              setOpen(true);
            }}
          >
            <Plus /> Create invoice
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total invoices" value={String(invoices.length)} />
        <Stat label="Unpaid" value={String(invoices.filter((i) => i.status !== "paid" && i.status !== "void").length)} />
        <Stat label="Renewing in 7 days" value={String(dueSoon.length)} />
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Issued / Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">Loading…</TableCell>
                </TableRow>
              )}
              {!isLoading && invoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">No invoices yet.</TableCell>
                </TableRow>
              )}
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium text-navy">{inv.invoice_number}</TableCell>
                  <TableCell className="text-sm">{tenantName(inv.tenant_id)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {inv.issue_date} → {inv.due_date}
                  </TableCell>
                  <TableCell className="text-right text-sm">{fmtIDR(Number(inv.total))}</TableCell>
                  <TableCell>
                    <Badge variant={inv.status === "paid" ? "default" : "secondary"}>{inv.status}</Badge>
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    {inv.status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: inv.id, status: "sent" })}>
                        <Send className="h-3.5 w-3.5" /> Send
                      </Button>
                    )}
                    {inv.status !== "paid" && inv.status !== "void" && (
                      <Button
                        size="sm"
                        variant="gold"
                        disabled={confirmPaid.isPending}
                        onClick={() => confirmPaid.mutate(inv.id)}
                      >
                        <Wallet className="h-3.5 w-3.5" /> Mark paid
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create invoice</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.tenant_id) return toast.error("Select a tenant");
              save.mutate(form);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField label="Invoice number">
                <Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} required />
              </AdminField>
              <AdminField label="Tenant">
                <AdminSelect value={form.tenant_id} onChange={(v) => setForm({ ...form, tenant_id: v })}>
                  <option value="">Select tenant…</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminField label="Issue date">
                <Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
              </AdminField>
              <AdminField label="Due date">
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </AdminField>
              <AdminField label="Subtotal">
                <Input type="number" value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: Number(e.target.value) })} />
              </AdminField>
              <AdminField label="Tax amount">
                <Input type="number" value={form.tax_amount} onChange={(e) => setForm({ ...form, tax_amount: Number(e.target.value) })} />
              </AdminField>
              <AdminField label="Status">
                <AdminSelect value={form.status} onChange={(v) => setForm({ ...form, status: v })}>
                  {["draft", "sent", "paid", "overdue", "void"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminField label="Payment link (gateway)">
                <Input value={form.payment_url} onChange={(e) => setForm({ ...form, payment_url: e.target.value })} placeholder="https://…" />
              </AdminField>
            </div>
            <AdminField label="Notes">
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </AdminField>
            <div className="flex items-center gap-3">
              <Switch id="auto-reminder" checked={form.auto_reminder} onCheckedChange={(v) => setForm({ ...form, auto_reminder: v })} />
              <Label htmlFor="auto-reminder">Send automatic reminder 7 days before due date</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Total: <span className="font-semibold text-navy">{fmtIDR((Number(form.subtotal) || 0) + (Number(form.tax_amount) || 0))}</span>
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="gold" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save invoice"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-bold text-navy">{value}</CardContent>
    </Card>
  );
}