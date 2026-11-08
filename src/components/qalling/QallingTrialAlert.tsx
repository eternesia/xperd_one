import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { trialDaysLeft } from "@/components/app/TrialBanner";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const KEY = "qalling_trial_alert_hidden";
const today = () => new Date().toISOString().slice(0, 10);

/** Pengingat di seluruh aplikasi Qalling: muncul 7 hari terakhir masa trial; bisa ditutup, muncul lagi besok. */
export function QallingTrialAlert() {
  const { tenant } = useApp();
  const { pick } = useI18n();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === today();
    } catch {
      return false;
    }
  });
  if (!tenant || tenant.status !== "trial") return null;
  const days = trialDaysLeft(tenant.trial_ends_at);
  if (days === null || days > 7) return null;
  const expired = days <= 0;
  if (hidden && !expired) return null;
  const hide = () => {
    try {
      localStorage.setItem(KEY, today());
    } catch {
      /* penyimpanan tidak tersedia */
    }
    setHidden(true);
  };
  return (
    <div
      role="alert"
      className={cn(
        "mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm",
        expired || days <= 3
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-gold/50 bg-gold/10 text-foreground",
      )}
    >
      <span className="flex items-center gap-2 font-medium">
        {expired ? (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        ) : (
          <Clock className="h-4 w-4 shrink-0" />
        )}
        {expired
          ? pick(
              "Your trial has ended. Choose a plan to keep scheduling posts and using your menus.",
              "Masa trial sudah berakhir. Pilih paket agar penjadwalan postingan dan menu Anda tetap berjalan.",
            )
          : days === 1
            ? pick(
                "Your trial ends today. Choose a plan so your schedules keep running.",
                "Masa trial berakhir hari ini. Pilih paket agar jadwal postingan tetap berjalan.",
              )
            : pick(
                `Your trial ends in ${days} days (${tenant.trial_ends_at?.slice(0, 10)}). Choose a plan to avoid interruption.`,
                `Masa trial tinggal ${days} hari lagi (berakhir ${tenant.trial_ends_at?.slice(0, 10)}). Pilih paket agar layanan tidak terhenti.`,
              )}
      </span>
      <span className="flex items-center gap-1">
        <Button asChild size="sm" variant="gold">
          <Link to="/qalling/app/billing" search={{ tab: "paket" }}>
            {pick("Choose plan", "Pilih paket")}
          </Link>
        </Button>
        {!expired && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label={pick("Hide until tomorrow", "Sembunyikan sampai besok")}
            onClick={hide}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </span>
    </div>
  );
}
