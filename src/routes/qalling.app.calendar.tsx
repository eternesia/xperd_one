import { createFileRoute } from "@tanstack/react-router";

import { CalendarPage } from "@/components/qalling/pages/CalendarPage";

export const Route = createFileRoute("/qalling/app/calendar")({
  head: () => ({
    meta: [
      { title: "Kalender Konten — Qalling" },
      { name: "description", content: "Lihat jadwal postingan sosial dalam kalender bulanan." },
      { property: "og:title", content: "Kalender Konten — Qalling" },
      {
        property: "og:description",
        content: "Lihat jadwal postingan sosial dalam kalender bulanan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});
