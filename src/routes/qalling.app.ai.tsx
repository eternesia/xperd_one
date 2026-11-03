import { createFileRoute } from "@tanstack/react-router";

import { AiPage } from "@/components/qalling/pages/AiPage";

export const Route = createFileRoute("/qalling/app/ai")({
  head: () => ({
    meta: [
      { title: "Integrasi AI — Qalling" },
      { name: "description", content: "Hubungkan ChatGPT dan Claude ke Qalling." },
      { property: "og:title", content: "Integrasi AI — Qalling" },
      { property: "og:description", content: "Hubungkan ChatGPT dan Claude ke Qalling." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiPage,
});
