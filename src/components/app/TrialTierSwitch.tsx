import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { switchTrialTier, type TrialTierQuote } from "@/lib/trial-tier.functions";

export function TrialTierSwitch({
  tenantId,
  tierId,
  expectedTierId,
  name,
  current,
}: {
  tenantId: string;
  tierId: string;
  expectedTierId: string | null;
  name: string;
  current: boolean;
}) {
  const qc = useQueryClient();
  const request = useServerFn(switchTrialTier);
  const [quote, setQuote] = useState<TrialTierQuote | null>(null);
  const preview = useMutation({
    mutationFn: () => request({ data: { tenantId, tierId, expectedTierId, apply: false } }),
    onSuccess: setQuote,
    onError: (e: Error) => toast.error(e.message),
  });
  const apply = useMutation({
    mutationFn: () => request({ data: { tenantId, tierId, expectedTierId, apply: true } }),
    onSuccess: async () => {
      setQuote(null);
      toast.success(`Trial ${name} aktif, tanpa pemotongan saldo`);
      await qc.invalidateQueries();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      void qc.invalidateQueries({ queryKey: ["qalling-trial-tier", tenantId] });
    },
  });
  return (
    <>
      <Button
        variant="outline"
        className="mt-4"
        disabled={current || preview.isPending}
        onClick={() => preview.mutate()}
      >
        {preview.isPending ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
        {current ? "Paket trial saat ini" : `Coba ${name}`}
      </Button>
      <Dialog
        open={Boolean(quote)}
        onOpenChange={(open) => {
          if (!open && !apply.isPending) setQuote(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Coba {quote?.name}</DialogTitle>
          </DialogHeader>
          {quote && (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <dt>Status</dt>
                <dd className="text-right">Uji coba</dd>
                <dt>Trial berakhir</dt>
                <dd className="text-right">{quote.ends_at}</dd>
                <dt className="font-semibold">Dipotong sekarang</dt>
                <dd className="text-right font-semibold">Rp0</dd>
              </dl>
              <p className="text-sm text-muted-foreground">
                Tanggal berakhir trial tetap sama. Tidak mengaktifkan langganan berbayar atau
                perpanjangan otomatis.
              </p>
              <DialogFooter>
                <Button variant="outline" disabled={apply.isPending} onClick={() => setQuote(null)}>
                  Batal
                </Button>
                <Button disabled={apply.isPending} onClick={() => apply.mutate()}>
                  {apply.isPending && <Loader2 className="animate-spin" />}Konfirmasi coba paket
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
