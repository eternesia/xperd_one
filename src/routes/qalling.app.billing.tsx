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
import { WalletPanel } from "@/components/app/WalletPanel";
import { AddonTierChoices } from "@/components/app/AddonTierChoices";
import { listTenantInvoices } from "@/lib/platform.functions";
import { useApp } from "@/lib/app-context";

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
      return (
        (rows ?? []) as {
          id: string;
          invoice_number: string;
          status: string;
          issue_date: string | null;
          total: number;
          notes: string | null;
        }[]
      ).slice(0, 50);
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
        <TabsList>
          <TabsTrigger value="saldo">Saldo & mutasi</TabsTrigger>
          <TabsTrigger value="paket">Paket</TabsTrigger>
          <TabsTrigger value="tagihan">Riwayat tagihan</TabsTrigger>
        </TabsList>
        <TabsContent value="saldo" className="mt-4">
          <WalletPanel key={tenant.id} tenantId={tenant.id} />
        </TabsContent>
        <TabsContent value="paket" className="mt-4">
          <AddonTierChoices />
        </TabsContent>
        <TabsContent value="tagihan" className="mt-4">
          <section className="rounded-xl border bg-card p-4 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
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
                  </TableRow>
                ))}
                {!invoices.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
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
