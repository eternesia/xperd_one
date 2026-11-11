/** Mesin render Template: unduh rekaman narasi pekerjaan yang sedang dirender (`?job=<id>`). Auth: Bearer token. */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/render-worker/audio")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authenticateWorker, renderJobAudio } = await import("@/lib/ai-templates.server");
        if (!(await authenticateWorker(request)))
          return Response.json({ error: "unauthorized" }, { status: 401 });
        const job = new URL(request.url).searchParams.get("job") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(job))
          return Response.json({ error: "bad_job" }, { status: 400 });
        const audio = await renderJobAudio(job).catch(() => null);
        if (!audio) return Response.json({ error: "not_found" }, { status: 404 });
        return new Response(new Uint8Array(audio.bytes), {
          headers: { "content-type": audio.mime, "content-length": String(audio.bytes.length) },
        });
      },
    },
  },
});
