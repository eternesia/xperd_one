import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listWorkspaceRows } from "@/lib/data.functions";
import { useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/qalling/app/calendar")({
  head: () => ({
    meta: [
      { title: "Kalender Konten — Qalling" },
      { name: "description", content: "Lihat jadwal postingan sosial dalam kalender bulanan." },
      { property: "og:title", content: "Kalender Konten — Qalling" },
      {
        property: "og:description",
        content: "Lihat jadwal postingan sosial dalam kalender bulanan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const tone: Record<string, string> = {
  published: "bg-primary/15 text-primary",
  scheduled: "bg-accent text-accent-foreground",
  draft: "bg-muted text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
};
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function CalendarPage() {
  const { activeWorkspace } = useApp();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  const { data: posts = [] } = useQuery({
    queryKey: ["qalling-calendar", activeWorkspace?.id, start.toISOString()],
    enabled: Boolean(activeWorkspace?.id),
    queryFn: async () => {
      const res = await listWorkspaceRows({
        data: {
          table: "crm_scheduled_posts",
          workspaceId: activeWorkspace!.id,
          orderBy: "scheduled_at",
          orderDir: "asc",
          limit: 2000,
        },
      });
      return (
        (res?.rows ?? []) as {
          id: string;
          title: string | undefined;
          status: string;
          scheduled_at: string;
        }[]
      )
        .map((p) => ({
          ...p,
          scheduled_at: new Date(`${String(p.scheduled_at).replace(" ", "T")}Z`).toISOString(),
        }))
        .filter((p) => p.scheduled_at >= start.toISOString() && p.scheduled_at < end.toISOString());
    },
  });
  const byDay = useMemo(() => {
    const m = new Map<string, typeof posts>();
    for (const p of posts) {
      const k = key(new Date(p.scheduled_at));
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [posts]);
  const lead = (start.getDay() + 6) % 7;
  const total = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + total) / 7) * 7 }, (_, i) => {
    const n = i - lead + 1;
    return n >= 1 && n <= total ? new Date(cursor.getFullYear(), cursor.getMonth(), n) : null;
  });
  const today = key(new Date());

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Kalender Konten</h1>
          <p className="text-sm text-muted-foreground">{posts.length} postingan bulan ini</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Bulan sebelumnya"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">
            {cursor.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Bulan berikutnya"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            <ChevronRight />
          </Button>
          <Button asChild variant="gold" size="sm">
            <Link to="/qalling/app/$submoduleId" params={{ submoduleId: "post-scheduler" }}>
              <Plus />
              Post
            </Link>
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <div className="grid min-w-[640px] grid-cols-7">
          {DAYS.map((d) => (
            <div
              key={d}
              className="border-b border-border px-2 py-2 text-xs font-medium text-muted-foreground"
            >
              {d}
            </div>
          ))}
          {cells.map((d, i) => (
            <div
              key={i}
              className={cn("min-h-24 border-b border-r border-border p-1.5", !d && "bg-muted/30")}
            >
              {d && (
                <>
                  <div
                    className={cn(
                      "mb-1 grid h-6 w-6 place-items-center rounded-full text-xs",
                      key(d) === today && "bg-primary text-primary-foreground",
                    )}
                  >
                    {d.getDate()}
                  </div>
                  <div className="space-y-1">
                    {(byDay.get(key(d)) ?? []).slice(0, 3).map((p) => (
                      <div
                        key={p.id}
                        className={cn(
                          "truncate rounded px-1.5 py-0.5 text-[11px]",
                          tone[p.status] ?? tone.draft,
                        )}
                        title={p.title}
                      >
                        {new Date(p.scheduled_at).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        {p.title}
                      </div>
                    ))}
                    {(byDay.get(key(d))?.length ?? 0) > 3 && (
                      <Badge variant="secondary" className="text-[10px]">
                        +{byDay.get(key(d))!.length - 3}
                      </Badge>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
