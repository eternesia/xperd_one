import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/qalling/LegalPage";
import { seo } from "@/components/qalling/QallingSite";

export const Route = createFileRoute("/qalling/syarat")({
  head: () =>
    seo("Syarat dan Ketentuan — Qalling", "Syarat dan ketentuan penggunaan layanan Qalling."),
  component: () => <LegalPage kind="terms" />,
});
