import { createFileRoute } from "@tanstack/react-router";

import { QallingHome } from "@/components/qalling/QallingHome";
import { useApp } from "@/lib/app-context";

export const Route = createFileRoute("/qalling/app/")({
  head: () => ({
    meta: [
      { title: "Dasbor — Qalling" },
      { name: "description", content: "Ringkasan konten, akun sosial, paket, dan saldo Qalling." },
      { property: "og:title", content: "Dasbor — Qalling" },
      {
        property: "og:description",
        content: "Ringkasan konten, akun sosial, paket, dan saldo Qalling.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QallingDashboard,
});

function QallingDashboard() {
  const { activeWorkspace, accessLoading } = useApp();
  if (!activeWorkspace || accessLoading) return null;
  return <QallingHome />;
}
