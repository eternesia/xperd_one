import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/site/Section";
import { PRODUCTS, PRODUCT_EN } from "@/lib/xperd";
import { PRODUCT_LOGOS } from "@/lib/logos";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_site/products/")({
  head: () => ({
    meta: [
      { title: "Produk XPERD — One, Business, dan Enterprise" },
      {
        name: "description",
        content:
          "Bandingkan XPERD One, XPERD Business, dan XPERD Enterprise. Pilih ERP sesuai skala, kompleksitas, dan target pertumbuhan bisnis Anda.",
      },
      { property: "og:title", content: "Produk XPERD — One, Business, Enterprise" },
      {
        property: "og:description",
        content: "Tiga lini produk ERP XPERD untuk UMKM, perusahaan menengah, dan korporasi.",
      },
    ],
  }),
  component: ProductsPage,
});

const COPY = {
  en: {
    eyebrow: "Products",
    title: "The XPERD product portfolio",
    description:
      "Three product lines built on the same architectural foundation, differentiated by feature depth, organisational complexity, and level of governance.",
    logoAlt: (name: string) => `${name} logo`,
    target: "Target: ",
    equivalent: "Comparable to: ",
    detail: "Product details",
    highlights: "Highlights",
  },
  id: {
    eyebrow: "Products",
    title: "Portofolio produk XPERD",
    description:
      "Tiga lini produk dengan fondasi arsitektur yang sama, dibedakan oleh kedalaman fitur, kompleksitas organisasi, dan tingkat tata kelola.",
    logoAlt: (name: string) => `Logo ${name}`,
    target: "Target: ",
    equivalent: "Setara dengan: ",
    detail: "Detail produk",
    highlights: "Sorotan",
  },
} as const;

function ProductsPage() {
  const { lang } = useI18n();
  const c = COPY[lang];

  return (
    <>
      <Section dark className="py-20">
        <SectionHeading
          onDark
          eyebrow={c.eyebrow}
          title={c.title}
          description={c.description}
        />
      </Section>

      <Section>
        <div className="space-y-8">
          {PRODUCTS.map((baseProduct) => {
            const product = lang === "en" ? { ...baseProduct, ...PRODUCT_EN[baseProduct.line] } : baseProduct;
            return (
              <article
                key={product.slug}
                className="grid gap-8 rounded-2xl border border-border bg-card p-8 md:grid-cols-[1.2fr_1fr] md:p-10"
              >
                <div>
                  <img
                    src={PRODUCT_LOGOS[product.line]}
                    alt={c.logoAlt(product.name)}
                    loading="lazy"
                    className="h-14 w-auto object-contain object-left"
                  />
                  <h2 className="sr-only">{product.name}</h2>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-gold-foreground/70">
                    {product.tagline}
                  </p>
                  <p className="mt-4 leading-relaxed text-muted-foreground">{product.blurb}</p>
                  <p className="mt-6 text-sm">
                    <span className="font-semibold text-navy">{c.target}</span>
                    <span className="text-muted-foreground">{product.audience}</span>
                  </p>
                  <p className="mt-2 text-sm">
                    <span className="font-semibold text-navy">{c.equivalent}</span>
                    <span className="text-muted-foreground">{product.competitors.join(", ")}</span>
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Button asChild variant="navy">
                      <Link to="/products/$slug" params={{ slug: product.slug }}>
                        {c.detail} <ArrowRight />
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link to={product.ctaTo}>{product.ctaLabel}</Link>
                    </Button>
                  </div>
                </div>
                <div className="rounded-xl bg-secondary/70 p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {c.highlights}
                  </p>
                  <ul className="mt-4 space-y-3">
                    {product.highlights.map((h) => (
                      <li key={h} className="flex gap-2.5 text-sm text-foreground/80">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                        {h}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-6 border-t border-border pt-4 text-sm font-semibold text-navy">
                    {product.priceLabel}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </Section>
    </>
  );
}
