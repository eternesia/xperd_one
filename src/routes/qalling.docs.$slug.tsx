import { createFileRoute } from "@tanstack/react-router";

import { DocsPage } from "@/components/qalling/DocsPage";
import { seo } from "@/components/qalling/QallingSite";
import { QALLING_DOCS } from "@/lib/qalling-docs";

export const Route = createFileRoute("/qalling/docs/$slug")({
  head: ({ params }) => {
    const d = QALLING_DOCS.find((x) => x.id === params.slug);
    return seo(
      d ? `${d.title} — Dokumentasi Qalling` : "Dokumentasi — Qalling",
      d?.summary ?? "Panduan memakai Qalling.",
    );
  },
  component: function DocsSlug() {
    const { slug } = Route.useParams();
    return <DocsPage slug={slug} />;
  },
});
