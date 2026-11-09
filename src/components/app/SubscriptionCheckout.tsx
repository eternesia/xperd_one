import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, QrCode } from "lucide-react";
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
import { createWalletTopup, getWallet } from "@/lib/wallet.functions";
import { walletReturnPath } from "@/lib/wallet/return-url";

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
  const wallet = useQuery({
    queryKey: ["wallet-pay", tenantId],
    enabled: Boolean(quote),
    queryFn: () => getWallet({ data: { tenantId, page: 0 } }),
  });
  const balance = wallet.data?.balance ?? 0;
  const methods = (wallet.data?.methods ?? []).filter(
    (m) => m.provider !== "manual_transfer" && m.available,
  );
  const [method, setMethod] = useState("");
  const short =
    quote && quote.action === "purchase" && kind === "tier"
      ? Math.max(0, quote.charge - balance)
      : 0;
  const payAmount = Math.min(
    Math.max(short, wallet.data?.settings.min_topup_idr ?? 0),
    wallet.data?.settings.max_topup_idr ?? Number.MAX_SAFE_INTEGER,
  );
  const pay = useMutation({
    mutationFn: async () => {
      let returnPath: string | undefined;
      try {
        returnPath = walletReturnPath(window.location.pathname);
      } catch {
        returnPath = undefined;
      }
      return createWalletTopup({
        data: {
          tenantId,
          amount: payAmount,
          gatewayId: method || methods[0]!.id,
          idempotencyKey: key,
          note: `Pembayaran ${quote?.name ?? "paket"}`,
          returnPath,
          purchase: { kind: "tier", itemId },
        },
      });
    },
    onSuccess: (r) => {
      if (r.url) window.location.href = r.url;
      else toast.error("Tautan pembayaran belum tersedia. Coba lagi.");
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
              {short > 0 && (
                <div className="space-y-3 rounded-2xl border bg-muted/40 p-3 text-sm">
                  <p>
                    Saldo Anda {money(balance)}. Bayar langsung{" "}
                    <span className="font-semibold">{money(payAmount)}</span>, paket aktif otomatis
                    begitu pembayaran terkonfirmasi.
                    {payAmount > short && (
                      <span className="text-muted-foreground">
                        {" "}
                        Kelebihan {money(payAmount - short)} masuk ke saldo.
                      </span>
                    )}
                  </p>
                  {methods.length > 1 && (
                    <div className="grid grid-cols-2 gap-2">
                      {methods.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMethod(m.id)}
                          className={
                            "rounded-xl border px-3 py-2 text-left text-sm " +
                            ((method || methods[0]!.id) === m.id
                              ? "border-primary bg-primary/10 font-medium"
                              : "bg-background")
                          }
                        >
                          {m.display_name}
                        </button>
                      ))}
                    </div>
                  )}
                  {wallet.isSuccess && methods.length === 0 && (
                    <p className="text-destructive">
                      Pembayaran QRIS/kartu belum diaktifkan admin. Isi saldo lewat menu Tagihan.
                    </p>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" disabled={buy.isPending} onClick={() => setQuote(null)}>
                  Batal
                </Button>
                {short > 0 ? (
                  <Button
                    variant="gold"
                    disabled={pay.isPending || methods.length === 0}
                    onClick={() => pay.mutate()}
                  >
                    {pay.isPending ? <Loader2 className="animate-spin" /> : <QrCode />}
                    Bayar {money(payAmount)} (QRIS / kartu)
                  </Button>
                ) : (
                  <Button
                    variant="gold"
                    disabled={buy.isPending || quote.action === "unchanged"}
                    onClick={() => buy.mutate()}
                  >
                    {buy.isPending && <Loader2 className="animate-spin" />}
                    {quote.action === "scheduled" ? "Jadwalkan perubahan" : "Konfirmasi dari saldo"}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
