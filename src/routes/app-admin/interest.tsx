import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent } from "@/components/ui/card";
import { adminFeatureInterest } from "@/lib/feature-interest.functions";

export const Route = createFileRoute("/app-admin/interest")({
  head: () => ({ meta: [{ title: "Minat Fitur | XPERD Admin" }] }),
  component: InterestAdmin,
});

const LABEL: Record<string, string> = { ai_photo_video: "Studio AI: foto → video" };

function InterestAdmin() {
  const q = useQuery({ queryKey: ["admin-interest"], queryFn: () => adminFeatureInterest() });
  const totals = q.data?.totals ?? [];
  const features = Array.from(new Set(totals.map((t) => t.feature)));
  const n = (f: string, e: string) => totals.find((t) => t.feature === f && t.event === e)?.n ?? 0;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Minat Fitur</h1>
        <p className="text-sm text-muted-foreground">
          Uji minat sebelum membangun fitur. “Klik” = pengguna yang menekan tombol segera hadir;
          “Mau” = yang mendaftar ke daftar awal.
        </p>
      </div>
      {features.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => {
          const click = n(f, "click");
          const want = n(f, "want");
          return (
            <Card key={f}>
              <CardContent className="space-y-2 p-4">
                <p className="font-semibold">{LABEL[f] ?? f}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted/50 py-2">
                    <p className="text-xl font-semibold">{click}</p>
                    <p className="text-xs text-muted-foreground">Klik</p>
                  </div>
                  <div className="rounded-xl bg-muted/50 py-2">
                    <p className="text-xl font-semibold">{want}</p>
                    <p className="text-xs text-muted-foreground">Mau</p>
                  </div>
                  <div className="rounded-xl bg-muted/50 py-2">
                    <p className="text-xl font-semibold">
                      {click ? Math.round((want / click) * 100) : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">Konversi</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {(q.data?.people.length ?? 0) > 0 && (
        <div className="space-y-2">
          <p className="font-semibold">Daftar awal</p>
          {q.data!.people.map((p, i) => (
            <div key={i} className="rounded-2xl border bg-card p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{p.email ?? "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {LABEL[p.feature] ?? p.feature} · {String(p.created_at).slice(0, 16)}
                </span>
              </div>
              {p.note && <p className="mt-1 text-muted-foreground">{p.note}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
