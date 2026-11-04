import { createFileRoute, redirect } from "@tanstack/react-router";

// Tautan lama BS New 16 (`/production/<workspace>/<seksi>`) → modul Production di dalam aplikasi.
export const Route = createFileRoute("/production/$workspaceId/$section")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/app/w/$workspaceId/$moduleId/$submoduleId",
      params: { workspaceId: params.workspaceId, moduleId: "manufacturing", submoduleId: params.section },
    });
  },
});
