// Penyaji dokumen kepatuhan Production (SDS/izin/label): wajib token bertanda tangan 5 menit + sesi yang sama + akses seksi.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/production-document")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const { getSessionUser } = await import("@/lib/auth-context.server");
        const user = await getSessionUser();
        if (!user) return new Response("Unauthorized", { status: 401 });
        const { verifyDocumentToken } = await import("@/lib/production-documents.server");
        let claim: Awaited<ReturnType<typeof verifyDocumentToken>>;
        try {
          claim = await verifyDocumentToken(token);
        } catch {
          return new Response("Forbidden", { status: 403 });
        }
        if (claim.userId !== user.id) return new Response("Forbidden", { status: 403 });
        const { executeOne } = await import("@/integrations/mysql/pool");
        const doc = await executeOne<{ path: string; kind: string; filename: string; mime: string }>(
          "SELECT path, kind, filename, mime FROM mfg_document_links WHERE id = ? AND workspace_id = ?",
          [claim.docId, claim.workspaceId],
        );
        if (!doc) return new Response("Not found", { status: 404 });
        const { mfgCanAccess } = await import("@/lib/production.server");
        if (!(await mfgCanAccess(claim.workspaceId, user.id, doc.kind === "sds" ? "profiles" : "registrations", false)))
          return new Response("Forbidden", { status: 403 });
        const { readWorkspaceFile } = await import("@/lib/files.server");
        try {
          const bytes = await readWorkspaceFile(doc.path);
          return new Response(new Uint8Array(bytes), {
            headers: {
              "content-type": doc.mime,
              "content-length": String(bytes.length),
              "content-disposition": `inline; filename="${doc.filename.replace(/[^\w.\- ]+/g, "_")}"`,
              "cache-control": "private, no-store",
            },
          });
        } catch {
          return new Response("File missing on disk", { status: 404 });
        }
      },
    },
  },
});
