import { ContactItems } from "@/components/site/ContactItems";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/site/Section";
import { BRAND } from "@/lib/xperd";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_site/about")({
  head: () => ({
    meta: [
      { title: "Tentang XPERD — Perusahaan Teknologi ERP Indonesia" },
      {
        name: "description",
        content:
          "XPERD membangun platform ERP kelas dunia untuk bisnis Indonesia, dari UMKM hingga korporasi, dengan standar rekayasa dan tata kelola tingkat enterprise.",
      },
      { property: "og:title", content: "Tentang XPERD" },
      {
        property: "og:description",
        content: "Visi, misi, dan nilai perusahaan di balik platform ERP XPERD.",
      },
    ],
  }),
  component: AboutPage,
});

const COPY = {
  en: {
    eyebrow: "About",
    heroTitle: "We build the digital backbone of Indonesian business.",
    heroDescription: `${BRAND.legal} was founded on one conviction: Indonesian companies deserve software on par with SAP and Oracle, with local understanding and reasonable cost.`,
    visionTitle: "Vision",
    visionText:
      "To become the most trusted ERP platform in Southeast Asia, capable of accompanying companies from day one to becoming large business groups.",
    missionTitle: "Mission",
    missionText:
      "To simplify operational complexity through one accurate, automated, and open system, and to support customers until the system is truly used every day.",
    valuesEyebrow: "Values",
    valuesTitle: "The values we hold",
    values: [
      { title: "Clarity", desc: "A complex system should not feel complex to its users." },
      { title: "Craft", desc: "Every product detail is built to a high engineering standard." },
      { title: "Trust", desc: "Customer data is a trust; security is not an add-on feature." },
      { title: "Partnership", desc: "We measure success by our customers' business outcomes." },
    ],
    journeyEyebrow: "Journey",
    journeyTitle: "How our product has grown",
    milestones: [
      {
        year: "Foundation",
        text: "Built a stable accounting and operational core for the Indonesian market.",
      },
      {
        year: "XPERD One",
        text: "Launched a self-service cloud ERP for SMEs and growing businesses.",
      },
      {
        year: "XPERD Business",
        text: "Expanded into multi-entity, workflow, and digital ecosystem integration.",
      },
      {
        year: "XPERD Enterprise",
        text: "Delivered consolidation, governance, and AI capabilities for corporations.",
      },
    ],
    contactEyebrow: "Contact",
    contactTitle: "Let's talk",
    ctaContact: "Contact us",
    ctaRegister: "Sign up for XPERD One",
  },
  id: {
    eyebrow: "About",
    heroTitle: "Kami membangun tulang punggung digital bisnis Indonesia.",
    heroDescription: `${BRAND.legal} berdiri dengan satu keyakinan: perusahaan Indonesia berhak atas perangkat lunak sekelas SAP dan Oracle, dengan pemahaman lokal dan biaya yang masuk akal.`,
    visionTitle: "Visi",
    visionText:
      "Menjadi platform ERP paling dipercaya di Asia Tenggara, yang mampu menemani perusahaan dari hari pertama hingga menjadi grup usaha berskala besar.",
    missionTitle: "Misi",
    missionText:
      "Menyederhanakan kompleksitas operasional melalui satu sistem yang akurat, otomatis, dan terbuka, serta mendampingi pelanggan sampai sistem benar-benar dipakai setiap hari.",
    valuesEyebrow: "Values",
    valuesTitle: "Nilai yang kami pegang",
    values: [
      { title: "Clarity", desc: "Sistem yang rumit tidak boleh terasa rumit bagi penggunanya." },
      {
        title: "Craft",
        desc: "Setiap detail produk dikerjakan dengan standar rekayasa yang tinggi.",
      },
      { title: "Trust", desc: "Data pelanggan adalah amanah; keamanan bukan fitur tambahan." },
      { title: "Partnership", desc: "Kami mengukur keberhasilan dari hasil bisnis pelanggan." },
    ],
    journeyEyebrow: "Perjalanan",
    journeyTitle: "Bagaimana produk kami tumbuh",
    milestones: [
      {
        year: "Fondasi",
        text: "Membangun inti akuntansi dan operasional yang stabil untuk pasar Indonesia.",
      },
      {
        year: "XPERD One",
        text: "Meluncurkan cloud ERP self service untuk UMKM dan bisnis bertumbuh.",
      },
      {
        year: "XPERD Business",
        text: "Memperluas ke multi entitas, workflow, dan integrasi ekosistem digital.",
      },
      {
        year: "XPERD Enterprise",
        text: "Menghadirkan konsolidasi, tata kelola, dan kapabilitas AI untuk korporasi.",
      },
    ],
    contactEyebrow: "Kontak",
    contactTitle: "Mari berbicara",
    ctaContact: "Hubungi kami",
    ctaRegister: "Daftar XPERD One",
  },
} as const;

function AboutPage() {
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
        <div className="grid gap-10 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-9">
            <h2 className="rule-gold text-2xl text-navy">{c.visionTitle}</h2>
            <p className="mt-5 leading-relaxed text-muted-foreground">{c.visionText}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-9">
            <h2 className="rule-gold text-2xl text-navy">{c.missionTitle}</h2>
            <p className="mt-5 leading-relaxed text-muted-foreground">{c.missionText}</p>
          </div>
        </div>
      </Section>

      <Section className="bg-secondary/60">
        <SectionHeading eyebrow={c.valuesEyebrow} title={c.valuesTitle} />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {c.values.map((v) => (
            <div key={v.title} className="rounded-2xl border border-border bg-card p-7">
              <h3 className="text-lg text-navy">{v.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{v.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow={c.journeyEyebrow} title={c.journeyTitle} />
        <div className="mt-12 space-y-6 border-l-2 border-border pl-8">
          {c.milestones.map((m) => (
            <div key={m.year} className="relative">
              <span className="absolute -left-[2.4rem] top-1.5 h-3 w-3 rounded-full bg-gold" />
              <p className="text-sm font-semibold text-navy">{m.year}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{m.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section dark>
        <div className="grid gap-10 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div>
            <SectionHeading onDark eyebrow={c.contactEyebrow} title={c.contactTitle} />
            <ContactItems className="mt-8 space-y-4 text-sm text-primary-foreground/75" />
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Button asChild variant="gold" size="xl">
              <Link to="/contact">
                {c.ctaContact} <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="onDark" size="xl">
              <Link to="/register">{c.ctaRegister}</Link>
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
