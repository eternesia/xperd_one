import { qallingPagePath } from "@/lib/qalling-urls";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy, Download, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyReferralCode, getReferralOverview, getReferralPromo } from "@/lib/referral.functions";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { fmtIDR } from "@/components/app/admin-ui";

export const Route = createFileRoute("/qalling/app/referral")({
  head: () => ({
    meta: [
      { title: "Referral — Qalling" },
      { name: "description", content: "Ajak teman ke Qalling dan dapatkan komisi saldo." },
      { property: "og:title", content: "Referral — Qalling" },
      { property: "og:description", content: "Ajak teman ke Qalling dan dapatkan komisi saldo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReferralPage,
});

function ReferralPage() {
  const { tenant } = useApp();
  const { pick } = useI18n();
  const code = useQuery({ queryKey: ["referral-code"], queryFn: () => getMyReferralCode() });
  const overview = useQuery({
    queryKey: ["referrals", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: () => getReferralOverview({ data: { tenantId: tenant!.id } }),
  });
  const settings = { data: overview.data?.settings ?? null };
  const list = { data: overview.data?.rows ?? [] };
  const link =
    code.data && typeof window !== "undefined"
      ? `${window.location.origin}${qallingPagePath(window.location.hostname, "/qalling")}?ref=${code.data}`
      : "";
  const promo = useQuery({ queryKey: ["referral-promo"], queryFn: () => getReferralPromo() });
  const fill = (t: string) => t.replaceAll("{link}", link).replaceAll("{code}", code.data ?? "");
  const copyText = (t: string) => {
    void navigator.clipboard.writeText(t);
    toast.success(pick("Copied", "Tersalin"));
  };
  const share = async (text: string, posterUrl: string | null) => {
    try {
      if (posterUrl && typeof navigator.canShare === "function") {
        const blob = await (await fetch(posterUrl)).blob();
        const file = new File([blob], "poster-qalling", { type: blob.type });
        if (navigator.canShare({ files: [file] }))
          return void (await navigator.share({ text, files: [file] }));
      }
      if (typeof navigator.share === "function") return void (await navigator.share({ text }));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    copyText(text);
  };
  const rows = list.data ?? [];
  const earned = rows.reduce((s, r) => s + Number(r.commission_idr), 0);
  const s = settings.data;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Referral</h1>
        <p className="text-sm text-muted-foreground">
          {s
            ? pick(
                `Earn ${s.percent}% (max ${fmtIDR(Number(s.max_idr))}) of a friend's first paid plan purchase (e.g. Pro) of at least ${fmtIDR(Number(s.min_topup_idr))}, credited to your balance.`,
                `Dapatkan ${s.percent}% (maks ${fmtIDR(Number(s.max_idr))}) dari pembelian paket berbayar pertama teman (mis. Pro) minimal ${fmtIDR(Number(s.min_topup_idr))}, langsung masuk saldo.`,
              )
            : "…"}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{pick("Your link", "Link Anda")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 text-sm">
            {link || "…"}
          </code>
          <Button
            variant="outline"
            size="sm"
            disabled={!link}
            onClick={() => {
              void navigator.clipboard.writeText(link);
              toast.success(pick("Copied", "Tersalin"));
            }}
          >
            <Copy />
            {pick("Copy", "Salin")}
          </Button>
        </CardContent>
      </Card>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 max-sm:[&_.pt-5]:px-3 max-sm:[&_.pt-5]:pt-3 max-sm:[&_.text-2xl]:text-lg">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">{pick("Sign-ups", "Pendaftar")}</p>
            <p className="text-2xl font-semibold">{rows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">{pick("Rewarded", "Berhasil")}</p>
            <p className="text-2xl font-semibold">
              {rows.filter((r) => r.status === "rewarded").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">{pick("Commission", "Komisi")}</p>
            <p className="text-2xl font-semibold">{fmtIDR(earned)}</p>
          </CardContent>
        </Card>
      </div>
      {promo.data?.enabled && link && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            {pick("Ready-to-share promo kit", "Materi Promosi Siap Share")}
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{pick("Social media", "Media Sosial")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {promo.data.poster_url && (
                  <img
                    src={promo.data.poster_url}
                    alt="Poster"
                    className="w-full rounded-md bg-muted object-contain"
                  />
                )}
                <p className="whitespace-pre-line text-sm">{fill(promo.data.social)}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyText(fill(promo.data.social))}
                  >
                    <Copy />
                    {pick("Copy caption", "Salin caption")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void share(fill(promo.data.social), promo.data.poster_url)}
                  >
                    <Share2 />
                    {pick("Share", "Bagikan")}
                  </Button>
                  {promo.data.poster_url && (
                    <Button asChild variant="outline" size="sm">
                      <a href={promo.data.poster_url} download="poster-qalling">
                        <Download />
                        {pick("Download poster", "Unduh poster")}
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">WhatsApp</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="whitespace-pre-line text-sm">{fill(promo.data.whatsapp)}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyText(fill(promo.data.whatsapp))}
                  >
                    <Copy />
                    {pick("Copy caption", "Salin caption")}
                  </Button>
                  <Button asChild size="sm">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(fill(promo.data.whatsapp))}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle />
                      WhatsApp
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{pick("History", "Riwayat")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {rows.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              {pick("No referrals yet.", "Belum ada referral.")}
            </p>
          )}
          {rows.map((r) => (
            <div key={r.referred_tenant_id} className="flex justify-between py-2 text-sm">
              <span>{new Date(r.created_at).toLocaleDateString("id-ID")}</span>
              <span>
                {r.status === "rewarded"
                  ? fmtIDR(Number(r.commission_idr))
                  : pick("Waiting for top-up", "Menunggu top-up")}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
