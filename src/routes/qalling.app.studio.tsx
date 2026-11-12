import { createFileRoute } from "@tanstack/react-router";

import { AiStudioPage } from "@/components/qalling/pages/AiStudioPage";

export const Route = createFileRoute("/qalling/app/studio")({
  head: () => ({
    meta: [
      { title: "Studio Video — Qalling" },
      { name: "description", content: "Ubah foto produk menjadi video promo dengan AI." },
    ],
  }),
  component: AiStudioPage,
});
