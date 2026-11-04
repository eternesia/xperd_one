import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useQallingHomeContent } from "@/lib/qalling-content";
import {
  ADVANTAGES,
  FEATURES,
  ItemGrid,
  PricingGrid,
  QallingShell,
  SOLUTIONS,
  seo,
} from "@/components/qalling/QallingSite";
import { QallingStory } from "@/components/qalling/QallingStory";
import { BenefitCards, Integrations, TestimonialGrid } from "@/components/qalling/QallingLanding";

export const Route = createFileRoute("/qalling/")({
  head: () =>
    seo(
      "Qalling — AI Social CRM: Posting via Chat AI, Leads, Pipeline & Automasi",
      "Posting lewat ChatGPT atau Claude, tangkap leads dari komentar & DM, balas otomatis, arahkan ke WhatsApp, kelola pipeline, follow up, kontak, laporan, tender, hingga terhubung ke ERP XPERD.",
    ),
  component: QallingLanding,
});

function Block({
  title,
  to,
  children,
}: {
  title: string;
  to:
    | "/qalling/solusi"
    | "/qalling/fitur"
    | "/qalling/kelebihan"
    | "/qalling/harga"
    | "/qalling/testimoni";
  children: React.ReactNode;
}) {
  const { pick } = useI18n();
  return (
    <section className="container-x py-12">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="text-2xl font-bold text-navy dark:text-foreground sm:text-3xl">{title}</h2>
        <Link to={to} className="text-sm font-medium text-gold hover:underline">
          {pick("Explore", "Selengkapnya")} →
        </Link>
      </div>
      {children}
    </section>
  );
}

function QallingLanding() {
  const { pick } = useI18n();
  const { data: content = [] } = useQallingHomeContent();
  const hero = content.find((c) => c.section === "qalling.hero");
  const features = content.filter((c) => c.section === "qalling.features");
  return (
    <QallingShell>
      <section className="container-x py-16 text-center lg:py-24">
        <span className="inline-flex rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
          {pick("Social media + CRM in one workspace", "Media sosial + CRM dalam satu dashboard")}
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-medium leading-tight text-foreground sm:text-6xl">
          {pick(hero?.title_en, hero?.title_id) || "Qalling"}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          {pick(hero?.body_en, hero?.body_id) ||
            pick(
              "Plan your content, manage conversations, and grow customer relationships.",
              "Jadwalkan konten, kelola percakapan, dan bangun hubungan pelanggan.",
            )}
        </p>
        {hero?.image_url && (
          <img
            src={hero.image_url}
            alt={pick(hero.title_en, hero.title_id) || "Qalling"}
            className="mx-auto mt-6 max-h-96 w-full max-w-5xl rounded-lg object-contain"
          />
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild variant="gold" size="lg">
            <Link to="/qalling/daftar">
              {pick("Try free", "Daftar gratis")} <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/qalling/harga">{pick("View pricing", "Lihat Harga")}</Link>
          </Button>
        </div>
      </section>
      <QallingStory />
      <Block
        title={pick("Solutions for every team", "Solusi untuk setiap tim")}
        to="/qalling/solusi"
      >
        <ItemGrid items={SOLUTIONS} cols={2} />
      </Block>
      <Block
        title={pick("From content to customers", "Dari konten hingga pelanggan")}
        to="/qalling/fitur"
      >
        {features.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <article key={f.id} className="rounded-lg border bg-card p-5">
                {f.image_url && (
                  <img
                    src={f.image_url}
                    alt={pick(f.title_en, f.title_id)}
                    className="mb-4 aspect-video w-full object-contain"
                  />
                )}
                <h3 className="font-medium">{pick(f.title_en, f.title_id)}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{pick(f.body_en, f.body_id)}</p>
              </article>
            ))}
          </div>
        ) : (
          <ItemGrid items={FEATURES.filter((_, i) => [0, 1, 5, 6, 7, 12].includes(i))} />
        )}
      </Block>
      <Integrations />
      <BenefitCards />
      <Block title={pick("Why Qalling", "Kenapa Qalling")} to="/qalling/kelebihan">
        <ItemGrid items={ADVANTAGES} cols={2} />
      </Block>
      <Block title={pick("Testimonials", "Testimoni")} to="/qalling/testimoni">
        <TestimonialGrid />
      </Block>
      <Block title={pick("Pricing", "Harga")} to="/qalling/harga">
        <PricingGrid />
      </Block>
    </QallingShell>
  );
}
