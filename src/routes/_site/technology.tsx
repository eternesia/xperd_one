import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Cloud, Cpu, Lock, Workflow } from "lucide-react";

import dashEnterprise from "@/assets/dash-enterprise.jpg";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/site/Section";
import { TECHNOLOGY_STACK } from "@/lib/xperd";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_site/technology")({
  head: () => ({
    meta: [
      { title: "Teknologi & Arsitektur — XPERD Cloud ERP" },
      {
        name: "description",
        content:
          "Arsitektur XPERD: Laravel, React, Flutter, PostgreSQL, Redis, Docker, Kubernetes, REST API, dan lapisan AI di atas infrastruktur cloud native.",
      },
      { property: "og:title", content: "Teknologi XPERD — Cloud Native ERP" },
      {
        property: "og:description",
        content: "Fondasi teknologi modern, aman, dan siap skala untuk ERP perusahaan.",
      },
    ],
  }),
  component: TechnologyPage,
});

const COPY = {
  en: {
    eyebrow: "Technology",
    heroTitle: "An engineering foundation built to last.",
    heroDescription:
      "XPERD is built on mature, open technology proven at large production scale.",
    imageAlt: "XPERD enterprise analytics dashboard",
    principles: [
      { icon: Cloud, title: "Cloud Native", desc: "Containers, automated orchestration, and horizontal scaling to match load." },
      { icon: Lock, title: "Security by Design", desc: "Encryption in transit and at rest, IAM, SSO, and comprehensive audit trails." },
      { icon: Workflow, title: "API First", desc: "Every capability is available as a documented API for integration." },
      { icon: Cpu, title: "AI Ready", desc: "An intelligence layer for forecasting, document OCR, and predictive analytics." },
    ],
    architectureEyebrow: "Architecture",
    architectureTitle: "Five layers of XPERD architecture",
    layers: [
      { name: "Experience Layer", items: ["React / Next.js Web", "Flutter Mobile", "Customer Portal"] },
      { name: "Application Layer", items: ["Laravel Services", "Workflow Engine", "Reporting Engine"] },
      { name: "Integration Layer", items: ["REST API Gateway", "Webhook", "Message Queue"] },
      { name: "Data Layer", items: ["PostgreSQL", "Redis Cache", "Data Warehouse"] },
      { name: "Platform Layer", items: ["Docker", "Kubernetes", "Observability & Backup"] },
    ],
    stackEyebrow: "Stack",
    stackTitle: "The technology we use",
    stackDesc: {
      "Laravel": "A mature backend service with a battle-tested enterprise ecosystem.",
      "React / Next.js": "A fast, modular, SEO-friendly user interface.",
      "Flutter": "A single mobile codebase for Android and iOS.",
      "PostgreSQL": "A reliable transactional database with high integrity.",
      "Redis": "Faster response times and queuing for heavy processes.",
      "Docker": "A consistent environment from development through production.",
      "Kubernetes": "Horizontal scalability and self-healing services.",
      "REST API": "An open, documented integration contract.",
      "AI Layer": "Forecasting, OCR, and analytics assistance for decision making.",
      "Cloud Native": "Cloud, hybrid, or on-premise deployment.",
    } as Record<string, string>,
    cta: "Talk to a solution architect",
  },
  id: {
    eyebrow: "Technology",
    heroTitle: "Fondasi rekayasa yang serius.",
    heroDescription:
      "XPERD dibangun di atas teknologi yang matang, terbuka, dan terbukti di skala produksi besar.",
    imageAlt: "Dashboard analitik enterprise XPERD",
    principles: [
      { icon: Cloud, title: "Cloud Native", desc: "Container, orkestrasi otomatis, dan penskalaan horizontal sesuai beban." },
      { icon: Lock, title: "Security by Design", desc: "Enkripsi in transit dan at rest, IAM, SSO, serta audit trail menyeluruh." },
      { icon: Workflow, title: "API First", desc: "Setiap kapabilitas tersedia sebagai API terdokumentasi untuk integrasi." },
      { icon: Cpu, title: "AI Ready", desc: "Lapisan kecerdasan untuk forecast, OCR dokumen, dan analitik prediktif." },
    ],
    architectureEyebrow: "Arsitektur",
    architectureTitle: "Lima lapisan arsitektur XPERD",
    layers: [
      { name: "Experience Layer", items: ["React / Next.js Web", "Flutter Mobile", "Customer Portal"] },
      { name: "Application Layer", items: ["Laravel Services", "Workflow Engine", "Reporting Engine"] },
      { name: "Integration Layer", items: ["REST API Gateway", "Webhook", "Message Queue"] },
      { name: "Data Layer", items: ["PostgreSQL", "Redis Cache", "Data Warehouse"] },
      { name: "Platform Layer", items: ["Docker", "Kubernetes", "Observability & Backup"] },
    ],
    stackEyebrow: "Stack",
    stackTitle: "Teknologi yang kami gunakan",
    stackDesc: {
      "Laravel": "Backend service matang dengan ekosistem enterprise yang teruji.",
      "React / Next.js": "Antarmuka cepat, modular, dan ramah SEO.",
      "Flutter": "Aplikasi mobile satu basis kode untuk Android dan iOS.",
      "PostgreSQL": "Basis data transaksional andal dengan integritas tinggi.",
      "Redis": "Percepatan respons dan antrean proses berat.",
      "Docker": "Lingkungan konsisten dari development sampai produksi.",
      "Kubernetes": "Skalabilitas horizontal dan self healing service.",
      "REST API": "Kontrak integrasi terbuka dan terdokumentasi.",
      "AI Layer": "Forecast, OCR, dan asisten analitik untuk pengambilan keputusan.",
      "Cloud Native": "Deployment cloud, hybrid, atau on premise.",
    } as Record<string, string>,
    cta: "Bicara dengan solution architect",
  },
} as const;

function TechnologyPage() {
  const { lang } = useI18n();
  const c = COPY[lang];

  return (
    <>
      <Section dark className="py-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
          <SectionHeading
            onDark
            eyebrow={c.eyebrow}
            title={c.heroTitle}
            description={c.heroDescription}
          />
          <div className="overflow-hidden rounded-2xl border border-white/15 shadow-[var(--shadow-elevate)]">
            <img
              src={dashEnterprise}
              alt={c.imageAlt}
              loading="lazy"
              width={1600}
              height={1008}
              className="w-full"
            />
          </div>
        </div>
      </Section>

      <Section>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {c.principles.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-card p-7">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-navy text-gold">
                <p.icon className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-base text-navy">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="bg-secondary/60">
        <SectionHeading eyebrow={c.architectureEyebrow} title={c.architectureTitle} />
        <div className="mt-12 space-y-3">
          {c.layers.map((layer) => (
            <div
              key={layer.name}
              className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 md:flex-row md:items-center md:justify-between"
            >
              <p className="text-sm font-semibold text-navy">{layer.name}</p>
              <div className="flex flex-wrap gap-2">
                {layer.items.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-muted-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow={c.stackEyebrow} title={c.stackTitle} />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TECHNOLOGY_STACK.map((t) => (
            <div key={t.name} className="border-l-2 border-gold pl-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t.role}
              </p>
              <h3 className="mt-1.5 text-lg text-navy">{t.name}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {c.stackDesc[t.name] ?? t.desc}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-14 text-center">
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
