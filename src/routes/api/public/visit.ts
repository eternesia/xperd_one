/**
 * Pencatatan kunjungan website publik (BS New 11 `record_website_visit`). Anonim, tanpa cookie.
 * Validasi di sini: bukan jalur aplikasi/auth/api, tanpa query/hash, situs cocok dengan jalur
 * (`/qalling*` ↔ qalling, lainnya ↔ xperd); `id` unik dari klien → pencatatan idempoten.
 */
import { createFileRoute } from "@tanstack/react-router";
import { acceptVisit } from "@/lib/visitor-rules";

export const Route = createFileRoute("/api/public/visit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 2000) return new Response(null, { status: 413 });
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response(null, { status: 400 });
        }
        const v = acceptVisit(body ?? {});
        if (!v.ok) return new Response(null, { status: 204 }); // diabaikan senyap, seperti fungsi SQL
        const { execute } = await import("@/integrations/mysql/pool");
        await execute(
          "INSERT IGNORE INTO website_visits (id, site, path, session_id, referrer_host, device) VALUES (?, ?, ?, ?, ?, ?)",
          v.row,
        );
        return new Response(null, { status: 204 });
      },
    },
  },
});
