/**
 * Mesin render Template: unggah hasil MP4. Auth: Bearer token mesin render.
 * `?job=<id>` + body = berkas utuh, atau berpotongan `&part=<i>&parts=<n>` (≤512 KB per potong) agar lolos
 * batas body bawaan proxy (nginx 1 MB → 413).
 */
import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 60 * 1024 * 1024;
const MAX_PARTS = 200;

export const Route = createFileRoute("/api/public/render-worker/complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateWorker, completeRenderJob } = await import("@/lib/ai-templates.server");
        if (!(await authenticateWorker(request)))
          return Response.json({ error: "unauthorized" }, { status: 401 });
        const q = new URL(request.url).searchParams;
        const job = q.get("job") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(job))
          return Response.json({ error: "bad_job" }, { status: 400 });
        if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES)
          return Response.json({ error: "too_large" }, { status: 413 });
        let bytes = Buffer.from(await request.arrayBuffer());
        if (bytes.length > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });

        if (q.has("part")) {
          const part = Number(q.get("part"));
          const parts = Number(q.get("parts"));
          if (
            !Number.isInteger(part) ||
            !Number.isInteger(parts) ||
            parts < 1 ||
            parts > MAX_PARTS ||
            part < 0 ||
            part >= parts
          )
            return Response.json({ error: "bad_part" }, { status: 400 });
          const fs = await import("node:fs/promises");
          const nodePath = await import("node:path");
          const { storageRoot } = await import("@/lib/files.server");
          const dir = nodePath.join(storageRoot(), ".chunk-uploads", `render-${job.toLowerCase()}`);
          if (part === 0) await fs.rm(dir, { recursive: true, force: true });
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(nodePath.join(dir, String(part)), bytes);
          if (part < parts - 1) return Response.json({ ok: true, received: part });
          try {
            const all: Buffer[] = [];
            let total = 0;
            for (let i = 0; i < parts; i++) {
              const b = await fs.readFile(nodePath.join(dir, String(i)));
              total += b.length;
              if (total > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
              all.push(b);
            }
            bytes = Buffer.concat(all);
          } catch {
            return Response.json({ error: "missing_part" }, { status: 400 });
          } finally {
            await fs.rm(dir, { recursive: true, force: true });
          }
        }

        try {
          return Response.json(await completeRenderJob(job, bytes));
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 409 });
        }
      },
    },
  },
});
