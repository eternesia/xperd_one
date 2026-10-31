import { createFileRoute } from "@tanstack/react-router";

const BOT = /bot|crawler|spider|facebookexternalhit|whatsapp|telegram|slack|discord|preview/i;

/** Pelacak klik tombol link automasi yang dikirim koneksi native. Hanya menghitung, tanpa identitas pengunjung. */
export const Route = createFileRoute("/l/$ruleId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (!/^[0-9a-f-]{36}$/i.test(params.ruleId)) return new Response("Not found", { status: 404 });
        const { execute, executeOne } = await import("@/integrations/mysql/pool");
        let url: string | null = null;
        if (BOT.test(request.headers.get("user-agent") ?? "")) {
          // Pratinjau tautan oleh bot/pesan tidak dihitung sebagai klik.
          url =
            (
              await executeOne<{ link_url: string | null }>(
                "SELECT link_url FROM crm_automation_rules WHERE id = ? AND enabled = 1",
                [params.ruleId],
              )
            )?.link_url ?? null;
        } else {
          await execute(
            "UPDATE crm_automation_rules SET click_count = click_count + 1 WHERE id = ? AND enabled = 1 AND link_url IS NOT NULL",
            [params.ruleId],
          );
          url =
            (
              await executeOne<{ link_url: string | null }>(
                "SELECT link_url FROM crm_automation_rules WHERE id = ? AND enabled = 1",
                [params.ruleId],
              )
            )?.link_url ?? null;
        }
        if (!url || !/^https:\/\//i.test(url)) return new Response("Link tidak tersedia", { status: 404 });
        return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
      },
    },
  },
});
