import { createFileRoute } from "@tanstack/react-router";
import { QallingShell, PageHero, seo, ItemGrid, SOLUTIONS } from "@/components/qalling/QallingSite";

export const Route = createFileRoute("/qalling/solusi")({
  head: () =>
    seo(
      "Solusi — Qalling",
      "Dari UMKM sampai agensi, Qalling menyesuaikan cara kerja Anda mengelola media sosial dan pelanggan.",
    ),
  component: () => (
    <QallingShell>
      <PageHero
        eyebrow="Solusi"
        title="Satu alat untuk setiap tim"
        desc="Dari UMKM sampai agensi, Qalling menyesuaikan cara kerja Anda mengelola media sosial dan pelanggan."
      />
      <section className="container-x pb-16">
        <ItemGrid items={SOLUTIONS} cols={2} />
      </section>
    </QallingShell>
  ),
});
