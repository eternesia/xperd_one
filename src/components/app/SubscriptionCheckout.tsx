import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  checkoutSubscriptionItem,
  quoteSubscriptionItem,
  type BillingQuote,
} from "@/lib/addon-catalog.functions";
import { useApp } from "@/lib/app-context";

const money = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);

export function SubscriptionCheckout({
  tenantId,
  kind,
  itemId,
  quantity = 1,
  label,
}: {
  tenantId: string;
  kind: "tier" | "option";
  itemId: string;
  quantity?: number;
  label: string;
}) {
  const qc = useQueryClient();
  const { refreshEntitlements } = useApp();
  const [quote, setQuote] = useState<BillingQuote | null>(null);
  const [key, setKey] = useState("");
  const preview = useMutation({
    mutationFn: () => quoteSubscriptionItem({ data: { tenantId, kind, itemId, quantity } }),
    onSuccess: (q) => {
      setKey(crypto.randomUUID());
      setQuote(q);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const buy = useMutation({
    mutationFn: async () => {
      if (!quote) throw new Error("Rincian belum tersedia");
      return checkoutSubscriptionItem({
        data: { tenantId, kind, itemId, quantity, idempotencyKey: key, quote: { ...quote } },
      });
    },
    onSuccess: (r) => {
      setQuote(null);
      toast.success(
        r.action === "scheduled" ? "Perubahan dijadwalkan di akhir periode" : "Langganan aktif",
      );
      void qc.invalidateQueries();
      void refreshEntitlements();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <Button
        variant="outline"
        className="mt-4"
        disabled={preview.isPending}
        onClick={() => preview.mutate()}
      >
        {preview.isPending ? <Loader2 className="animate-spin" /> : <CreditCard />}
        {label}
      </Button>
      <Dialog
        open={Boolean(quote)}
        onOpenChange={(v) => {
          if (!v && !buy.isPending) setQuote(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{quote?.name}</DialogTitle>
          </DialogHeader>
          {quote && (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <dt>Harga bulanan</dt>
                <dd className="text-right">{money(quote.monthly_price)}</dd>
                <dt>Periode berakhir</dt>
                <dd className="text-right">{quote.period_end}</dd>
                <dt>Sisa periode</dt>
                <dd className="text-right">
                  {quote.remaining_days} / {quote.total_days} hari
                </dd>
                <dt className="font-semibold">Dipotong sekarang</dt>
                <dd className="text-right font-semibold" data-testid="checkout-charge">
                  {money(quote.charge)}
                </dd>
              </dl>
              {quote.action === "scheduled" && (
                <p className="text-sm text-muted-foreground">
                  Berlaku di akhir periode, tanpa pengembalian saldo.
                </p>
              )}
              {quote.usage_warning && (
                <p className="text-sm text-destructive">
                  Pemakaian melebihi batas tujuan; perubahan tidak diterapkan jika masih melebihi
                  batas saat perpanjangan.
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" disabled={buy.isPending} onClick={() => setQuote(null)}>
                  Batal
                </Button>
                <Button
                  variant="gold"
                  disabled={buy.isPending || quote.action === "unchanged"}
                  onClick={() => buy.mutate()}
                >
                  {buy.isPending && <Loader2 className="animate-spin" />}
                  {quote.action === "scheduled" ? "Jadwalkan perubahan" : "Konfirmasi dari saldo"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
