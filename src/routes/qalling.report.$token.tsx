import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { getReportPublic } from "@/lib/agency.functions";

export const Route = createFileRoute("/qalling/report/$token")({
  head: () => ({
    meta: [{ title: "Laporan" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ReportPage,
});

const num = (n: number) => new Intl.NumberFormat("id-ID").format(n);
const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function ReportPage() {
  const { token } = Route.useParams();
  const q = useQuery({
    queryKey: ["report-public", token],
    queryFn: () => getReportPublic({ data: { token } }),
  });
  const r = q.data;
  if (q.isLoading) return <p className="p-10 text-center text-sm text-muted-foreground">Memuat…</p>;
  if (!r)
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <p className="text-center text-sm text-muted-foreground">
          Laporan tidak ditemukan atau link sudah dicabut.
        </p>
      </main>
    );
  const tiles: [string, string][] = [
    ["Postingan terbit", num(r.totals.published)],
    ["Terjadwal", num(r.totals.scheduled)],
    ["Komentar masuk", num(r.totals.comments)],
    ...(r.totals.leads !== null
      ? ([
          ["Prospek baru", num(r.totals.leads)],
          ["Closing", `${num(r.totals.won ?? 0)} · ${rupiah(r.totals.wonValue ?? 0)}`],
        ] as [string, string][])
      : []),
  ];
  return (
    <main
      className="min-h-screen bg-secondary/30 px-4 py-8"
      style={{ ["--brand" as string]: r.color }}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <header
          className="flex items-center gap-3 rounded-xl p-5 text-white"
          style={{ background: r.color }}
        >
          {r.logoUrl && (
            <img
              src={r.logoUrl}
              alt=""
              className="h-10 w-10 rounded bg-white/90 object-contain p-1"
            />
          )}
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80">{r.brand}</p>
            <h1 className="text-xl font-bold">{r.title}</h1>
            <p className="text-xs opacity-80">
              {r.periodDays} hari terakhir · diperbarui{" "}
              {new Date(r.generatedAt).toLocaleString("id-ID")}
            </p>
          </div>
        </header>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map(([label, value]) => (
            <div key={label} className="rounded-xl border bg-background p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-bold" style={{ color: r.color }}>
                {value}
              </p>
            </div>
          ))}
        </section>
        <section className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left">
              <tr>
                <th className="px-3 py-2">Akun</th>
                <th className="px-3 py-2">Platform</th>
                <th className="px-3 py-2 text-right">Terbit</th>
                <th className="px-3 py-2 text-right">Terjadwal</th>
              </tr>
            </thead>
            <tbody>
              {r.byAccount.map((a) => (
                <tr key={`${a.platform}-${a.account}`} className="border-t">
                  <td className="px-3 py-2 font-medium">{a.account}</td>
                  <td className="px-3 py-2 capitalize text-muted-foreground">{a.platform}</td>
                  <td className="px-3 py-2 text-right">{a.published}</td>
                  <td className="px-3 py-2 text-right">{a.scheduled}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {r.topContent.length > 0 && (
          <section className="overflow-x-auto rounded-xl border bg-background">
            <h2 className="px-4 pt-4 font-semibold">Konten penghasil prospek</h2>
            <table className="mt-2 w-full text-sm">
              <thead className="bg-secondary/60 text-left">
                <tr>
                  <th className="px-3 py-2">Postingan</th>
                  <th className="px-3 py-2 text-right">Prospek</th>
                  <th className="px-3 py-2 text-right">Closing</th>
                  <th className="px-3 py-2 text-right">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {r.topContent.map((p) => (
                  <tr key={p.title} className="border-t">
                    <td className="max-w-xs truncate px-3 py-2 font-medium">{p.title}</td>
                    <td className="px-3 py-2 text-right">{p.leads}</td>
                    <td className="px-3 py-2 text-right">{p.won}</td>
                    <td className="px-3 py-2 text-right">{rupiah(p.wonValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {r.recent.length > 0 && (
          <section className="rounded-xl border bg-background p-4">
            <h2 className="mb-2 font-semibold">Postingan terbaru</h2>
            <ul className="space-y-1 text-sm">
              {r.recent.map((p) => (
                <li key={`${p.title}-${p.at}`} className="flex justify-between gap-3">
                  <span className="truncate">
                    {p.link ? (
                      <a
                        href={p.link}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                        style={{ color: r.color }}
                      >
                        {p.title}
                      </a>
                    ) : (
                      p.title
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(p.at).toLocaleDateString("id-ID")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
