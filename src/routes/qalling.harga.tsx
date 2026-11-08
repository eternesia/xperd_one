import { createFileRoute } from "@tanstack/react-router";
import { WhatsAppCostInfo } from "@/components/qalling/WhatsAppCostInfo";
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
        <div className="mx-auto mt-10 max-w-3xl">
          <WhatsAppCostInfo heading />
        </div>
      </section>
    </QallingShell>
  ),
});
