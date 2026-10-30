import { createFileRoute } from "@tanstack/react-router";
import { QallingShell, PageHero, seo, ContactCards } from "@/components/qalling/QallingSite";

export const Route = createFileRoute("/qalling/kontak")({
  head: () => seo("Kontak — Qalling", "Butuh demo atau bantuan memilih paket? Hubungi kami."),
  component: () => (
    <QallingShell>
      <PageHero
        eyebrow="Kontak"
        title="Ngobrol dengan tim kami"
        desc="Butuh demo atau bantuan memilih paket? Hubungi kami."
      />
      <section className="container-x pb-16">
        <ContactCards />
      </section>
    </QallingShell>
  ),
});
