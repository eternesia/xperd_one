import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getInvoicePublic } from "@/lib/lead-invoice.functions";
import { INVOICE_STATUS, downloadLeadInvoicePdf, idr } from "@/lib/lead-invoice-pdf";

export const Route = createFileRoute("/qalling/invoice/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Invoice" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: InvoicePage,
});

function InvoicePage() {
  const { token } = Route.useParams();
  const q = useQuery({
    queryKey: ["invoice-public", token],
    queryFn: () => getInvoicePublic({ data: { token } }),
  });
  const inv = q.data;
  if (q.isLoading) return <p className="p-10 text-center text-sm text-muted-foreground">Memuat…</p>;
  if (!inv)
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <p className="text-sm text-muted-foreground">Invoice tidak ditemukan.</p>
      </main>
    );
  const paid = inv.status === "paid";
  return (
    <main className="min-h-screen bg-secondary/30 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4 rounded-xl border bg-background p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {inv.seller.logoUrl && (
              <img src={inv.seller.logoUrl} alt="" className="h-12 w-12 rounded object-contain" />
            )}
            <div>
              <p className="font-semibold">{inv.seller.name}</p>
              <p className="whitespace-pre-line text-xs text-muted-foreground">
                {inv.seller.address}
              </p>
              <p className="text-xs text-muted-foreground">
                {[inv.seller.phone, inv.seller.email].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">INVOICE</p>
            <p className="text-sm text-muted-foreground">{inv.number}</p>
            <p className={`text-sm font-semibold ${paid ? "text-green-600" : "text-amber-600"}`}>
              {INVOICE_STATUS[inv.status] ?? inv.status}
            </p>
          </div>
        </div>
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Ditagihkan kepada</p>
            <p className="font-medium">{inv.customer.name}</p>
            <p className="text-muted-foreground">
              {[inv.customer.company, inv.customer.phone, inv.customer.email]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="sm:text-right">
            <p>Tanggal: {inv.issueDate}</p>
            {inv.dueDate && <p>Jatuh tempo: {inv.dueDate}</p>}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2">Deskripsi</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Harga</th>
              <th className="text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((i, n) => (
              <tr key={n} className="border-b">
                <td className="py-2">{i.description}</td>
                <td className="text-right">{i.qty}</td>
                <td className="text-right">{idr(i.price)}</td>
                <td className="text-right">{idr(i.qty * i.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto w-56 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{idr(inv.subtotal)}</span>
          </div>
          {inv.taxAmount > 0 && (
            <div className="flex justify-between">
              <span>Pajak {inv.taxRate}%</span>
              <span>{idr(inv.taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <span>Total</span>
            <span>{idr(inv.total)}</span>
          </div>
        </div>
        {inv.seller.bank && (
          <div className="rounded-md bg-secondary/50 p-3 text-sm">
            <p className="text-xs text-muted-foreground">Pembayaran</p>
            <p className="whitespace-pre-line">{inv.seller.bank}</p>
          </div>
        )}
        {inv.notes && (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{inv.notes}</p>
        )}
        <Button onClick={() => void downloadLeadInvoicePdf(inv)}>
          <Download className="mr-2 h-4 w-4" /> Unduh PDF
        </Button>
      </div>
    </main>
  );
}
