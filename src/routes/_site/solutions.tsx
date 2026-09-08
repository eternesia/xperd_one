import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/site/Section";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_site/solutions")({
  head: () => ({
    meta: [
      { title: "Solusi Bisnis — XPERD ERP Indonesia" },
      {
        name: "description",
        content:
          "Solusi XPERD untuk keuangan, rantai pasok, penjualan, produksi, proyek, dan tata kelola perusahaan Indonesia.",
      },
      { property: "og:title", content: "Solusi Bisnis XPERD" },
      {
        property: "og:description",
        content: "Petakan tantangan bisnis Anda ke solusi ERP XPERD yang tepat.",
      },
    ],
  }),
  component: SolutionsPage,
});

const COPY = {
  en: {
    eyebrow: "Solutions",
    heroTitle: "Start from the problem, not a feature list.",
    heroDescription:
      "We map the operational challenges we see most often in Indonesian companies to the right combination of XPERD modules.",
    challengeLabel: "Challenge. ",
    approachLabel: "XPERD approach. ",
    ctaDiscuss: "Discuss your needs",
    ctaProducts: "View products",
    solutions: [
      {
        title: "Financial Management",
        problem: "Slow book closing, inconsistent reporting across entities.",
        answer: "Centralised general ledger, automated journals, consolidation, and budget control.",
        modules: ["Accounting", "Budget", "Cash & Bank", "Consolidation"],
      },
      {
        title: "Supply Chain & Inventory",
        problem: "Inaccurate stock, unplanned purchasing, ballooning logistics costs.",
        answer: "Multi-warehouse stock control, purchasing planning, and accurate inventory valuation.",
        modules: ["Inventory", "Warehouse", "Purchasing", "Procurement"],
      },
      {
        title: "Sales & Customer",
        problem: "No pipeline visibility, delayed billing, inconsistent customer service.",
        answer: "A clean flow from quotation to cash receipt, plus CRM and customer portal.",
        modules: ["Sales", "CRM", "Customer Portal", "Report"],
      },
      {
        title: "Manufacturing & Project",
        problem: "Inaccurate cost of goods and project progress hard to compare against budget.",
        answer: "Per-batch production cost calculation and per-project budget control.",
        modules: ["Manufacturing", "Project", "Asset", "Budget"],
      },
      {
        title: "Governance, Risk & Compliance",
        problem: "No audit trail and no clear segregation of duties.",
        answer: "Granular roles, tiered approvals, audit trail, and IAM-based access control.",
        modules: ["Approval Workflow", "Audit Trail", "IAM", "SSO"],
      },
      {
        title: "Data & Intelligence",
        problem: "Management only sees the past, not forward-looking projections.",
        answer: "BI dashboards, KPIs, AI forecasting, and real-time cross-entity analytics.",
        modules: ["BI Dashboard", "KPI", "AI Forecast", "AI Analytics"],
      },
    ],
  },
  id: {
    eyebrow: "Solutions",
    heroTitle: "Mulai dari masalah, bukan dari daftar fitur.",
    heroDescription:
      "Kami memetakan tantangan operasional yang paling sering kami temui di perusahaan Indonesia ke kombinasi modul XPERD yang tepat.",
    challengeLabel: "Tantangan. ",
    approachLabel: "Pendekatan XPERD. ",
    ctaDiscuss: "Diskusikan kebutuhan Anda",
    ctaProducts: "Lihat produk",
    solutions: [
      {
        title: "Financial Management",
        problem: "Tutup buku lambat, laporan tidak konsisten antar entitas.",
        answer: "Buku besar terpusat, jurnal otomatis, konsolidasi, dan anggaran terkendali.",
        modules: ["Accounting", "Budget", "Cash & Bank", "Consolidation"],
      },
      {
        title: "Supply Chain & Inventory",
        problem: "Stok tidak akurat, pembelian tidak terencana, biaya logistik membengkak.",
        answer: "Kontrol stok multi gudang, perencanaan pembelian, dan valuasi persediaan akurat.",
        modules: ["Inventory", "Warehouse", "Purchasing", "Procurement"],
      },
      {
        title: "Sales & Customer",
        problem: "Pipeline tidak terlihat, penagihan telat, pelanggan tidak terlayani konsisten.",
        answer: "Alur quotation sampai penerimaan kas yang rapi, plus CRM dan customer portal.",
        modules: ["Sales", "CRM", "Customer Portal", "Report"],
      },
      {
        title: "Manufacturing & Project",
        problem: "HPP tidak akurat dan progres proyek sulit dibandingkan dengan anggaran.",
        answer: "Perhitungan biaya produksi per batch dan kontrol anggaran per proyek.",
        modules: ["Manufacturing", "Project", "Asset", "Budget"],
      },
      {
        title: "Governance, Risk & Compliance",
        problem: "Tidak ada jejak audit dan pemisahan wewenang yang jelas.",
        answer: "Role granular, approval berjenjang, audit trail, dan kontrol akses berbasis IAM.",
        modules: ["Approval Workflow", "Audit Trail", "IAM", "SSO"],
      },
      {
        title: "Data & Intelligence",
        problem: "Manajemen hanya melihat masa lalu, bukan proyeksi ke depan.",
        answer: "BI dashboard, KPI, AI forecast, dan analitik lintas entitas secara real time.",
        modules: ["BI Dashboard", "KPI", "AI Forecast", "AI Analytics"],
      },
    ],
  },
} as const;

function SolutionsPage() {
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
        <div className="grid gap-6 md:grid-cols-2">
          {c.solutions.map((s) => (
            <article
              key={s.title}
              className="rounded-2xl border border-border bg-card p-8 transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-elevate)]"
            >
              <h2 className="rule-gold text-xl text-navy">{s.title}</h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">{c.challengeLabel}</span>
                {s.problem}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">{c.approachLabel}</span>
                {s.answer}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {s.modules.map((m) => (
                  <span
                    key={m}
                    className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-navy"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap justify-center gap-3">
          <Button asChild variant="navy" size="xl">
            <Link to="/contact">
              {c.ctaDiscuss} <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="xl">
            <Link to="/products">{c.ctaProducts}</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
