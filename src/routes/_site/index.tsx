import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ShieldCheck,
  Layers,
  Gauge,
  Plug,
  Building2,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

import heroBg from "@/assets/hero-bg.jpg";
import dashOne from "@/assets/dash-one.jpg";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/site/Section";
import { INDUSTRIES, ONE_MODULES, PRODUCTS, PRODUCT_EN, TECHNOLOGY_STACK } from "@/lib/xperd";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_site/")({
  head: () => ({
    meta: [
      { title: "XPERD — Cloud ERP Indonesia untuk UMKM hingga Enterprise" },
      {
        name: "description",
        content:
          "Satu platform ERP untuk seluruh lini bisnis: XPERD One untuk UMKM, Business untuk perusahaan menengah, Enterprise untuk korporasi dan holding.",
      },
      { property: "og:title", content: "XPERD — Cloud ERP Indonesia" },
      {
        property: "og:description",
        content: "ERP kelas dunia dengan fokus pasar Indonesia. Daftar online atau minta demo.",
      },
    ],
  }),
  component: HomePage,
});

const COPY = {
  en: {
    heroBadge: "Enterprise Grade ERP",
    heroTitleLine1: "World-class ERP,",
    heroTitleLine2: "built for Indonesia.",
    heroDesc:
      "XPERD unifies finance, sales, purchasing, inventory, and production in a single platform. From SMEs tidying up their books to holdings with dozens of entities.",
    ctaRegister: "Sign Up for XPERD One",
    ctaDemo: "Request Enterprise Demo",
    metrics: [
      { value: "3", label: "Product lines for every business scale" },
      { value: "40+", label: "Operational and financial modules" },
      { value: "9", label: "Industries with ready-made blueprints" },
      { value: "99.9%", label: "Target cloud service availability" },
    ],
    productsEyebrow: "Brand Architecture",
    productsTitle: "Three products. One standard of quality.",
    productsDesc:
      "Choose the entry point that matches your business scale today, and move up as your organisation grows.",
    learnMore: "Learn More",
    pillarsEyebrow: "Why XPERD",
    pillarsTitle: "Designed to grow alongside your business.",
    pillarsDesc:
      "We built XPERD to global enterprise architecture standards, with deep understanding of Indonesian business practices, taxation, and operations.",
    dashAlt: "XPERD One dashboard view with revenue summary and sales orders",
    pillars: [
      { icon: Layers, title: "One Architecture, Three Scales", desc: "Move up from One to Business to Enterprise without painful data migration." },
      { icon: Gauge, title: "Fast Implementation", desc: "XPERD One goes live in minutes. Business and Enterprise follow a structured implementation methodology." },
      { icon: ShieldCheck, title: "Governance & Security", desc: "Granular roles, audit trail, encryption, and automatic backups at every product tier." },
      { icon: Plug, title: "Open & Integrated", desc: "REST API, webhook, marketplace, payment gateway, and WhatsApp ready to connect." },
    ],
    modulesEyebrow: "Modules",
    modulesTitle: "Every core process, in one system.",
    modulesDesc: "No more disconnected data between finance, warehouse, and sales teams.",
    industriesEyebrow: "Industries",
    industriesTitle: "Ready-made blueprints for nine industries.",
    industriesDesc:
      "Every industry has different pain points. XPERD comes with relevant starting configurations.",
    technologyEyebrow: "Technology",
    technologyTitle: "A modern, cloud-native technology foundation.",
    technologyCta: "View technology architecture",
    ctaTitle: "Ready to streamline your business operations?",
    ctaDesc:
      "Start independently with XPERD One, or discuss your complex requirements with our solutions team.",
    ctaRegisterNow: "Sign Up Online Now",
    ctaSchedule: "Schedule a Consultation",
  },
  id: {
    heroBadge: "Enterprise Grade ERP",
    heroTitleLine1: "ERP kelas dunia,",
    heroTitleLine2: "dibangun untuk Indonesia.",
    heroDesc:
      "XPERD menyatukan keuangan, penjualan, pembelian, persediaan, dan produksi dalam satu platform. Dari UMKM yang baru merapikan pembukuan hingga holding dengan puluhan entitas.",
    ctaRegister: "Daftar XPERD One",
    ctaDemo: "Request Demo Enterprise",
    metrics: [
      { value: "3", label: "Lini produk untuk setiap skala bisnis" },
      { value: "40+", label: "Modul operasional dan finansial" },
      { value: "9", label: "Industri dengan blueprint siap pakai" },
      { value: "99,9%", label: "Target ketersediaan layanan cloud" },
    ],
    productsEyebrow: "Brand Architecture",
    productsTitle: "Tiga produk. Satu standar kualitas.",
    productsDesc:
      "Pilih titik masuk sesuai skala bisnis Anda hari ini, dan naik kelas ketika organisasi bertumbuh.",
    learnMore: "Pelajari",
    pillarsEyebrow: "Mengapa XPERD",
    pillarsTitle: "Dirancang untuk tumbuh bersama bisnis Anda.",
    pillarsDesc:
      "Kami membangun XPERD dengan standar arsitektur perusahaan global, namun dengan pemahaman mendalam atas praktik bisnis, perpajakan, dan operasional Indonesia.",
    dashAlt: "Tampilan dashboard XPERD One dengan ringkasan pendapatan dan sales order",
    pillars: [
      { icon: Layers, title: "Satu Arsitektur, Tiga Skala", desc: "Naik kelas dari One ke Business hingga Enterprise tanpa migrasi data yang menyakitkan." },
      { icon: Gauge, title: "Implementasi Cepat", desc: "XPERD One aktif dalam hitungan menit. Business dan Enterprise punya metodologi implementasi terstruktur." },
      { icon: ShieldCheck, title: "Tata Kelola & Keamanan", desc: "Role granular, audit trail, enkripsi, dan pencadangan otomatis pada setiap tingkat produk." },
      { icon: Plug, title: "Terbuka & Terintegrasi", desc: "REST API, webhook, marketplace, payment gateway, dan WhatsApp siap dihubungkan." },
    ],
    modulesEyebrow: "Modul",
    modulesTitle: "Semua proses inti, dalam satu sistem.",
    modulesDesc: "Tidak ada lagi data terpisah antara tim keuangan, gudang, dan penjualan.",
    industriesEyebrow: "Industri",
    industriesTitle: "Blueprint siap pakai untuk sembilan industri.",
    industriesDesc: "Setiap industri punya pain point berbeda. XPERD hadir dengan konfigurasi awal yang relevan.",
    technologyEyebrow: "Teknologi",
    technologyTitle: "Fondasi teknologi modern dan cloud native.",
    technologyCta: "Lihat arsitektur teknologi",
    ctaTitle: "Siap merapikan operasional bisnis Anda?",
    ctaDesc:
      "Mulai mandiri dengan XPERD One, atau bicarakan kebutuhan kompleks Anda bersama tim solusi kami.",
    ctaRegisterNow: "Daftar Online Sekarang",
    ctaSchedule: "Jadwalkan Konsultasi",
  },
} as const;

function HomePage() {
  const { lang } = useI18n();
  const c = COPY[lang];

  return (
    <>
      {/* HERO */}
      <section className="surface-navy relative isolate overflow-hidden">
        <img
          src={heroBg}
          alt=""
          width={1920}
          height={1088}
          className="absolute inset-0 h-full w-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-[image:var(--gradient-veil)]" aria-hidden="true" />
        <div className="container-x relative py-24 md:py-32">
          <div className="max-w-3xl animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              <Sparkles className="h-3.5 w-3.5" /> {c.heroBadge}
            </span>
            <h1 className="mt-7 text-4xl leading-[1.08] text-primary-foreground md:text-6xl">
              {c.heroTitleLine1}
              <br />
              <span className="text-gradient-gold">{c.heroTitleLine2}</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-primary-foreground/75">
              {c.heroDesc}
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild variant="gold" size="xl">
                <Link to="/register">
                  {c.ctaRegister} <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="onDark" size="xl">
                <Link to="/contact">{c.ctaDemo}</Link>
              </Button>
            </div>
            <dl className="mt-14 grid max-w-2xl grid-cols-2 gap-6 md:grid-cols-4">
              {c.metrics.map((m) => (
                <div key={m.label}>
                  <dt className="text-2xl font-bold text-gold md:text-3xl">{m.value}</dt>
                  <dd className="mt-1 text-xs leading-snug text-primary-foreground/60">{m.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* PRODUCTS */}
      <Section>
        <SectionHeading
          eyebrow={c.productsEyebrow}
          title={c.productsTitle}
          description={c.productsDesc}
        />
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PRODUCTS.map((baseProduct, index) => {
            const product = lang === "en" ? { ...baseProduct, ...PRODUCT_EN[baseProduct.line] } : baseProduct;
            return (
              <article
                key={product.slug}
                className={
                  index === 1
                    ? "surface-navy relative overflow-hidden rounded-2xl p-8 shadow-[var(--shadow-elevate)]"
                    : "rounded-2xl border border-border bg-card p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-elevate)]"
                }
              >
                {index === 1 && (
                  <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />
                )}
                <div className="relative">
                  <p
                    className={`text-xs font-semibold uppercase tracking-[0.22em] ${index === 1 ? "text-gold" : "text-muted-foreground"}`}
                  >
                    {product.tagline}
                  </p>
                  <h3
                    className={`mt-3 text-2xl ${index === 1 ? "text-primary-foreground" : "text-navy"}`}
                  >
                    {product.name}
                  </h3>
                  <p
                    className={`mt-3 text-sm leading-relaxed ${index === 1 ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                  >
                    {product.blurb}
                  </p>
                  <ul className="mt-6 space-y-2.5">
                    {product.highlights.map((h) => (
                      <li key={h} className="flex gap-2.5 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                        <span className={index === 1 ? "text-primary-foreground/80" : "text-foreground/80"}>
                          {h}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p
                    className={`mt-7 text-sm font-semibold ${index === 1 ? "text-gold" : "text-navy"}`}
                  >
                    {product.priceLabel}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button asChild variant={index === 1 ? "gold" : "navy"} size="sm">
                      <Link to={product.ctaTo}>{product.ctaLabel}</Link>
                    </Button>
                    <Button asChild variant={index === 1 ? "onDark" : "outline"} size="sm">
                      <Link to="/products/$slug" params={{ slug: product.slug }}>
                        {c.learnMore}
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      {/* PILLARS */}
      <Section className="bg-secondary/60">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <SectionHeading
              eyebrow={c.pillarsEyebrow}
              title={c.pillarsTitle}
              description={c.pillarsDesc}
            />
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {c.pillars.map((p) => (
                <div key={p.title}>
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-navy text-gold">
                    <p.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base text-navy">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-elevate)]">
            <img
              src={dashOne}
              alt={c.dashAlt}
              loading="lazy"
              width={1600}
              height={1008}
              className="w-full"
            />
          </div>
        </div>
      </Section>

      {/* MODULES */}
      <Section dark>
        <SectionHeading
          onDark
          eyebrow={c.modulesEyebrow}
          title={c.modulesTitle}
          description={c.modulesDesc}
        />
        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ONE_MODULES.map((m) => (
            <div
              key={m.name}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:border-gold/40 hover:bg-white/[0.07]"
            >
              <h3 className="text-sm font-semibold text-gold">{m.name}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-primary-foreground/60">{m.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* INDUSTRIES */}
      <Section>
        <SectionHeading
          eyebrow={c.industriesEyebrow}
          title={c.industriesTitle}
          description={c.industriesDesc}
        />
        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INDUSTRIES.map((i) => (
            <Link
              key={i.slug}
              to="/industries"
              className="group flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 transition-all hover:-translate-y-0.5 hover:border-gold hover:shadow-[var(--shadow-elevate)]"
            >
              <span className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-gold" />
                <span className="text-sm font-medium text-navy">{i.name}</span>
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </Section>

      {/* TECHNOLOGY */}
      <Section className="bg-secondary/60">
        <SectionHeading
          align="center"
          eyebrow={c.technologyEyebrow}
          title={c.technologyTitle}
        />
        <div className="mt-12 flex flex-wrap justify-center gap-2.5">
          {TECHNOLOGY_STACK.map((t) => (
            <span
              key={t.name}
              className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-navy"
            >
              {t.name}
            </span>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Button asChild variant="outline" size="lg">
            <Link to="/technology">
              {c.technologyCta} <ArrowRight />
            </Link>
          </Button>
        </div>
      </Section>

      {/* CTA */}
      <Section dark className="py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl text-primary-foreground md:text-5xl">
            {c.ctaTitle}
          </h2>
          <p className="mt-5 text-base text-primary-foreground/70">
            {c.ctaDesc}
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button asChild variant="gold" size="xl">
              <Link to="/register">{c.ctaRegisterNow}</Link>
            </Button>
            <Button asChild variant="onDark" size="xl">
              <Link to="/contact">{c.ctaSchedule}</Link>
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
