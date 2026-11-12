/** Super Admin → Studio AI: bonus kredit untuk pendaftar baru. */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { adminGetSignupBonus, adminSetSignupBonus } from "@/lib/ai-studio.functions";

export function SignupBonusAdmin({ studioOpen }: { studioOpen: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-signup-bonus"], queryFn: () => adminGetSignupBonus() });
  const [credits, setCredits] = useState(5);
  useEffect(() => {
    if (q.data) setCredits(q.data.credits);
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => adminSetSignupBonus({ data: { credits } }),
    onSuccess: () => {
      toast.success(credits > 0 ? `Pendaftar baru mendapat ${credits} kredit` : "Bonus dimatikan");
      void qc.invalidateQueries({ queryKey: ["admin-signup-bonus"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardContent className="flex flex-wrap items-end justify-between gap-4 p-4">
        <div className="max-w-xl space-y-1">
          <p className="flex items-center gap-2 font-semibold">
            <Gift className="h-4 w-4 text-gold" /> Bonus kredit pendaftar baru
          </p>
          <p className="text-sm text-muted-foreground">
            Diberikan otomatis sekali per tenant saat pendaftaran selesai, lalu diumumkan di dasbor
            Qalling (30 hari) — bisa dipakai membuat video template gratis. Isi 0 untuk mematikan.
            {q.data &&
              ` Sudah diberikan ke ${q.data.grantedTenants} tenant (${q.data.grantedCredits} kredit).`}
          </p>
          {!studioOpen && (
            <p className="text-xs text-amber-600">
              Studio belum dibuka untuk pengguna: kredit tetap masuk, tetapi pemberitahuan di dasbor
              baru tampil setelah Studio & Template aktif.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={1000}
            className="w-24"
            value={credits}
            onChange={(e) => setCredits(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          />
          <span className="text-sm text-muted-foreground">kredit</span>
          <Button onClick={() => save.mutate()} disabled={save.isPending || q.isLoading}>
            Simpan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
