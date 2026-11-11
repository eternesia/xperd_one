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

        const { canWriteWorkspace, getSessionUser, isWorkspaceMember } =
          await import("@/lib/auth-context.server");
        const user = await getSessionUser();
        if (!user) return new Response("Unauthorized", { status: 401 });

        const { executeOne } = await import("@/integrations/mysql/pool");

        // Bukti transfer wallet: `wallet-proofs/<tenantId>/<topupId>/<file>` — anggota tenant atau Super Admin.
        if (path.startsWith("wallet-proofs/")) {
          const tenantId = path.split("/")[1] ?? "";
          const { hasRole } = await import("@/lib/auth-context.server");
          const { isTenantMember } = await import("@/lib/wallet.server");
          const own = await executeOne(
            "SELECT 1 AS ok FROM topups WHERE tenant_id = ? AND proof_path = ? LIMIT 1",
            [tenantId, path],
          );
          if (
            !own ||
            !((await isTenantMember(tenantId, user.id)) || (await hasRole(user.id, "admin")))
          )
            return new Response("Forbidden", { status: 403 });
          const { readWorkspaceFile, mimeFromPath } = await import("@/lib/files.server");
          try {
            const bytes = await readWorkspaceFile(path);
            return new Response(new Uint8Array(bytes), {
              headers: {
                "content-type": mimeFromPath(path),
                "content-length": String(bytes.length),
                "content-disposition": "inline",
                "cache-control": "private, max-age=60",
              },
            });
          } catch {
            return new Response("File missing on disk", { status: 404 });
          }
        }

        const known = await executeOne<{ workspace_id: string }>(
          `SELECT workspace_id FROM crm_doc_library WHERE file_path = ?
            UNION ALL SELECT workspace_id FROM crm_doc_library_versions WHERE file_path = ?
            UNION ALL SELECT workspace_id FROM crm_tender_docs WHERE file_path = ?
            UNION ALL SELECT workspace_id FROM crm_tender_templates WHERE template_path = ?
            UNION ALL SELECT workspace_id FROM crm_tender_templates WHERE source_pdf_path = ?
            UNION ALL SELECT workspace_id FROM crm_media WHERE file_path = ?
            LIMIT 1`,
          [path, path, path, path, path, path],
        );
        const workspaceId = known?.workspace_id;
        if (!workspaceId) return new Response("Not found", { status: 404 });

        if (
          !(await isWorkspaceMember(workspaceId, user.id)) &&
          !(await canWriteWorkspace(workspaceId, user.id))
        ) {
          return new Response("Forbidden", { status: 403 });
        }

        const { readWorkspaceFile, mimeFromPath } = await import("@/lib/files.server");
        let bytes: Buffer;
        try {
          bytes = await readWorkspaceFile(path);
        } catch {
          return new Response("File missing on disk", { status: 404 });
        }

        // `?download=1` → simpan sebagai berkas (tombol Download), nama tanpa awalan UUID.
        const name = (path.split("/").pop() ?? "file").replace(/^[0-9a-f-]{36}-/i, "");
        const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
        return new Response(new Uint8Array(bytes), {
          headers: {
            "content-type": mimeFromPath(path),
            "content-length": String(bytes.length),
            "content-disposition": `${disposition}; filename="${name.replace(/"/g, "")}"`,
            "cache-control": "private, max-age=300",
          },
        });
      },
    },
  },
});
