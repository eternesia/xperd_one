import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/qalling/LegalPage";
import { seo } from "@/components/qalling/QallingSite";

export const Route = createFileRoute("/qalling/privasi")({
  head: () =>
    seo(
      "Kebijakan Privasi — Qalling",
      "Cara Qalling mengumpulkan, menggunakan, dan melindungi data pribadi.",
    ),
  component: () => <LegalPage kind="privacy" />,
});
