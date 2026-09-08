import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/site/Section";
import { INDUSTRIES, INDUSTRY_EN } from "@/lib/xperd";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_site/industries")({
  head: () => ({
    meta: [
      { title: "Industri — ERP Manufacturing, Distribution, Retail | XPERD" },
      {
        name: "description",
        content:
          "Blueprint ERP XPERD untuk manufacturing, distribution, retail, construction, healthcare, education, logistics, property, dan hospitality.",
      },
      { property: "og:title", content: "Solusi ERP per Industri — XPERD" },
      {
        property: "og:description",
        content: "Pain point, solusi, dan modul relevan untuk sembilan industri utama Indonesia.",
      },
    ],
  }),
  component: IndustriesPage,
});

const COPY = {
  en: {
    eyebrow: "Industries",
    heroTitle: "Nine industries, nine different ways of working.",
    heroDescription:
      "XPERD comes with initial configurations, document flows, and reports relevant to every sector.",
    painLabel: "Pain Point",
    solutionLabel: "XPERD Solution",
    cta: "Request a case study for your industry",
  },
  id: {
    eyebrow: "Industries",
    heroTitle: "Sembilan industri, sembilan cara kerja berbeda.",
    heroDescription:
      "XPERD hadir dengan konfigurasi awal, alur dokumen, dan laporan yang relevan untuk setiap sektor.",
    painLabel: "Pain Point",
    solutionLabel: "Solusi XPERD",
    cta: "Minta studi kasus industri Anda",
  },
} as const;

function IndustriesPage() {
  const { lang } = useI18n();
  const c = COPY[lang];

  return (
    <>
      <Section dark className="py-20">
        <SectionHeading
          onDark
          eyebrow={c.eyebrow}
          title={c.heroTitle}
          description={c.heroDescription}
        />
      </Section>

      <Section>
        <div className="space-y-6">
          {INDUSTRIES.map((industry) => {
            const text =
              lang === "en" ? INDUSTRY_EN[industry.slug] ?? industry : industry;
            return (
              <article
                key={industry.slug}
                id={industry.slug}
                className="grid gap-6 rounded-2xl border border-border bg-card p-8 md:grid-cols-[0.6fr_1.4fr] md:items-start"
              >
                <div>
                  <h2 className="rule-gold text-2xl text-navy">{industry.name}</h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {industry.modules.map((m) => (
                      <span
                        key={m}
                        className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-navy"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      {c.painLabel}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text.pain}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-foreground/70">
                      {c.solutionLabel}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-foreground/85">{text.solution}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-14 text-center">
          <Button asChild variant="gold" size="xl">
            <Link to="/contact">
              {c.cta} <ArrowRight />
            </Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
