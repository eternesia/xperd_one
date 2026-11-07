import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/qalling/LegalPage";
import { seo } from "@/components/qalling/QallingSite";

export const Route = createFileRoute("/qalling/penggunaan")({
  head: () =>
    seo("Kebijakan Penggunaan — Qalling", "Aturan penggunaan yang dapat diterima di Qalling."),
  component: () => <LegalPage kind="aup" />,
});
