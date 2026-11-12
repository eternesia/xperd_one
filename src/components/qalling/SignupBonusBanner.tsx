/** Dasbor Qalling: pemberitahuan bonus kredit pendaftaran (bisa ditutup). */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Gift, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSignupBonusNotice } from "@/lib/ai-studio.functions";
import { useI18n } from "@/lib/i18n";

const KEY = (ws: string) => `qalling.signupBonus.dismissed.${ws}`;

export function SignupBonusBanner({ workspaceId }: { workspaceId: string }) {
  const { pick } = useI18n();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY(workspaceId)) === "1");
    } catch {
      setHidden(false);
    }
  }, [workspaceId]);
  const { data } = useQuery({
    queryKey: ["signup-bonus", workspaceId],
    queryFn: () => getSignupBonusNotice({ data: { workspaceId } }),
    staleTime: 5 * 60_000,
  });
  if (hidden || !data) return null;
  const videos = Math.floor(data.balance / data.perVideo);
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY(workspaceId), "1");
    } catch {
      // penyimpanan tidak tersedia — cukup sembunyikan untuk sesi ini
    }
  };
  return (
    <section className="relative overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-r from-amber-50 via-white to-sky-50 p-4 shadow-sm dark:from-amber-500/10 dark:via-background dark:to-sky-500/10 sm:p-5">
      <Sparkles className="pointer-events-none absolute -right-2 -top-2 h-20 w-20 text-gold/15" />
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:bg-muted"
        aria-label={pick("Close", "Tutup")}
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex flex-wrap items-center gap-4 pr-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold/15">
          <Gift className="h-6 w-6 text-gold" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-navy dark:text-foreground">
            {pick(
              `Welcome gift: ${data.credits} free credits!`,
              `Hadiah selamat datang: ${data.credits} kredit gratis!`,
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {pick(
              `Use them to turn your product photos into promo videos for free. Balance: ${data.balance} credits`,
              `Pakai untuk mengubah foto produk menjadi video promo secara gratis. Saldo: ${data.balance} kredit`,
            )}
            {videos > 0 && pick(` (≈ ${videos} videos).`, ` (± ${videos} video).`)}
          </p>
        </div>
        <Button asChild variant="gold">
          <Link to="/qalling/app/studio">{pick("Create free video", "Buat video gratis")}</Link>
        </Button>
      </div>
    </section>
  );
}
