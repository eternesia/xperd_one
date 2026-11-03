import { createFileRoute } from "@tanstack/react-router";

import { ClientsPage } from "@/components/qalling/pages/ClientsPage";

export const Route = createFileRoute("/qalling/app/clients")({
  head: () => ({
    meta: [
      { title: "Klien & Brand — Qalling" },
      { name: "description", content: "Kelompokkan akun media sosial per klien atau brand." },
      { property: "og:title", content: "Klien & Brand — Qalling" },
      {
        property: "og:description",
        content: "Kelompokkan akun media sosial per klien atau brand.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientsPage,
});
