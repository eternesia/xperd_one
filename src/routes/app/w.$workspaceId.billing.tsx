import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, CreditCard, Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { listPaymentMethods, startInvoiceCheckout } from "@/lib/billing.functions";
import {
  createUpgradeRequest,
  getTenantSubscription,
  listPublicPackages,
  listTenantInvoices,
  listTenantUpgradeRequests,
} from "@/lib/platform.functions";
import { useAddonCatalog, useTenantAddons } from "@/lib/addons";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/procurement";

export const Route = createFileRoute("/app/w/$workspaceId/billing")({
  component: BillingPage,
});

function BillingPage() {
  const { workspaceId } = Route.useParams();
  const { tenant, pkg } = useApp();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const money = (v: number) => formatMoney(v, lang);
  const tenantId = tenant?.id;
  const { data: addonCatalog = [] } = useAddonCatalog();
  const { activeCodes } = useTenantAddons();

  const [target, setTarget] = useState("");
  const [notes, setNotes] = useState("");
  const [payInvoice, setPayInvoice] = useState<{ id: string; number: string; total: number } | null>(null);
  const [manual, setManual] = useState<{ displayName: string; instructions: string; reference: string } | null>(null);

  const { data: methods = [] } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => listPaymentMethods(),
  });

  const checkout = useMutation({
    mutationFn: async (gatewayId: string) => {
      if (!payInvoice) throw new Error("No invoice selected");
      return startInvoiceCheckout({ data: { invoiceId: payInvoice.id, gatewayId } });
    },
    onSuccess: (res) => {
      if (res.kind === "redirect") {
        setPayInvoice(null);
        window.location.href = res.url;
        return;
      }
      setManual({ displayName: res.displayName, instructions: res.instructions, reference: res.reference });
      setPayInvoice(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: subscription } = useQuery({
    queryKey: ["subscription", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      return getTenantSubscription({ data: { tenantId: tenantId! } });
    },
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const rows = await listTenantInvoices({ data: { tenantId: tenantId! } });
      return (rows ?? []) as any[];
    },
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["packages-public"],
    queryFn: async () => {
      const rows = await listPublicPackages({ data: {} });
      return (rows ?? []) as any[];
    },
  });

  const { data: requests = [] } = useQuery({
    queryKey: ["upgrade-requests", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const rows = await listTenantUpgradeRequests({ data: { tenantId: tenantId! } });
      return (rows ?? []) as any[];
    },
  });

  const requestUpgrade = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Tenant not found");
      if (!target) throw new Error(t("Choose a package first.", "Pilih paket terlebih dahulu."));
      await createUpgradeRequest({
        data: { tenantId, workspaceId, requestedPackageId: target, notes: notes || null },
      });
    },
    onSuccess: () => {
      toast.success(t("Upgrade request sent to our team.", "Permintaan upgrade terkirim ke tim kami."));
      setNotes("");
      qc.invalidateQueries({ queryKey: ["upgrade-requests", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unpaid = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + Number(i.total || 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 lg:py-12">
      <Link
        to="/app/w/$workspaceId"
        params={{ workspaceId }}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-gold"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> {t("All modules", "Semua modul")}
      </Link>

      <h1 className="mt-3 text-2xl font-semibold text-navy dark:text-primary-foreground">
        {t("Billing & Package", "Tagihan & Paket")}
      </h1>
      <p className="text-sm text-muted-foreground">
        {t("Monthly subscription, invoices and package upgrade.", "Langganan bulanan, tagihan, dan upgrade paket.")}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("Current package", "Paket saat ini")}</CardDescription>
            <CardTitle className="text-lg">{pkg?.name ?? "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {pkg?.max_workspace ?? "∞"} {t("workspace", "workspace")} · {pkg?.max_users ?? "∞"} {t("users", "pengguna")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("Monthly fee", "Biaya bulanan")}</CardDescription>
            <CardTitle className="text-lg">{money(Number(subscription?.unit_price ?? pkg?.monthly_price ?? 0))}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {subscription
              ? `${subscription.current_period_start} → ${subscription.current_period_end}`
              : t("No active subscription", "Belum ada langganan aktif")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("Outstanding", "Belum dibayar")}</CardDescription>
            <CardTitle className="text-lg text-gold">{money(unpaid)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {invoices.length} {t("invoices", "tagihan")}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t("Invoices", "Tagihan")}</CardTitle>
          <CardDescription>{t("Subscription billing history.", "Riwayat tagihan langganan.")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Number", "Nomor")}</TableHead>
                <TableHead>{t("Issued", "Terbit")}</TableHead>
                <TableHead>{t("Due", "Jatuh tempo")}</TableHead>
                <TableHead className="text-right">{t("Total", "Total")}</TableHead>
                <TableHead>{t("Status", "Status")}</TableHead>
                <TableHead className="text-right">{t("Action", "Aksi")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {t("No invoice yet.", "Belum ada tagihan.")}
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>{inv.issue_date}</TableCell>
                    <TableCell>{inv.due_date}</TableCell>
                    <TableCell className="text-right">{money(Number(inv.total))}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "paid" ? "default" : "secondary"}>{inv.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {inv.status !== "paid" && inv.status !== "void" && (
                        <Button
                          size="sm"
                          variant="gold"
                          onClick={() =>
                            setPayInvoice({ id: inv.id, number: inv.invoice_number, total: Number(inv.total) })
                          }
                        >
                          <CreditCard className="h-3.5 w-3.5" /> {t("Pay", "Bayar")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t("Upgrade package", "Upgrade paket")}</CardTitle>
          <CardDescription>
            {t(
              "Request more workspaces or users. Our team will confirm and issue the new invoice.",
              "Ajukan tambahan workspace atau pengguna. Tim kami akan mengonfirmasi dan menerbitkan tagihan baru.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("Target package", "Paket tujuan")}</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger>
                  <SelectValue placeholder={t("Choose package", "Pilih paket")} />
                </SelectTrigger>
                <SelectContent>
                  {packages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {money(Number(p.monthly_price ?? 0))}/bln
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("Notes", "Catatan")}</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <Button variant="navy" onClick={() => requestUpgrade.mutate()} disabled={requestUpgrade.isPending}>
            {requestUpgrade.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {t("Request upgrade", "Ajukan upgrade")}
          </Button>

          {requests.length > 0 && (
            <div className="space-y-2 pt-2">
              {requests.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
                >
                  <span>{packages.find((p) => p.id === r.requested_package_id)?.name ?? "—"}</span>
                  <Badge variant="secondary">{r.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t("Add-on modules", "Modul add-on")}</CardTitle>
          <CardDescription>
            {t(
              "Optional modules billed on top of your package. Contact our team to activate.",
              "Modul opsional yang ditagih terpisah dari paket. Hubungi tim kami untuk mengaktifkan.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {addonCatalog
            .filter((a) => a.is_active)
            .map((a) => {
              const on = activeCodes.includes(a.code);
              return (
                <div key={a.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-navy dark:text-primary-foreground">{a.name}</p>
                    <Badge variant={on ? "secondary" : "outline"}>
                      {on ? t("Active", "Aktif") : t("Not active", "Belum aktif")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{a.tagline ?? a.description}</p>
                  <p className="mt-2 text-sm font-medium">
                    {money(Number(a.monthly_price))}/{a.pricing_unit === "employee" ? t("employee/mo", "karyawan/bln") : t("mo", "bln")}
                  </p>
                </div>
              );
            })}
          {addonCatalog.filter((a) => a.is_active).length === 0 && (
            <p className="text-sm text-muted-foreground">{t("No add-on available yet.", "Belum ada add-on tersedia.")}</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!payInvoice} onOpenChange={(o) => !o && setPayInvoice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("Pay invoice", "Bayar tagihan")} {payInvoice?.number}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("Amount due", "Jumlah tagihan")}: <span className="font-semibold text-navy dark:text-primary-foreground">{money(payInvoice?.total ?? 0)}</span>
          </p>
          <div className="space-y-2">
            {methods.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("No payment method is active yet. Please contact our team.", "Belum ada metode pembayaran aktif. Silakan hubungi tim kami.")}
              </p>
            )}
            {methods.map((m) => (
              <Button
                key={m.id}
                variant="outline"
                className="w-full justify-between"
                disabled={checkout.isPending}
                onClick={() => checkout.mutate(m.id)}
              >
                <span>{m.display_name}</span>
                {checkout.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!manual} onOpenChange={(o) => !o && setManual(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{manual?.displayName}</DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {manual?.instructions || t("Transfer instructions will be sent by our team.", "Instruksi transfer akan dikirim tim kami.")}
          </p>
          <p className="text-sm">
            {t("Payment reference", "Referensi pembayaran")}: <span className="font-medium">{manual?.reference}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              "Your package activates automatically once our team confirms the transfer.",
              "Paket aktif otomatis setelah tim kami mengonfirmasi transfer.",
            )}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}