import { createFileRoute } from "@tanstack/react-router";
import { QallingShell, PageHero, seo, ItemGrid, FEATURES } from "@/components/qalling/QallingSite";

export const Route = createFileRoute("/qalling/fitur")({
  head: () =>
    seo(
      "Fitur — Qalling Social Media & Sales CRM",
      "Jelajahi publishing, Ideas Kanban, komentar, inbox, leads, pipeline, kontak, follow up, target sales, tender, dan broadcast Qalling.",
    ),
  component: () => (
    <QallingShell>
      <PageHero
        eyebrow="Fitur"
        title="Qalling: Media Sosial & Sales CRM"
        desc="Dari perencanaan konten hingga penjualan dan tender. Pilih Lite untuk publishing, Pro untuk CRM, atau Agency untuk kebutuhan tim yang lebih lengkap."
      />
      <section className="container-x pb-16">
        <ItemGrid items={FEATURES} />
      </section>
    </QallingShell>
  ),
});
