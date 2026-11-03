import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listWorkspaceRows } from "@/lib/data.functions";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { SocialIcon } from "@/components/qalling/SocialIcon";
import { cn } from "@/lib/utils";

const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const tone: Record<string, string> = {
  published: "bg-primary/15 text-primary",
  scheduled: "bg-accent text-accent-foreground",
  draft: "bg-muted text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
};
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function CalendarPage() {
  const { activeWorkspace } = useApp();
  const { pick, lang } = useI18n();
  const { data: accounts = [] } = useQuery({
    queryKey: ["qalling-calendar-accounts", activeWorkspace?.id],
    enabled: Boolean(activeWorkspace),
    queryFn: async () => {
      if (!activeWorkspace) return [];
      const res = await listWorkspaceRows({
        data: { table: "crm_social_accounts", workspaceId: activeWorkspace.id, limit: 500 },
      });
      return (res?.rows ?? []) as {
        id: string;
        platform: string;
        client_group_id: string | null;
      }[];
    },
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["client-groups", activeWorkspace?.id],
    enabled: Boolean(activeWorkspace),
    queryFn: async () => {
      const res = await listWorkspaceRows({
        data: {
          table: "crm_client_groups",
          workspaceId: activeWorkspace!.id,
          orderBy: "name",
          orderDir: "asc",
          limit: 500,
        },
      });
      return (res?.rows ?? []) as { id: string; name: string }[];
    },
  });
  const [client, setClient] = useState("all");
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
      if (!activeWorkspace) return [];
      const res = await listWorkspaceRows({
        data: {
          table: "crm_scheduled_posts",
          workspaceId: activeWorkspace.id,
          orderBy: "scheduled_at",
          orderDir: "asc",
          limit: 2000,
        },
      });
      const arr = (v: unknown): string[] =>
        typeof v === "string" ? JSON.parse(v) : Array.isArray(v) ? (v as string[]) : [];
      return (
        (res?.rows ?? []) as {
          id: string;
          title: string | null;
          status: string;
          scheduled_at: string;
          account_ids: unknown;
        }[]
      )
        .map((p) => ({
          ...p,
          title: p.title ?? undefined,
          account_ids: arr(p.account_ids),
          scheduled_at: new Date(`${String(p.scheduled_at).replace(" ", "T")}Z`).toISOString(),
        }))
        .filter((p) => p.scheduled_at >= start.toISOString() && p.scheduled_at < end.toISOString());
    },
  });
  const byDay = useMemo(() => {
    const m = new Map<string, typeof posts>();
    const ids = new Set(accounts.filter((a) => a.client_group_id === client).map((a) => a.id));
    for (const p of posts) {
      if (client !== "all" && !p.account_ids.some((x: string) => ids.has(x))) continue;
      const k = key(new Date(p.scheduled_at));
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [posts, accounts, client]);
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
          <h1 className="text-2xl font-semibold">{pick("Content calendar", "Kalender Konten")}</h1>
          <p className="text-sm text-muted-foreground">{posts.length} postingan bulan ini</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {groups.length > 0 && (
            <select
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              aria-label={pick("Client", "Klien")}
            >
              <option value="all">{pick("All clients", "Semua klien")}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label="Bulan sebelumnya"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">
            {cursor.toLocaleDateString(lang === "id" ? "id-ID" : "en-US", {
              month: "long",
              year: "numeric",
            })}
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
          {(lang === "id" ? DAYS : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]).map((d) => (
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
                        <span className="inline-flex gap-1">
                          {accounts
                            .filter((a) => p.account_ids.includes(a.id))
                            .slice(0, 2)
                            .map((a) => (
                              <SocialIcon key={a.id} platform={a.platform} className="h-3 w-3" />
                            ))}
                        </span>{" "}
                        {new Date(p.scheduled_at).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        {p.title}
                      </div>
                    ))}
                    {(byDay.get(key(d))?.length ?? 0) > 3 && (
                      <Badge variant="secondary" className="text-[10px]">
                        +{(byDay.get(key(d))?.length ?? 0) - 3}
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
