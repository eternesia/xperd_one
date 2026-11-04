/** Aset situs publik (poster referral dll.) dari tabel `site_assets`. */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/site-asset/$key")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!/^[a-z0-9-]{1,100}$/.test(params.key)) return new Response("Not found", { status: 404 });
        const { executeOne } = await import("@/integrations/mysql/pool");
        const row = await executeOne<{ mime: string; data: Buffer; updated_at: string }>(
          "SELECT mime, data, updated_at FROM site_assets WHERE asset_key = ?",
          [params.key],
        );
        if (!row) return new Response("Not found", { status: 404 });
        const bytes = Buffer.from(row.data);
        return new Response(new Uint8Array(bytes), {
          headers: {
            "content-type": row.mime,
            "content-length": String(bytes.length),
            "cache-control": "public, max-age=300",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
