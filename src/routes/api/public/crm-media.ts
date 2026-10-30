/** Berkas media pustaka via URL bertanda tangan (dibaca Tebar/Meta saat memposting). */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/crm-media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const path = url.searchParams.get("path") ?? "";
        const { verifyMediaSignature } = await import("@/lib/crm-media.server");
        if (!verifyMediaSignature(path, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
          return new Response("Forbidden", { status: 403 });
        }
        const { executeOne } = await import("@/integrations/mysql/pool");
        if (
          !(await executeOne("SELECT 1 AS ok FROM crm_media WHERE file_path = ? LIMIT 1", [path]))
        ) {
          return new Response("Not found", { status: 404 });
        }
        const { readWorkspaceFile, mimeFromPath } = await import("@/lib/files.server");
        let bytes: Buffer;
        try {
          bytes = await readWorkspaceFile(path);
        } catch {
          return new Response("File missing on disk", { status: 404 });
        }
        return new Response(new Uint8Array(bytes), {
          headers: {
            "content-type": mimeFromPath(path),
            "content-length": String(bytes.length),
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
