/**
 * #51 (BS New 3): rute pengunduhan berkas workspace.
 *
 * Dipakai karena sesi Old disimpan pada cookie httpOnly `xperd_token`, sehingga
 * `<a href>`/`window.open` bisa ikut terautentikasi tanpa perlu mengirim token
 * lewat URL. Kepemilikan berkas ditentukan dari baris database yang menyimpan
 * path tersebut (pustaka dokumen, dokumen tender, atau template) supaya berkas
 * tidak bisa dibaca lintas workspace.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/workspace-files")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const path = url.searchParams.get("path") ?? "";
        if (!path) return new Response("Missing path", { status: 400 });

        const { canWriteWorkspace, getSessionUser, isWorkspaceMember } = await import("@/lib/auth-context.server");
        const user = await getSessionUser();
        if (!user) return new Response("Unauthorized", { status: 401 });

        const { executeOne } = await import("@/integrations/mysql/pool");
        const known = await executeOne<{ workspace_id: string }>(
          `SELECT workspace_id FROM crm_doc_library WHERE file_path = ?
            UNION ALL SELECT workspace_id FROM crm_doc_library_versions WHERE file_path = ?
            UNION ALL SELECT workspace_id FROM crm_tender_docs WHERE file_path = ?
            UNION ALL SELECT workspace_id FROM crm_tender_templates WHERE template_path = ?
            UNION ALL SELECT workspace_id FROM crm_tender_templates WHERE source_pdf_path = ?
            LIMIT 1`,
          [path, path, path, path, path],
        );
        const workspaceId = known?.workspace_id;
        if (!workspaceId) return new Response("Not found", { status: 404 });

        if (!(await isWorkspaceMember(workspaceId, user.id)) && !(await canWriteWorkspace(workspaceId, user.id))) {
          return new Response("Forbidden", { status: 403 });
        }

        const { readWorkspaceFile, mimeFromPath } = await import("@/lib/files.server");
        let bytes: Buffer;
        try {
          bytes = await readWorkspaceFile(path);
        } catch {
          return new Response("File missing on disk", { status: 404 });
        }

        const name = path.split("/").pop() ?? "file";
        return new Response(new Uint8Array(bytes), {
          headers: {
            "content-type": mimeFromPath(path),
            "content-length": String(bytes.length),
            "content-disposition": `inline; filename="${name.replace(/"/g, "")}"`,
            "cache-control": "private, max-age=300",
          },
        });
      },
    },
  },
});
