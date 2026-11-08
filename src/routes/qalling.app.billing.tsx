import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { NotificationPrefsCard } from "@/components/qalling/NotificationPrefsCard";
import { WalletPanel } from "@/components/app/WalletPanel";
import { AddonTierChoices } from "@/components/app/AddonTierChoices";
import { listTenantInvoices } from "@/lib/platform.functions";
import { useApp } from "@/lib/app-context";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";

type Tab = "saldo" | "paket" | "tagihan";
const TABS: Tab[] = ["saldo", "paket", "tagihan"];

export const Route = createFileRoute("/qalling/app/billing")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({
    tab: TABS.includes(s.tab as Tab) ? (s.tab as Tab) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Tagihan & Saldo — Qalling" },
      { name: "description", content: "Top up saldo, lihat mutasi, dan upgrade paket Qalling." },
      { property: "og:title", content: "Tagihan & Saldo — Qalling" },
      {
        property: "og:description",
        content: "Top up saldo, lihat mutasi, dan upgrade paket Qalling.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QallingBilling,
});

const money = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);

function QallingBilling() {
  const { tab = "saldo" } = Route.useSearch();
  const navigate = useNavigate();
  const { tenant } = useApp();
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices", "qalling", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const rows = await listTenantInvoices({ data: { tenantId: tenant!.id } });
      return ((rows ?? []) as Record<string, unknown>[]).slice(0, 50) as {
        id: string;
        invoice_number: string;
        status: string;
        issue_date: string;
        due_date: string | null;
        paid_at: string | null;
        product: string | null;
        payment_method: string | null;
        subtotal: number | null;
        tax_amount: number | null;
        total: number;
        notes: string | null;
      }[];
    },
  });
  if (!tenant) return null;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Qalling</p>
        <h1 className="text-2xl font-bold text-navy dark:text-foreground">Tagihan & Saldo</h1>
        <p className="text-sm text-muted-foreground">
          Isi saldo, lihat mutasi, dan upgrade paket langsung dari saldo.
        </p>
      </div>
      <Tabs
        value={tab}
        onValueChange={(v) =>
          navigate({ to: "/qalling/app/billing", search: { tab: v as Tab }, replace: true })
        }
      >
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-full p-1 sm:inline-flex sm:w-auto">
          <TabsTrigger value="saldo" className="rounded-full">
            Saldo
          </TabsTrigger>
          <TabsTrigger value="paket" className="rounded-full">
            Paket
          </TabsTrigger>
          <TabsTrigger value="tagihan" className="rounded-full">
            Riwayat tagihan
          </TabsTrigger>
        </TabsList>
        <TabsContent value="saldo" className="mt-4 space-y-4">
          <WalletPanel key={tenant.id} tenantId={tenant.id} />
          <NotificationPrefsCard tenantId={tenant.id} />
        </TabsContent>
        <TabsContent value="paket" className="mt-4">
          <AddonTierChoices />
        </TabsContent>
        <TabsContent value="tagihan" className="mt-4">
          <div className="space-y-2 md:hidden">
            {!invoices.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">Belum ada tagihan.</p>
            )}
            {invoices.map((i) => (
              <div key={i.id} className="rounded-2xl border bg-card p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{i.invoice_number}</p>
                    <p className="truncate text-sm font-medium">{i.notes || i.product || "—"}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {i.status}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{money(Number(i.total))}</p>
                    <p className="text-xs text-muted-foreground">{i.issue_date}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() =>
                      downloadInvoicePdf(i, { name: tenant.name }).catch(() =>
                        toast.error("Gagal membuat PDF"),
                      )
                    }
                  >
                    <Download className="h-3.5 w-3.5" /> PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <section className="rounded-xl border bg-card p-4 shadow-sm max-md:hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Bukti</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {i.invoice_number}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{i.issue_date}</TableCell>
                    <TableCell className="max-w-72 truncate">{i.notes}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{i.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{money(Number(i.total))}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          downloadInvoicePdf(i, { name: tenant.name }).catch(() =>
                            toast.error("Gagal membuat PDF"),
                          )
                        }
                      >
                        <Download className="h-3.5 w-3.5" /> PDF
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!invoices.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Belum ada tagihan.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
