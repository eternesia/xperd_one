import { createFileRoute } from "@tanstack/react-router";
import {
  QallingShell,
  PageHero,
  seo,
  ItemGrid,
  ADVANTAGES,
} from "@/components/qalling/QallingSite";

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
      <section className="container-x pb-16">
        <ItemGrid items={ADVANTAGES} cols={2} />
      </section>
    </QallingShell>
  ),
});
