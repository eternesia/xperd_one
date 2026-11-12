/** Contoh video template Studio (publik, hanya berkas yang didaftarkan Super Admin). Mendukung Range (Safari/iOS). */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/template-sample")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = new URL(request.url).searchParams.get("key") ?? "";
        const { loadSamples } = await import("@/lib/template-samples.server");
        const sample = (await loadSamples())[key];
        if (!sample) return new Response("Not found", { status: 404 });
        const { readWorkspaceFile } = await import("@/lib/files.server");
        let bytes: Buffer;
        try {
          bytes = await readWorkspaceFile(sample.path);
        } catch {
          return new Response("Not found", { status: 404 });
        }
        const headers: Record<string, string> = {
          "content-type": "video/mp4",
          "accept-ranges": "bytes",
          "cache-control": "public, max-age=86400",
        };
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
        if (range) {
          const size = bytes.length;
          let start = range[1] ? Number(range[1]) : size - Number(range[2] || 0);
          let end = range[1] && range[2] ? Number(range[2]) : size - 1;
          start = Math.max(0, start);
          end = Math.min(end, size - 1);
          if (start > end)
            return new Response(null, {
              status: 416,
              headers: { "content-range": `bytes */${size}` },
            });
          return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
            status: 206,
            headers: {
              ...headers,
              "content-range": `bytes ${start}-${end}/${size}`,
              "content-length": String(end - start + 1),
            },
          });
        }
        return new Response(new Uint8Array(bytes), {
          headers: { ...headers, "content-length": String(bytes.length) },
        });
      },
    },
  },
});
