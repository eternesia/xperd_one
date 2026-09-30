import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarClock, CheckCircle2, HandCoins, Megaphone, Share2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/qalling/")({
  head: () => ({
    meta: [
      { title: "Qalling — CRM & Social Media Management untuk Tim Sales" },
      {
        name: "description",
        content:
          "Qalling adalah CRM modern dari XPERD: kelola prospek, pipeline, follow-up, broadcast WhatsApp, kampanye dan jadwal posting media sosial dalam satu dashboard.",
      },
      { property: "og:title", content: "Qalling — CRM & Social Media Management" },
      {
        property: "og:description",
        content:
          "Kelola prospek, pipeline, follow-up, broadcast WhatsApp, dan jadwal posting media sosial dalam satu dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QallingLanding,
});

const FEATURES = [
  {
    icon: Users,
    en: "Lead & Pipeline Management",
    id: "Manajemen Prospek & Pipeline",
    descEn: "Track every lead from first contact to won deal with a visual pipeline.",
    descId: "Lacak setiap prospek dari kontak pertama hingga deal dengan pipeline visual.",
  },
  {
    icon: Megaphone,
    en: "WhatsApp Broadcast & Gateway",
    id: "Broadcast & Gateway WhatsApp",
    descEn: "Send targeted broadcasts and automated follow-up reminders via WhatsApp.",
    descId: "Kirim broadcast tertarget dan pengingat follow-up otomatis via WhatsApp.",
  },
  {
    icon: Share2,
    en: "Social Media Accounts",
    id: "Akun Media Sosial",
    descEn: "Connect Instagram, Facebook, TikTok, X and LinkedIn — multiple accounts supported.",
    descId: "Hubungkan Instagram, Facebook, TikTok, X, dan LinkedIn — mendukung banyak akun.",
  },
  {
    icon: CalendarClock,
    en: "Post Scheduler",
    id: "Jadwal Postingan",
    descEn: "Plan a week or a month of content on a visual calendar and post on time.",
    descId: "Rencanakan konten seminggu atau sebulan di kalender visual dan posting tepat waktu.",
  },
  {
    icon: CheckCircle2,
    en: "Tender Checklist & Documents",
    id: "Checklist Tender & Dokumen",
    descEn: "Ensure tender documents are complete and compliant before submission.",
    descId: "Pastikan dokumen tender lengkap dan memenuhi syarat sebelum dikirim.",
  },
  {
    icon: HandCoins,
    en: "Quotation & Sales Targets",
    id: "Quotation & Target Sales",
    descEn: "Convert leads to quotations and monitor your team's sales targets.",
    descId: "Ubah prospek menjadi quotation dan pantau target penjualan tim.",
  },
];

function QallingLanding() {
  const { pick } = useI18n();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="container-x flex h-16 items-center justify-between">
          <Link to="/qalling" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold text-lg font-extrabold text-navy">Q</span>
            <span className="text-xl font-extrabold tracking-tight text-navy dark:text-foreground">
              Qalling<span className="text-gold">.</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/qalling/login">{pick("Sign in", "Masuk")}</Link>
            </Button>
            <Button asChild variant="gold" size="sm">
              <Link to="/register">
                {pick("Start Free", "Coba Gratis")} <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="container-x grid gap-10 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
        <div>
          <span className="inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
            {pick("CRM + Social Media in one dashboard", "CRM + Media Sosial dalam satu dashboard")}
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-navy dark:text-foreground sm:text-5xl">
            {pick("Close more deals with ", "Tutup lebih banyak deal dengan ")}
            <span className="text-gold">Qalling</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            {pick(
              "Manage leads, follow-ups, WhatsApp broadcasts, and social media scheduling without switching apps. Built for Indonesian sales teams.",
              "Kelola prospek, follow-up, broadcast WhatsApp, dan jadwal posting media sosial tanpa berpindah-pindah aplikasi. Dirancang untuk tim sales Indonesia.",
            )}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="gold" size="lg">
              <Link to="/qalling/login">
                {pick("Open Qalling", "Masuk ke Qalling")} <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/contact">{pick("Contact Sales", "Hubungi Sales")}</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {pick(
              "Part of the XPERD ecosystem — also available as an add-on in XPERD One.",
              "Bagian dari ekosistem XPERD — tersedia juga sebagai add-on di XPERD One.",
            )}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.en} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <f.icon className="h-6 w-6 text-gold" />
              <h3 className="mt-3 text-sm font-semibold text-navy dark:text-foreground">{pick(f.en, f.id)}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{pick(f.descEn, f.descId)}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="container-x flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Qalling — by XPERD</span>
          <Link to="/" className="underline-offset-4 hover:underline">
            xperd-one
          </Link>
        </div>
      </footer>
    </div>
  );
}
