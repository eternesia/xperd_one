/**
 * PUSAT: server klien (self-hosted) melapor kesehatan tiap 5 menit dan menerima lisensi terbaru.
 * Auth: Bearer token instalasi (Super Admin → Instalasi klien).
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/instance/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "")
          .replace(/^Bearer\s+/i, "")
          .trim();
        if (!/^xpi_[\w-]{20,}$/.test(token))
          return Response.json({ error: "unauthorized" }, { status: 401 });
        const report = await request.json().catch(() => ({}));
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
          request.headers.get("x-real-ip") ||
          null;
        const { handleHeartbeat } = await import("@/lib/managed-instances.server");
        const r = await handleHeartbeat(token, report, ip);
        if (!r) return Response.json({ error: "Token instalasi tidak dikenal" }, { status: 401 });
        return Response.json(r);
      },
    },
  },
});
