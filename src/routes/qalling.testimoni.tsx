import { createFileRoute } from "@tanstack/react-router";
import { QallingShell, PageHero, seo } from "@/components/qalling/QallingSite";
import { TestimonialGrid } from "@/components/qalling/QallingLanding";

export const Route = createFileRoute("/qalling/testimoni")({
  head: () =>
    seo(
      "Testimoni — Qalling",
      "Cerita UMKM, kreator, dan agency yang mengelola media sosial dengan Qalling.",
    ),
  component: () => (
    <QallingShell>
      <PageHero
        eyebrow="Testimoni"
        title="Apa kata pengguna Qalling"
        desc="Cerita UMKM, kreator, dan agency yang mengelola media sosial dengan Qalling."
      />
      <section className="container-x pb-16">
        <TestimonialGrid />
      </section>
    </QallingShell>
  ),
});
