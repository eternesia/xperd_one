import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";

import dashOne from "@/assets/dash-one.jpg";
import dashBusiness from "@/assets/dash-business.jpg";
import dashEnterprise from "@/assets/dash-enterprise.jpg";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/site/Section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BUSINESS_MODULE_GROUPS,
  ENTERPRISE_MODULE_GROUPS,
  ONE_MODULES,
  PRODUCTS,
  PRODUCT_EN,
  getProduct,
  type ProductSummary,
} from "@/lib/xperd";
import { PRODUCT_LOGOS } from "@/lib/logos";
import { useI18n } from "@/lib/i18n";

const SHOTS = { one: dashOne, business: dashBusiness, enterprise: dashEnterprise };

const COPY = {
  en: {
    forAudience: (audience: string) => `For ${audience}.`,
    viewPricing: "View Pricing",
    dashAlt: (name: string) => `${name} dashboard view`,
    overviewEyebrow: "Overview",
    overviewTitle: (name: string) => `What is ${name}?`,
    businessValue: "Business Value",
    benefits: [
      { title: "Efficiency", desc: "Eliminates duplicate work and repetitive manual entry." },
      { title: "Automation", desc: "Documents, journals, and reminders run without intervention." },
      { title: "Accuracy", desc: "One single source of truth for all business figures." },
      { title: "Scalability", desc: "Grow from one entity to dozens without switching systems." },
      { title: "Integration", desc: "Connected to sales channels and supporting systems." },
    ],
    challengeTitle: "Business Challenge",
    solutionTitle: "XPERD Solution",
    challenges: {
      one: [
        "Records are still scattered across spreadsheets and notebooks.",
        "Physical stock and recorded stock often don't match.",
        "Profit and loss reports are only ready weeks after month-end close.",
        "Hard to stop cost leakage due to lack of document control.",
      ],
      business: [
        "Every branch uses different working methods and report formats.",
        "Consolidation across entities is done manually every month.",
        "Expense approvals are slow and untracked.",
        "Sales, warehouse, and accounting systems aren't connected.",
      ],
      enterprise: [
        "Group consolidation takes days and is prone to misstatement.",
        "Compliance and audit demand a complete transaction trail.",
        "Dozens of legacy systems make data integration difficult.",
        "Management needs projections, not just historical reports.",
      ],
    },
    solutions: {
      one: [
        "One single database for sales, purchasing, inventory, and accounting.",
        "Journals are generated automatically from every operational transaction.",
        "Financial reports are available in real time, whenever needed.",
        "Simple approval flow for high-value documents.",
      ],
      business: [
        "Multi company, multi branch, and multi warehouse structure from day one.",
        "Tiered approval workflow with a full audit trail.",
        "Automated consolidation across entities and currencies.",
        "Full integration via REST API, webhook, marketplace, and payment gateway.",
      ],
      enterprise: [
        "Automated financial consolidation and intercompany reconciliation.",
        "IAM, SSO, and audit trail for corporate-grade governance.",
        "A workflow engine that can model even the most complex processes.",
        "An AI layer for forecasting, accounting, document OCR, and analytics.",
      ],
    },
    modulesEyebrow: "Modules",
    modulesTitle: "Available modules",
    modulesDesc: "Every module connects to the general ledger and shares the same database.",
    faqEyebrow: "FAQ",
    faqTitle: "Frequently asked questions",
    faq: {
      one: [
        { q: "How long does activation take?", a: "Once the online registration form is submitted and verified, your workspace is ready the same business day." },
        { q: "Is my data secure?", a: "Data is stored encrypted in the cloud with automatic daily backups and role-based access control." },
        { q: "Can I upgrade to a higher plan?", a: "Yes. Upgrading from Starter to Professional or to XPERD Business is done without losing any data." },
        { q: "Is there an implementation fee?", a: "No, not for the Starter and Professional plans. You simply pay a monthly subscription." },
      ],
      business: [
        { q: "What does the implementation process look like?", a: "We run discovery, blueprinting, configuration, data migration, and training stages, then go live with hands-on support." },
        { q: "Can it be customised?", a: "Yes. Workflows, documents, and reports can be tailored to your business processes." },
        { q: "Does it support multiple currencies?", a: "It supports multi-currency transactions and consolidation with periodic revaluation." },
        { q: "How is pricing structured?", a: "Pricing is based on the number of entities, modules, and users. Our sales team will prepare a proposal." },
      ],
      enterprise: [
        { q: "Can it be deployed on premise?", a: "Yes. XPERD Enterprise is available in cloud, hybrid, or on-premise modes." },
        { q: "How is compliance and audit support handled?", a: "Full audit trail, segregation of duties, and compliance reports are available out of the box." },
        { q: "Is there a dedicated SLA?", a: "Yes, including availability targets, incident response times, and a dedicated success manager." },
        { q: "What's the migration strategy from legacy systems?", a: "We provide a phased migration programme with legacy system coexistence during the transition period." },
      ],
    },
    crossSellEyebrow: "Other Products",
    crossSellTitle: "Compare with other lines",
    learnMore: "Learn More",
    notFoundTitle: "Product not found — XPERD",
  },
  id: {
    forAudience: (audience: string) => `Untuk ${audience}.`,
    viewPricing: "Lihat Harga",
    dashAlt: (name: string) => `Tampilan dashboard ${name}`,
    overviewEyebrow: "Overview",
    overviewTitle: (name: string) => `Apa itu ${name}?`,
    businessValue: "Business Value",
    benefits: [
      { title: "Efisiensi", desc: "Menghapus pekerjaan ganda dan entri manual berulang." },
      { title: "Otomasi", desc: "Dokumen, jurnal, dan pengingat berjalan tanpa intervensi." },
      { title: "Akurasi", desc: "Satu sumber kebenaran untuk seluruh angka bisnis." },
      { title: "Skalabilitas", desc: "Tumbuh dari satu entitas menjadi puluhan tanpa ganti sistem." },
      { title: "Integrasi", desc: "Terhubung dengan kanal penjualan dan sistem pendukung." },
    ],
    challengeTitle: "Business Challenge",
    solutionTitle: "XPERD Solution",
    challenges: {
      one: [
        "Pencatatan masih tersebar di spreadsheet dan buku tulis.",
        "Stok fisik dan catatan sering tidak cocok.",
        "Laporan laba rugi baru siap berminggu-minggu setelah tutup bulan.",
        "Sulit menahan kebocoran biaya karena tidak ada kontrol dokumen.",
      ],
      business: [
        "Setiap cabang memakai cara kerja dan format laporan berbeda.",
        "Konsolidasi antar entitas dikerjakan manual setiap bulan.",
        "Persetujuan pengeluaran lambat dan tidak terlacak.",
        "Sistem penjualan, gudang, dan akuntansi tidak saling terhubung.",
      ],
      enterprise: [
        "Konsolidasi grup memakan waktu berhari-hari dan rawan salah saji.",
        "Kepatuhan dan audit menuntut jejak transaksi yang lengkap.",
        "Puluhan sistem warisan menyulitkan integrasi data.",
        "Manajemen membutuhkan proyeksi, bukan sekadar laporan historis.",
      ],
    },
    solutions: {
      one: [
        "Satu basis data untuk penjualan, pembelian, stok, dan akuntansi.",
        "Jurnal terbentuk otomatis dari setiap transaksi operasional.",
        "Laporan keuangan tersedia real time, kapan pun dibutuhkan.",
        "Approval sederhana untuk dokumen bernilai besar.",
      ],
      business: [
        "Struktur multi company, multi branch, dan multi warehouse sejak awal.",
        "Workflow persetujuan berjenjang dengan jejak audit.",
        "Konsolidasi otomatis lintas entitas dan mata uang.",
        "Integrasi penuh via REST API, webhook, marketplace, dan payment gateway.",
      ],
      enterprise: [
        "Financial consolidation dan intercompany reconciliation terotomasi.",
        "IAM, SSO, dan audit trail untuk tata kelola tingkat korporasi.",
        "Workflow engine yang dapat memodelkan proses paling kompleks.",
        "Lapisan AI untuk forecast, akuntansi, OCR dokumen, dan analitik.",
      ],
    },
    modulesEyebrow: "Modules",
    modulesTitle: "Modul yang tersedia",
    modulesDesc: "Setiap modul terhubung ke buku besar dan berbagi satu basis data yang sama.",
    faqEyebrow: "FAQ",
    faqTitle: "Pertanyaan yang sering diajukan",
    faq: {
      one: [
        { q: "Berapa lama proses aktivasi?", a: "Setelah formulir registrasi online dikirim dan diverifikasi, workspace Anda disiapkan pada hari kerja yang sama." },
        { q: "Apakah data saya aman?", a: "Data disimpan terenkripsi di cloud dengan pencadangan harian otomatis dan kontrol akses berbasis peran." },
        { q: "Bisakah upgrade ke paket lebih tinggi?", a: "Bisa. Upgrade dari Starter ke Professional maupun ke XPERD Business dilakukan tanpa kehilangan data." },
        { q: "Apakah ada biaya implementasi?", a: "Tidak untuk paket Starter dan Professional. Anda cukup berlangganan bulanan." },
      ],
      business: [
        { q: "Bagaimana proses implementasinya?", a: "Kami menjalankan tahap discovery, blueprint, konfigurasi, migrasi data, pelatihan, lalu go-live dengan pendampingan." },
        { q: "Apakah bisa dikustomisasi?", a: "Ya. Workflow, dokumen, dan laporan dapat disesuaikan dengan proses bisnis Anda." },
        { q: "Apakah mendukung multi mata uang?", a: "Mendukung transaksi dan konsolidasi multi mata uang dengan revaluasi periodik." },
        { q: "Bagaimana skema harganya?", a: "Harga disusun berdasarkan jumlah entitas, modul, dan pengguna. Tim sales akan menyiapkan proposal." },
      ],
      enterprise: [
        { q: "Apakah bisa dipasang on premise?", a: "Bisa. XPERD Enterprise tersedia dalam mode cloud, hybrid, maupun on premise." },
        { q: "Bagaimana dukungan kepatuhan dan audit?", a: "Audit trail lengkap, segregation of duties, dan laporan kepatuhan tersedia bawaan." },
        { q: "Apakah ada SLA khusus?", a: "Ya, termasuk target ketersediaan, waktu respons insiden, dan dedicated success manager." },
        { q: "Bagaimana strategi migrasi dari sistem lama?", a: "Kami menyediakan program migrasi bertahap dengan koeksistensi sistem lama selama masa transisi." },
      ],
    },
    crossSellEyebrow: "Produk lain",
    crossSellTitle: "Bandingkan dengan lini lainnya",
    learnMore: "Pelajari",
    notFoundTitle: "Produk tidak ditemukan — XPERD",
  },
} as const;

export const Route = createFileRoute("/_site/products/$slug")({
  loader: ({ params }): { product: ProductSummary } => {
    const product = getProduct(params.slug);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Produk tidak ditemukan — XPERD" }, { name: "robots", content: "noindex" }] };
    }
    const { product } = loaderData;
    const title = `${product.name} — ${product.tagline} | XPERD`;
    const description = product.blurb;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: ProductDetail,
});

function ProductDetail() {
  const { product: baseProduct } = Route.useLoaderData() as { product: ProductSummary };
  const { lang } = useI18n();
  const c = COPY[lang];
  const product = lang === "en" ? { ...baseProduct, ...PRODUCT_EN[baseProduct.line] } : baseProduct;
  const shot = SHOTS[product.line];
  const others = PRODUCTS.filter((p) => p.slug !== product.slug).map((p) =>
    lang === "en" ? { ...p, ...PRODUCT_EN[p.line] } : p,
  );

  return (
    <>
      <section className="surface-navy relative overflow-hidden">
        <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="container-x relative grid gap-12 py-20 md:py-24 lg:grid-cols-[1fr_1.05fr] lg:items-center">
          <div className="animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              <Sparkles className="h-3.5 w-3.5" /> {product.tagline}
            </span>
            <h1 className="mt-6 text-4xl text-primary-foreground md:text-5xl">{product.name}</h1>
            <p className="mt-5 text-lg leading-relaxed text-primary-foreground/75">{product.blurb}</p>
            <p className="mt-6 text-sm text-primary-foreground/60">
              {c.forAudience(product.audience)}
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild variant="gold" size="xl">
                <Link to={product.ctaTo}>
                  {product.ctaLabel} <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="onDark" size="xl">
                <Link to="/pricing">{c.viewPricing}</Link>
              </Button>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/15 shadow-[var(--shadow-elevate)]">
            <img
              src={shot}
              alt={c.dashAlt(product.name)}
              width={1600}
              height={1008}
              className="w-full"
            />
          </div>
        </div>
      </section>

      {/* OVERVIEW */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr]">
          <div>
            <img
              src={PRODUCT_LOGOS[product.line]}
              alt={lang === "en" ? `${product.name} logo` : `Logo ${product.name}`}
              className="mb-8 h-16 w-auto object-contain object-left"
            />
            <SectionHeading eyebrow={c.overviewEyebrow} title={c.overviewTitle(product.name)} />
            <p className="mt-5 leading-relaxed text-muted-foreground">{product.blurb}</p>
            <ul className="mt-7 space-y-3">
              {product.highlights.map((h) => (
                <li key={h} className="flex gap-3 text-sm text-foreground/85">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  {h}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-card p-8">
            <h3 className="text-lg text-navy">{c.businessValue}</h3>
            <div className="mt-6 space-y-5">
              {c.benefits.map((b) => (
                <div key={b.title} className="border-l-2 border-gold pl-4">
                  <p className="text-sm font-semibold text-navy">{b.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* CHALLENGE + SOLUTION */}
      <Section className="bg-secondary/60">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-8">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <h2 className="text-xl text-navy">{c.challengeTitle}</h2>
            </div>
            <ul className="mt-6 space-y-4">
              {c.challenges[product.line].map((ch) => (
                <li key={ch} className="text-sm leading-relaxed text-muted-foreground">
                  {ch}
                </li>
              ))}
            </ul>
          </div>
          <div className="surface-navy relative overflow-hidden rounded-2xl p-8">
            <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />
            <div className="relative">
              <h2 className="text-xl text-primary-foreground">{c.solutionTitle}</h2>
              <ul className="mt-6 space-y-4">
                {c.solutions[product.line].map((s) => (
                  <li key={s} className="flex gap-3 text-sm leading-relaxed text-primary-foreground/75">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      {/* MODULES */}
      <Section>
        <SectionHeading
          eyebrow={c.modulesEyebrow}
          title={c.modulesTitle}
          description={c.modulesDesc}
        />
        {product.line === "one" ? (
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ONE_MODULES.map((m) => (
              <div
                key={m.name}
                className="rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-gold hover:shadow-[var(--shadow-elevate)]"
              >
                <h3 className="text-sm font-semibold text-navy">{m.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{m.desc}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {(product.line === "business" ? BUSINESS_MODULE_GROUPS : ENTERPRISE_MODULE_GROUPS).map(
              (group) => (
                <div key={group.group} className="rounded-2xl border border-border bg-card p-6">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-foreground/70">
                    {group.group}
                  </h3>
                  <ul className="mt-4 space-y-2.5">
                    {group.items.map((item) => (
                      <li key={item} className="flex gap-2.5 text-sm text-foreground/85">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )}
          </div>
        )}
      </Section>

      {/* FAQ */}
      <Section className="bg-secondary/60">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading eyebrow={c.faqEyebrow} title={c.faqTitle} />
          <Accordion type="single" collapsible className="w-full">
            {c.faq[product.line].map((f, i) => (
              <AccordionItem key={f.q} value={`item-${i}`}>
                <AccordionTrigger className="text-left text-navy">{f.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Section>

      {/* CROSS SELL */}
      <Section dark>
        <SectionHeading onDark eyebrow={c.crossSellEyebrow} title={c.crossSellTitle} />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {others.map((o) => (
            <Link
              key={o.slug}
              to="/products/$slug"
              params={{ slug: o.slug }}
              className="group rounded-2xl border border-white/12 bg-white/[0.04] p-7 transition-all hover:border-gold/50 hover:bg-white/[0.07]"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">{o.tagline}</p>
              <h3 className="mt-3 text-xl text-primary-foreground">{o.name}</h3>
              <p className="mt-3 text-sm text-primary-foreground/65">{o.audience}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-gold">
                {c.learnMore} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
