import { createFileRoute } from "@tanstack/react-router";

import { DocsPage } from "@/components/qalling/DocsPage";
import { seo } from "@/components/qalling/QallingSite";

export const Route = createFileRoute("/qalling/docs/")({
  head: () =>
    seo(
      "Dokumentasi — Qalling",
      "Panduan memakai Qalling: hubungkan akun, jadwalkan postingan, kelola inbox, lead, laporan, dan tagihan.",
    ),
  component: () => <DocsPage />,
});
