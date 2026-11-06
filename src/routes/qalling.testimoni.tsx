import { createFileRoute } from "@tanstack/react-router";
import { QallingShell, PageHero, seo } from "@/components/qalling/QallingSite";
import { TestimonialGrid } from "@/components/qalling/QallingLanding";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/qalling/testimoni")({
  head: () =>
    seo(
      "Testimoni — Qalling",
      "Cerita UMKM, kreator, dan agensi yang mengelola media sosial dengan Qalling.",
    ),
  component: TestimonialsPage,
});

function TestimonialsPage() {
  const { pick } = useI18n();
  return (
    <QallingShell>
      <PageHero
        eyebrow={pick("Testimonials", "Testimoni")}
        title={pick("What Qalling users say", "Kata pengguna Qalling")}
        desc={pick(
          "Stories from small businesses, creators and agencies managing their social media with Qalling.",
          "Cerita UMKM, kreator, dan agensi yang mengelola media sosial dengan Qalling.",
        )}
      />
      <section className="container-x pb-16">
        <TestimonialGrid />
      </section>
    </QallingShell>
  );
}
