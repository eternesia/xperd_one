import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
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

  const [target, setTarget] = useState("");
  const [notes, setNotes] = useState("");

  const { data: subscription } = useQuery({
    queryKey: ["subscription", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["packages-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("id,code,name,monthly_price,max_users,max_workspace,product_line")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: requests = [] } = useQuery({
    queryKey: ["upgrade-requests", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("upgrade_requests")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const requestUpgrade = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Tenant not found");
      if (!target) throw new Error(t("Choose a package first.", "Pilih paket terlebih dahulu."));
      const { error } = await supabase.from("upgrade_requests").insert({
        tenant_id: tenantId,
        workspace_id: workspaceId,
        requested_package_id: target,
        notes: notes || null,
      } as never);
      if (error) throw error;
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
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
    </div>
  );
}