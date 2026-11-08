/** Terima satu berkas media (biner mentah atau multipart `file`) ke pustaka workspace lewat token dari qalling_create_upload_link. */
import { createFileRoute } from "@tanstack/react-router";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/mcp-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const { verifyUploadToken } = await import("@/lib/mcp-upload.server");
        const t = verifyUploadToken(url.searchParams.get("token"));
        if (!t) return json(401, { error: "Link unggah tidak valid atau sudah kedaluwarsa." });
        try {
          const { assertQallingSection } = await import("@/lib/mcp/db");
          await assertQallingSection(t.workspaceId, t.userId, "media", true);
        } catch {
          return json(403, { error: "Akses ditolak untuk workspace ini." });
        }
        const { loadMediaPolicy } = await import("@/lib/media-policy.server");
        const policy = await loadMediaPolicy();
        const max = Math.max(policy.photo_mb, policy.video_mb) * 1048576;
        const declared = Number(request.headers.get("content-length"));
        if (declared > max + 1048576) return json(413, { error: "Berkas melebihi batas unggah." });

        let bytes: Buffer;
        let type = (request.headers.get("content-type") ?? "").split(";")[0].trim();
        let name = url.searchParams.get("name") ?? undefined;
        try {
          if (type === "multipart/form-data") {
            const f = (await request.formData()).get("file");
            if (!(f instanceof File))
              return json(400, { error: "Kirim berkas pada field 'file'." });
            bytes = Buffer.from(await f.arrayBuffer());
            type = f.type;
            name = name ?? f.name;
          } else {
            bytes = Buffer.from(await request.arrayBuffer());
          }
        } catch {
          return json(400, { error: "Isi permintaan tidak dapat dibaca." });
        }
        if (!bytes.length) return json(400, { error: "Berkas kosong." });
        if (bytes.length > max) return json(413, { error: "Berkas melebihi batas unggah." });

        const { MEDIA_TYPES, sniffMediaType, storeMedia } = await import("@/lib/mcp/qalling-media");
        if (!MEDIA_TYPES.includes(type)) type = sniffMediaType(bytes) ?? "";
        if (!type)
          return json(415, {
            error: "Format media tidak didukung (JPG, PNG, WebP, GIF, MP4, MOV, WebM).",
          });
        try {
          const { validateMediaFile } = await import("@/lib/media-upload-policy");
          validateMediaFile({ type, size: bytes.length }, policy);
          const row = await storeMedia(t.workspaceId, t.userId, bytes, type, name?.slice(0, 120));
          return json(200, {
            media_id: row.id,
            mime_type: row.mime_type,
            size_bytes: row.size_bytes,
          });
        } catch (e) {
          return json(422, { error: e instanceof Error ? e.message : "Unggah gagal." });
        }
      },
    },
  },
});
