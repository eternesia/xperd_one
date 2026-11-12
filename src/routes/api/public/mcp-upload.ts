/**
 * Terima satu berkas media (biner mentah atau multipart `file`) ke pustaka workspace lewat token dari
 * qalling_create_upload_link. Berkas besar boleh dikirim berpotongan (`upload=<id>&part=<i>&parts=<n>`, biner mentah)
 * karena proxy produksi membatasi body ±1 MB per permintaan.
 */
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

        if (url.searchParams.has("part")) {
          const part = Number(url.searchParams.get("part"));
          const parts = Number(url.searchParams.get("parts"));
          const id = (url.searchParams.get("upload") ?? "")
            .replace(/[^A-Za-z0-9_-]/g, "")
            .slice(0, 40);
          if (
            !id ||
            !Number.isInteger(part) ||
            !Number.isInteger(parts) ||
            parts < 1 ||
            parts > 2000 ||
            part < 0 ||
            part >= parts
          )
            return json(400, { error: "Parameter upload/part/parts tidak valid." });
          const fs = await import("node:fs/promises");
          const nodePath = await import("node:path");
          const { createHash } = await import("node:crypto");
          const { storageRoot } = await import("@/lib/files.server");
          const key = createHash("sha256")
            .update(`${t.workspaceId}:${t.userId}:${id}`)
            .digest("hex")
            .slice(0, 32);
          const dir = nodePath.join(storageRoot(), ".chunk-uploads", `mcp-${key}`);
          if (part === 0) await fs.rm(dir, { recursive: true, force: true });
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(nodePath.join(dir, String(part)), bytes);
          if (part < parts - 1) return json(200, { ok: true, received: part, parts });
          try {
            const all: Buffer[] = [];
            let total = 0;
            for (let i = 0; i < parts; i++) {
              const b = await fs.readFile(nodePath.join(dir, String(i)));
              total += b.length;
              if (total > max) return json(413, { error: "Berkas melebihi batas unggah." });
              all.push(b);
            }
            bytes = Buffer.concat(all);
          } catch {
            return json(400, { error: "Ada potongan yang hilang; kirim ulang dari potongan 0." });
          } finally {
            await fs.rm(dir, { recursive: true, force: true });
          }
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
