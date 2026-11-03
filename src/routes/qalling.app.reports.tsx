import { createFileRoute } from "@tanstack/react-router";

import { ReportsPage } from "@/components/qalling/pages/ReportsPage";

export const Route = createFileRoute("/qalling/app/reports")({
  head: () => ({
    meta: [
      { title: "Laporan Performa — Qalling" },
      {
        name: "description",
        content: "Laporan postingan, komentar dan leads per klien, ekspor PDF atau Excel.",
      },
      { property: "og:title", content: "Laporan Performa — Qalling" },
      {
        property: "og:description",
        content: "Laporan postingan, komentar dan leads per klien, ekspor PDF atau Excel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});
