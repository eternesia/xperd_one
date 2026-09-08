import { AlertTriangle, Clock, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function trialDaysLeft(trialEndsAt?: string | null) {
  if (!trialEndsAt) return null;
  const end = new Date(`${trialEndsAt.slice(0, 10)}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - Date.now()) / 86_400_000);
}

export function TrialBanner({ workspaceId }: { workspaceId?: string }) {
  const { tenant } = useApp();
  const { lang } = useI18n();

  if (!tenant || tenant.status !== "trial") return null;
  const days = trialDaysLeft(tenant.trial_ends_at);
  if (days === null) return null;

  const expired = days <= 0;
  const urgent = days <= 7;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm backdrop-blur",
        expired
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : urgent
            ? "border-gold/50 bg-gold/10 text-gold-foreground dark:text-gold"
            : "border-border bg-card/85 text-foreground",
      )}
    >
      <span className="flex items-center gap-2 font-medium">
        {expired ? <AlertTriangle className="h-4 w-4" /> : urgent ? <Clock className="h-4 w-4" /> : <Sparkles className="h-4 w-4 text-gold" />}
        {expired
          ? lang === "id"
            ? "Masa uji coba 30 hari telah berakhir. Aktifkan paket untuk melanjutkan."
            : "Your 30-day trial has ended. Activate a package to continue."
          : lang === "id"
            ? `Masa uji coba 30 hari — sisa ${days} hari lagi.`
            : `30-day trial — ${days} day${days === 1 ? "" : "s"} remaining.`}
      </span>
      {workspaceId ? (
        <Button asChild size="sm" variant="gold">
          <Link to="/app/w/$workspaceId/billing" params={{ workspaceId }}>
            {lang === "id" ? "Aktifkan Paket" : "Activate package"}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}