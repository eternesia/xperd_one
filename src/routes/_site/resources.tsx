import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, FileText, GraduationCap, LifeBuoy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/site/Section";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_site/resources")({
  head: () => ({
    meta: [
      { title: "Resources — Panduan, Dokumentasi, dan Dukungan XPERD" },
      {
        name: "description",
        content:
          "Panduan implementasi ERP, dokumentasi API, materi pelatihan, dan kanal dukungan pelanggan XPERD.",
      },
      { property: "og:title", content: "Resources XPERD" },
      {
        property: "og:description",
        content: "Sumber belajar dan dukungan untuk memaksimalkan penggunaan XPERD ERP.",
      },
    ],
  }),
  component: ResourcesPage,
});

const COPY = {
  en: {
    eyebrow: "Resources",
    heroTitle: "Knowledge that makes implementation succeed.",
    heroDescription:
      "Technology is only half the story. We share frameworks and best practices so your ERP is truly put to use.",
    insightEyebrow: "Insight",
    insightTitle: "Featured reading",
    cta: "Request a consultation session",
    resources: [
      {
        icon: BookOpen,
        title: "Implementation Guide",
        desc: "A seven-stage framework from discovery to go-live and post-implementation support.",
      },
      {
        icon: FileText,
        title: "API Documentation",
        desc: "REST API reference, authentication, webhooks, and integration examples for your dev team.",
      },
      {
        icon: GraduationCap,
        title: "XPERD Academy",
        desc: "Role-by-role training modules for finance, purchasing, warehouse, and management.",
      },
      {
        icon: LifeBuoy,
        title: "Help Center",
        desc: "Knowledge base, service status, and support channels matched to your subscription tier.",
      },
    ],
    articles: [
      {
        tag: "Guide",
        title: "Seven ERP implementation stages you cannot skip",
        desc: "The most costly implementation mistakes usually happen before a single row of data is migrated.",
      },
      {
        tag: "Finance",
        title: "Closing the books in three days, not three weeks",
        desc: "Automated journal practices and continuous reconciliation that turn book closing into a light routine.",
      },
      {
        tag: "Operations",
        title: "Controlling multi-warehouse stock without adding headcount",
        desc: "How minimum stock policies and partial cycle counts keep inventory accuracy high.",
      },
      {
        tag: "Technology",
        title: "When a company needs to move from accounting to full ERP",
        desc: "Five operational signals that your accounting software has run out of runway.",
      },
    ],
  },
  id: {
    eyebrow: "Resources",
    heroTitle: "Pengetahuan yang membuat implementasi berhasil.",
    heroDescription:
      "Teknologi hanyalah separuh cerita. Kami membagikan kerangka kerja dan praktik terbaik agar ERP benar-benar dipakai.",
    insightEyebrow: "Insight",
    insightTitle: "Bacaan pilihan",
    cta: "Minta sesi konsultasi",
    resources: [
      {
        icon: BookOpen,
        title: "Panduan Implementasi",
        desc: "Kerangka kerja tujuh tahap dari discovery sampai go-live dan pendampingan pasca implementasi.",
      },
      {
        icon: FileText,
        title: "Dokumentasi API",
        desc: "Referensi REST API, autentikasi, webhook, dan contoh integrasi untuk tim pengembang Anda.",
      },
      {
        icon: GraduationCap,
        title: "XPERD Academy",
        desc: "Modul pelatihan peran demi peran untuk finance, purchasing, gudang, dan manajemen.",
      },
      {
        icon: LifeBuoy,
        title: "Pusat Bantuan",
        desc: "Basis pengetahuan, status layanan, dan kanal dukungan sesuai tingkat langganan Anda.",
      },
    ],
    articles: [
      {
        tag: "Panduan",
        title: "Tujuh tahap implementasi ERP yang tidak boleh dilewati",
        desc: "Kesalahan implementasi paling mahal biasanya terjadi sebelum satu baris data pun dimigrasikan.",
      },
      {
        tag: "Finance",
        title: "Menutup buku dalam tiga hari, bukan tiga minggu",
        desc: "Praktik jurnal otomatis dan rekonsiliasi berkelanjutan yang membuat tutup buku jadi rutinitas ringan.",
      },
      {
        tag: "Operasi",
        title: "Mengendalikan stok multi gudang tanpa menambah orang",
        desc: "Bagaimana kebijakan minimum stock dan siklus opname parsial menjaga akurasi persediaan.",
      },
      {
        tag: "Teknologi",
        title: "Kapan perusahaan perlu naik dari akuntansi ke ERP penuh",
        desc: "Lima sinyal operasional yang menandakan software akuntansi Anda sudah kehabisan napas.",
      },
    ],
  },
} as const;

function ResourcesPage() {
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {c.resources.map((r) => (
            <div
              key={r.title}
              className="rounded-2xl border border-border bg-card p-7 transition-all hover:-translate-y-1 hover:border-gold hover:shadow-[var(--shadow-elevate)]"
            >
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-navy text-gold">
                <r.icon className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-base text-navy">{r.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="bg-secondary/60">
        <SectionHeading eyebrow={c.insightEyebrow} title={c.insightTitle} />
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {c.articles.map((a) => (
            <article key={a.title} className="rounded-2xl border border-border bg-card p-8">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-foreground/70">
                {a.tag}
              </span>
              <h3 className="mt-3 text-lg leading-snug text-navy">{a.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a.desc}</p>
            </article>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Button asChild variant="navy" size="xl">
            <Link to="/contact">
              {c.cta} <ArrowRight />
            </Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
