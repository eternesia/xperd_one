import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Copy, Gift, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getMyReferralCode, getReferralOverview } from "@/lib/referral.functions";
import { qallingPagePath } from "@/lib/qalling-urls";
import { useI18n } from "@/lib/i18n";

const idr = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);

/** Ajakan berbagi link referral di bawah Beranda: salin/bagikan link dan lihat komisi yang sudah didapat. */
export function ReferralHomeCard({ tenantId }: { tenantId: string }) {
  const { pick } = useI18n();
  const code = useQuery({ queryKey: ["referral-code"], queryFn: () => getMyReferralCode() });
  const overview = useQuery({
    queryKey: ["referrals", tenantId],
    queryFn: () => getReferralOverview({ data: { tenantId } }),
  });
  const s = overview.data?.settings;
  if (!code.data || !s?.enabled) return null;
  const rows = overview.data?.rows ?? [];
  const earned = rows.reduce((n, r) => n + r.commission_idr, 0);
  const link = `${window.location.origin}${qallingPagePath(window.location.hostname, "/qalling")}?ref=${code.data}`;
  const text = pick(
    `I schedule social posts and manage leads with Qalling. Try it free: ${link}`,
    `Saya pakai Qalling untuk jadwal konten & kelola prospek dari media sosial. Coba gratis: ${link}`,
  );
  const copy = () =>
    navigator.clipboard
      .writeText(link)
      .then(() => toast.success(pick("Link copied", "Link disalin")))
      .catch(() => toast.error(pick("Copy failed", "Gagal menyalin")));
  const share = async () => {
    try {
      if (typeof navigator.share === "function") return void (await navigator.share({ text }));
    } catch {
      return; // dibatalkan pengguna
    }
    copy();
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/15 via-card to-card p-4 shadow-sm sm:rounded-2xl sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold/20 text-gold">
          <Gift className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">
            {pick(`Earn ${s.percent}% commission`, `Dapat komisi ${s.percent}%`)}
          </p>
          <p className="text-sm text-muted-foreground">
            {pick(
              `Share your link. When a friend signs up and buys a paid plan (e.g. Pro), you get ${s.percent}% of it (max ${idr(s.max_idr)}) in your balance.`,
              `Bagikan link Anda. Saat teman daftar lalu membeli paket berbayar (mis. Pro), Anda dapat ${s.percent}% (maks ${idr(s.max_idr)}) langsung ke saldo.`,
            )}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-2xl border bg-background px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs sm:text-sm">{link}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={pick("Copy link", "Salin link")}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
        >
          <Copy className="size-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="gold" className="rounded-full" onClick={share}>
          <Share2 /> {pick("Share", "Bagikan")}
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/qalling/app/referral">
            {pick("Details", "Detail")} <ChevronRight />
          </Link>
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {rows.length} {pick("friends joined", "teman bergabung")} ·{" "}
        {pick("commission earned", "komisi didapat")} {idr(earned)}
      </p>
    </section>
  );
}
