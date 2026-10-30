import { createFileRoute } from "@tanstack/react-router";
import { QallingShell, PageHero, seo, PricingGrid } from "@/components/qalling/QallingSite";

export const Route = createFileRoute("/qalling/harga")({
  head: () =>
    seo(
      "Harga — Qalling",
      "Pilih paket sesuai jumlah akun. Menu langsung aktif sesuai paket yang dipilih.",
    ),
  component: () => (
    <QallingShell>
      <PageHero
        eyebrow="Harga"
        title="Harga sederhana, tanpa kejutan"
        desc="Pilih paket sesuai jumlah akun. Menu langsung aktif sesuai paket yang dipilih."
      />
      <section className="container-x pb-16">
        <PricingGrid />
      </section>
    </QallingShell>
  ),
});
