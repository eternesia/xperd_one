import { createFileRoute } from "@tanstack/react-router";
import {
  QallingShell,
  PageHero,
  seo,
  ItemGrid,
  ADVANTAGES,
} from "@/components/qalling/QallingSite";
import { BenefitCards, Integrations } from "@/components/qalling/QallingLanding";

export const Route = createFileRoute("/qalling/kelebihan")({
  head: () =>
    seo("Kelebihan — Qalling", "Harga lokal, bayar dari saldo, dan dibuat untuk tim Indonesia."),
  component: () => (
    <QallingShell>
      <PageHero
        eyebrow="Kelebihan"
        title="Kenapa memilih Qalling"
        desc="Harga lokal, bayar dari saldo, dan dibuat untuk tim Indonesia."
      />
      <BenefitCards />
      <section className="container-x pb-8">
        <ItemGrid items={ADVANTAGES} cols={2} />
      </section>
      <div className="pb-8">
        <Integrations />
      </div>
    </QallingShell>
  ),
});
