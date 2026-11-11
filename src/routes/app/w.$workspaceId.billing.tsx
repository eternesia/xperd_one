import { ManagerOnly } from "@/components/app/ManagerOnly";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { AddonTierChoices } from "@/components/app/AddonTierChoices";
import { WalletPanel } from "@/components/app/WalletPanel";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, CreditCard, Download, Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listPaymentMethods, startInvoiceCheckout } from "@/lib/billing.functions";
import {
  getTenantSubscription,
  listPublicPackages,
  listTenantInvoices,
} from "@/lib/platform.functions";
import {
  checkoutPackageUpgrade,
  payInvoiceFromWallet,
  quotePackageUpgrade,
  setWalletRenewal,
  type PackageQuote,
} from "@/lib/subscription.functions";
import { useAddonCatalog, useTenantAddons } from "@/lib/addons";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/procurement";

export const Route = createFileRoute("/app/w/$workspaceId/billing")({
  component: GuardedBillingPage,
});

function BillingPage() {
  const { workspaceId } = Route.useParams();
  const { tenant, pkg, workspaceRole, refresh } = useApp();
  const { lang } = useI18n();
  const qc = useQueryClient();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const money = (v: number) => formatMoney(v, lang);
  const tenantId = tenant?.id;
  const { data: addonCatalog = [] } = useAddonCatalog();
  const { activeCodes } = useTenantAddons();

  const [target, setTarget] = useState("");
  const [notes, setNotes] = useState("");
  const walletPay = useMutation({
    mutationFn: async () => {
      if (!payInvoice) throw new Error("Tagihan belum dipilih");
      return payInvoiceFromWallet({ data: { invoiceId: payInvoice.id } });
    },
    onSuccess: () => {
      setPayInvoice(null);
      void qc.invalidateQueries();
      void refresh();
      toast.success("Tagihan dibayar dari saldo");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const renewal = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!tenantId) throw new Error("Tenant belum tersedia");
      return setWalletRenewal({ data: { tenantId, enabled } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription", tenantId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const [payInvoice, setPayInvoice] = useState<{
    id: string;
    number: string;
    total: number;
  } | null>(null);
  const [manual, setManual] = useState<{
    displayName: string;
    instructions: string;
    reference: string;
  } | null>(null);

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
      setManual({
        displayName: res.displayName,
        instructions: res.instructions,
        reference: res.reference,
      });
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

  const [pkgQuote, setPkgQuote] = useState<PackageQuote | null>(null);
  const [idem, setIdem] = useState("");
  const quote = useMutation({
    mutationFn: async (packageId: string) => {
      if (!tenantId) throw new Error("Tenant belum tersedia");
      return quotePackageUpgrade({ data: { tenantId, packageId } });
    },
    onSuccess: (q) => {
      setIdem(crypto.randomUUID());
      setPkgQuote(q);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const buyPkg = useMutation({
    mutationFn: async () => {
      if (!tenantId || !pkgQuote) throw new Error("Ringkasan belum tersedia");
      return checkoutPackageUpgrade({
        data: {
          tenantId,
          packageId: pkgQuote.package,
          idempotencyKey: idem,
          expectedCharge: pkgQuote.charge,
        },
      });
    },
    onSuccess: () => {
      setPkgQuote(null);
      void qc.invalidateQueries();
      void refresh();
      toast.success(t("Package active.", "Paket sudah aktif."));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unpaid = invoices
    .filter((i) => i.status !== "paid")
    .reduce((s, i) => s + Number(i.total || 0), 0);

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
        {t(
          "Monthly subscription, invoices and package upgrade.",
          "Langganan bulanan, tagihan, dan upgrade paket.",
        )}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("Current package", "Paket saat ini")}</CardDescription>
            <CardTitle className="text-lg">{pkg?.name ?? "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {pkg?.max_workspace ?? "∞"} {t("workspace", "workspace")} · {pkg?.max_users ?? "∞"}{" "}
            {t("users", "pengguna")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("Monthly fee", "Biaya bulanan")}</CardDescription>
            <CardTitle className="text-lg">
              {money(Number(subscription?.unit_price ?? pkg?.monthly_price ?? 0))}
            </CardTitle>
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

      {subscription && workspaceRole === "owner" && (
        <Card className="mt-4">
          <CardContent className="flex items-center justify-between gap-4 py-4 text-sm">
            <span>{t("Auto-renew from balance", "Perpanjang otomatis dari saldo")}</span>
            <Switch
              aria-label="Perpanjang otomatis dari saldo"
              checked={Boolean(
                (subscription as { wallet_auto_renew?: number | boolean }).wallet_auto_renew,
              )}
              disabled={renewal.isPending}
              onCheckedChange={(v) => renewal.mutate(v)}
            />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="wallet" className="mt-6">
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="wallet">{t("Balance", "Saldo")}</TabsTrigger>
          <TabsTrigger value="invoices">{t("Invoices", "Tagihan")}</TabsTrigger>
          <TabsTrigger value="package">{t("Package", "Paket")}</TabsTrigger>
          <TabsTrigger value="addons">{t("Add-ons", "Add-on")}</TabsTrigger>
          <TabsTrigger value="qalling">Qalling</TabsTrigger>
        </TabsList>
        <TabsContent value="wallet" className="mt-0">
          {tenantId && <WalletPanel key={tenantId} tenantId={tenantId} />}
        </TabsContent>
        <TabsContent value="invoices" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("Invoices", "Tagihan")}</CardTitle>
              <CardDescription>
                {t("Subscription billing history.", "Riwayat tagihan langganan.")}
              </CardDescription>
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
                      <TableCell
                        colSpan={6}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
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
                          <Badge variant={inv.status === "paid" ? "default" : "secondary"}>
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="space-x-2 whitespace-nowrap text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={t("Download PDF", "Unduh PDF")}
                            onClick={() =>
                              downloadInvoicePdf(inv as never, { name: tenant?.name || "-" }, "XPERD").catch(() =>
                                toast.error(t("Failed to create PDF", "Gagal membuat PDF")),
                              )
                            }
                          >
                            <Download className="h-3.5 w-3.5" /> PDF
                          </Button>
                          {inv.status !== "paid" && inv.status !== "void" && (
                            <Button
                              size="sm"
                              variant="gold"
                              onClick={() =>
                                setPayInvoice({
                                  id: inv.id,
                                  number: inv.invoice_number,
                                  total: Number(inv.total),
                                })
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
        </TabsContent>
        <TabsContent value="package" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("Change package", "Ganti paket")}</CardTitle>
              <CardDescription>
                {t(
                  "Pick a package. The cost is deducted from your balance right away.",
                  "Pilih paket. Biaya langsung dipotong dari saldo, tanpa menunggu persetujuan.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {packages.map((p) => {
                const current = p.id === pkg?.id;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm"
                  >
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {money(Number(p.monthly_price ?? 0))}/bln · {p.max_workspace ?? "∞"}{" "}
                        workspace · {p.max_users ?? "∞"} {t("users", "pengguna")}
                      </div>
                    </div>
                    {current ? (
                      <Badge variant="secondary">{t("Current", "Aktif")}</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="navy"
                        disabled={quote.isPending}
                        onClick={() => quote.mutate(p.id)}
                      >
                        {quote.isPending && quote.variables === p.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Rocket className="h-4 w-4" />
                        )}
                        {t("Choose", "Pilih")}
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Dialog open={!!pkgQuote} onOpenChange={(o) => !o && setPkgQuote(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("Package summary", "Ringkasan paket")}</DialogTitle>
              </DialogHeader>
              {pkgQuote && (
                <div className="space-y-2 text-sm">
                  <Row
                    label={t("New package", "Paket baru")}
                    value={`${pkgQuote.name} · ${money(pkgQuote.monthly_price)}/bln`}
                  />
                  {pkgQuote.action === "upgrade" && (
                    <Row
                      label={t("Current package price", "Harga paket sekarang")}
                      value={money(pkgQuote.old_price)}
                    />
                  )}
                  <Row
                    label={t("Period", "Periode")}
                    value={`${pkgQuote.period_start} → ${pkgQuote.period_end}`}
                  />
                  {pkgQuote.action === "upgrade" && (
                    <Row
                      label={t("Remaining days", "Sisa hari")}
                      value={`${pkgQuote.remaining_days} / ${pkgQuote.total_days}`}
                    />
                  )}
                  <Row
                    label={t("Deducted now", "Dipotong sekarang")}
                    value={money(pkgQuote.charge)}
                    strong
                  />
                  <Row label={t("Balance", "Saldo")} value={money(pkgQuote.balance)} />
                  <Row
                    label={t("Balance after", "Sisa saldo")}
                    value={money(pkgQuote.balance - pkgQuote.charge)}
                  />
                  {pkgQuote.action === "upgrade" && (
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "You only pay the price difference for the remaining days.",
                        "Anda hanya membayar selisih harga untuk sisa hari periode ini.",
                      )}
                    </p>
                  )}
                  {pkgQuote.balance < pkgQuote.charge ? (
                    <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                      {t(
                        "Balance is not enough. Please top up first in the Balance tab.",
                        "Saldo tidak cukup. Silakan top-up dulu di tab Saldo.",
                      )}
                    </p>
                  ) : (
                    <Button
                      className="w-full"
                      variant="navy"
                      disabled={buyPkg.isPending}
                      onClick={() => buyPkg.mutate()}
                    >
                      {buyPkg.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      {t("Confirm & pay from balance", "Konfirmasi & bayar dari saldo")}
                    </Button>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>
        <TabsContent value="addons" className="mt-0">
          <Card>
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
                        <p className="font-semibold text-navy dark:text-primary-foreground">
                          {a.name}
                        </p>
                        <Badge variant={on ? "secondary" : "outline"}>
                          {on ? t("Active", "Aktif") : t("Not active", "Belum aktif")}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {a.tagline ?? a.description}
                      </p>
                      <p className="mt-2 text-sm font-medium">
                        {money(Number(a.monthly_price))}/
                        {a.pricing_unit === "employee"
                          ? t("employee/mo", "karyawan/bln")
                          : t("mo", "bln")}
                      </p>
                    </div>
                  );
                })}
              {addonCatalog.filter((a) => a.is_active).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("No add-on available yet.", "Belum ada add-on tersedia.")}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="qalling" className="mt-0">
          <AddonTierChoices />
        </TabsContent>
      </Tabs>

      <Dialog open={!!payInvoice} onOpenChange={(o) => !o && setPayInvoice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("Pay invoice", "Bayar tagihan")} {payInvoice?.number}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("Amount due", "Jumlah tagihan")}:{" "}
            <span className="font-semibold text-navy dark:text-primary-foreground">
              {money(payInvoice?.total ?? 0)}
            </span>
          </p>
          <div className="space-y-2">
            {workspaceRole === "owner" && (
              <Button
                variant="gold"
                className="w-full"
                disabled={walletPay.isPending}
                onClick={() => walletPay.mutate()}
              >
                <CreditCard />
                Bayar dari saldo
              </Button>
            )}
            {methods.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t(
                  "No payment method is active yet. Please contact our team.",
                  "Belum ada metode pembayaran aktif. Silakan hubungi tim kami.",
                )}
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
                {checkout.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
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
            {manual?.instructions ||
              t(
                "Transfer instructions will be sent by our team.",
                "Instruksi transfer akan dikirim tim kami.",
              )}
          </p>
          <p className="text-sm">
            {t("Payment reference", "Referensi pembayaran")}:{" "}
            <span className="font-medium">{manual?.reference}</span>
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold text-navy dark:text-primary-foreground" : ""}>
        {value}
      </span>
    </div>
  );
}

function GuardedBillingPage() {
  const { workspaceId } = Route.useParams();
  return (
    <ManagerOnly workspaceId={workspaceId}>
      <BillingPage />
    </ManagerOnly>
  );
}
