/** Superadmin: unduh file backup (database .sql.gz / berkas .tar.gz) untuk disimpan di luar server. */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin/backup-download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id") ?? "";
        const { getSessionUser, hasRole } = await import("@/lib/auth-context.server");
        const user = await getSessionUser();
        if (!user) return new Response("Unauthorized", { status: 401 });
        if (!(await hasRole(user.id, "admin"))) return new Response("Forbidden", { status: 403 });
        const { backupFilePath } = await import("@/lib/backup.server");
        const f = await backupFilePath(id);
        if (!f) return new Response("Not found", { status: 404 });
        const { stat } = await import("node:fs/promises");
        const { createReadStream } = await import("node:fs");
        const { Readable } = await import("node:stream");
        let size: number;
        try {
          size = (await stat(f.path)).size;
        } catch {
          return new Response("File missing on disk", { status: 404 });
        }
        return new Response(Readable.toWeb(createReadStream(f.path)) as unknown as ReadableStream, {
          headers: {
            "content-type": f.fileName.endsWith(".sql.gz")
              ? "application/gzip"
              : "application/x-gtar",
            "content-length": String(size),
            "content-disposition": `attachment; filename="${f.fileName}"`,
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
