import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/site/Section";
import { getPublicPackages } from "@/lib/setup.functions";
import { formatIDR } from "@/lib/xperd";
import { useI18n } from "@/lib/i18n";

const COPY = {
  en: {
    eyebrow: "Pricing",
    heroTitle: "Honest pricing, with no hidden fees.",
    heroDescription:
      "XPERD One packages can be purchased directly online. XPERD Business and Enterprise are tailored together with our team based on your organization's complexity.",
    mostPopular: "Most popular",
    perMonth: "/month",
    contactSales: "Contact Sales",
    signUpOnline: "Sign Up Online",
    priceNote: "Prices exclude VAT. Annual subscriptions receive special adjustments.",
    unsureTitle: "Not sure which package is right for you?",
    unsureDescription:
      "Our team will map your business processes and recommend the most efficient configuration, at no cost.",
    freeConsultation: "Free consultation",
    compareProducts: "Compare products",
  },
  id: {
    eyebrow: "Pricing",
    heroTitle: "Harga yang jujur, tanpa biaya tersembunyi.",
    heroDescription:
      "Paket XPERD One dapat langsung dibeli secara online. XPERD Business dan Enterprise disusun bersama tim kami sesuai kompleksitas organisasi Anda.",
    mostPopular: "Paling populer",
    perMonth: "/bulan",
    contactSales: "Hubungi Sales",
    signUpOnline: "Daftar Online",
    priceNote: "Harga belum termasuk PPN. Berlangganan tahunan mendapatkan penyesuaian khusus.",
    unsureTitle: "Belum yakin paket mana yang tepat?",
    unsureDescription:
      "Tim kami akan memetakan proses bisnis Anda dan merekomendasikan konfigurasi yang paling efisien, tanpa biaya.",
    freeConsultation: "Konsultasi gratis",
    compareProducts: "Bandingkan produk",
  },
} as const;

export const Route = createFileRoute("/_site/pricing")({
  head: () => ({
    meta: [
      { title: "Harga Paket ERP — XPERD One, Business, Enterprise" },
      {
        name: "description",
        content:
          "Harga XPERD One Starter Rp249.000/bulan dan Professional Rp599.000/bulan. XPERD Business dan Enterprise dengan penawaran khusus dari tim sales.",
      },
      { property: "og:title", content: "Harga Paket XPERD ERP" },
      {
        property: "og:description",
        content: "Transparan untuk UMKM, fleksibel untuk perusahaan menengah dan korporasi.",
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const { lang } = useI18n();
  const c = COPY[lang];

  const { data: packages } = useQuery({
    queryKey: ["public-packages"],
    queryFn: () => getPublicPackages(),
  });

  return (
    <>
      <Section dark className="py-20">
        <SectionHeading
          onDark
          align="center"
          eyebrow={c.eyebrow}
          title={c.heroTitle}
          description={c.heroDescription}
        />
      </Section>

      <Section>
        <div className="grid gap-6 lg:grid-cols-4">
          {(packages ?? []).map((pkg) => {
            const featured = pkg.code === "one-professional";
            return (
              <article
                key={pkg.code}
                className={
                  featured
                    ? "surface-navy relative overflow-hidden rounded-2xl p-8 shadow-[var(--shadow-elevate)]"
                    : "rounded-2xl border border-border bg-card p-8"
                }
              >
                {featured && (
                  <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />
                )}
                <div className="relative">
                  {featured && (
                    <span className="mb-4 inline-block rounded-full bg-gold px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-gold-foreground">
                      {c.mostPopular}
                    </span>
                  )}
                  <h2 className={featured ? "text-xl text-primary-foreground" : "text-xl text-navy"}>
                    {pkg.name}
                  </h2>
                  <p
                    className={
                      featured
                        ? "mt-2 min-h-12 text-sm text-primary-foreground/65"
                        : "mt-2 min-h-12 text-sm text-muted-foreground"
                    }
                  >
                    {pkg.description ?? pkg.tagline}
                  </p>
                  <div className="mt-6">
                    {pkg.monthly_price ? (
                      <>
                        <span
                          className={
                            featured
                              ? "text-3xl font-semibold text-gold"
                              : "text-3xl font-semibold text-navy"
                          }
                        >
                          {formatIDR(Number(pkg.monthly_price))}
                        </span>
                        <span
                          className={
                            featured
                              ? "text-sm text-primary-foreground/60"
                              : "text-sm text-muted-foreground"
                          }
                        >
                          {" "}
                          {c.perMonth}
                        </span>
                      </>
                    ) : (
                      <span
                        className={
                          featured ? "text-2xl font-semibold text-gold" : "text-2xl font-semibold text-navy"
                        }
                      >
                        {c.contactSales}
                      </span>
                    )}
                  </div>

                  <ul className="mt-7 space-y-3">
                    {(Array.isArray(pkg.features) ? (pkg.features as string[]) : []).map((f) => (
                      <li
                        key={f}
                        className={
                          featured
                            ? "flex gap-2.5 text-sm text-primary-foreground/80"
                            : "flex gap-2.5 text-sm text-foreground/80"
                        }
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8">
                    {pkg.is_public_signup ? (
                      <Button asChild variant={featured ? "gold" : "navy"} className="w-full">
                        <Link
                          to="/register"
                          search={{
                            paket:
                              pkg.code === "one-professional" ? "one-professional" : "one-starter",
                          }}
                        >
                          {c.signUpOnline}
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild variant={featured ? "onDark" : "outline"} className="w-full">
                        <Link to="/contact" search={{ paket: pkg.code }}>
                          {c.contactSales}
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">{c.priceNote}</p>
      </Section>

      <Section className="bg-secondary/60">
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <h2 className="text-2xl text-navy">{c.unsureTitle}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {c.unsureDescription}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild variant="navy" size="xl">
              <Link to="/contact">
                {c.freeConsultation} <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="xl">
              <Link to="/products">{c.compareProducts}</Link>
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
