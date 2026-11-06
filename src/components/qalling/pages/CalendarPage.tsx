import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
const STATUS_ID: Record<string, string> = {
  published: "Terbit",
  scheduled: "Terjadwal",
  publishing: "Sedang terbit",
  draft: "Draf",
  failed: "Gagal",
};
const parseJson = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};
/** permalinks bisa berupa array URL/objek atau peta akun → URL; ambil semua URL http(s) yang ada. */
function linksOf(v: unknown): string[] {
  const val = parseJson(v);
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (typeof x === "string") {
      if (/^https?:\/\//i.test(x)) out.push(x);
    } else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x as Record<string, unknown>).forEach(walk);
  };
  walk(val);
  return [...new Set(out)];
}
type CalPost = {
  id: string;
  title?: string;
  status: string;
  scheduled_at: string;
  account_ids: string[];
  caption?: string | null;
  first_comment?: string | null;
  last_error?: string | null;
  media_paths?: unknown;
  media_url?: string | null;
  permalinks?: unknown;
};

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
        account_name?: string | null;
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
  const [openDay, setOpenDay] = useState<Date | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
          caption: string | null;
          first_comment: string | null;
          last_error: string | null;
          media_paths: unknown;
          media_url: string | null;
          permalinks: unknown;
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
    const m = new Map<string, CalPost[]>();
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
              className={cn(
                "min-h-24 border-b border-r border-border p-1.5",
                !d && "bg-muted/30",
                d && (byDay.get(key(d))?.length ?? 0) > 0 && "cursor-pointer hover:bg-muted/40",
              )}
              role={d && (byDay.get(key(d))?.length ?? 0) > 0 ? "button" : undefined}
              tabIndex={d && (byDay.get(key(d))?.length ?? 0) > 0 ? 0 : undefined}
              aria-label={
                d
                  ? `${d.getDate()} ${cursor.toLocaleDateString(lang === "id" ? "id-ID" : "en-US", { month: "long" })}: ${byDay.get(key(d))?.length ?? 0} postingan`
                  : undefined
              }
              onClick={() => {
                if (d && (byDay.get(key(d))?.length ?? 0) > 0) {
                  setSelectedId(null);
                  setOpenDay(d);
                }
              }}
              onKeyDown={(e) => {
                if (
                  (e.key === "Enter" || e.key === " ") &&
                  d &&
                  (byDay.get(key(d))?.length ?? 0) > 0
                ) {
                  e.preventDefault();
                  setSelectedId(null);
                  setOpenDay(d);
                }
              }}
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

      <DayDialog
        day={openDay}
        posts={openDay ? (byDay.get(key(openDay)) ?? []) : []}
        accounts={accounts}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onClose={() => setOpenDay(null)}
        lang={lang}
      />
    </div>
  );
}

function DayDialog({
  day,
  posts,
  accounts,
  selectedId,
  onSelect,
  onClose,
  lang,
}: {
  day: Date | null;
  posts: CalPost[];
  accounts: { id: string; platform: string; account_name?: string | null }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  lang: string;
}) {
  const locale = lang === "id" ? "id-ID" : "en-US";
  const sorted = useMemo(
    () => [...posts].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
    [posts],
  );
  const current = sorted.find((p) => p.id === selectedId) ?? sorted[0];
  const time = (p: CalPost) =>
    new Date(p.scheduled_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const media = useMemo(() => {
    if (!current) return [] as string[];
    const m = parseJson(current.media_paths);
    const paths = Array.isArray(m) ? m.map(String) : [];
    return paths.map((x) => `/api/workspace-files?path=${encodeURIComponent(x)}`);
  }, [current]);
  const accs = current ? accounts.filter((a) => current.account_ids.includes(a.id)) : [];
  const links = current ? linksOf(current.permalinks) : [];
  return (
    <Dialog open={!!day} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {day?.toLocaleDateString(locale, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </DialogTitle>
          <DialogDescription>{sorted.length} postingan pada tanggal ini</DialogDescription>
        </DialogHeader>
        {sorted.length > 1 && (
          <select
            value={current?.id}
            onChange={(e) => onSelect(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Pilih postingan"
          >
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>
                {time(p)} · {p.title || "(tanpa judul)"} · {STATUS_ID[p.status] ?? p.status}
              </option>
            ))}
          </select>
        )}
        {current && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={cn("border-transparent", tone[current.status] ?? tone.draft)}>
                {STATUS_ID[current.status] ?? current.status}
              </Badge>
              <span className="text-muted-foreground">{time(current)} WIB</span>
            </div>
            <h3 className="text-base font-semibold">{current.title || "(tanpa judul)"}</h3>
            {accs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {accs.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                  >
                    <SocialIcon platform={a.platform} className="h-3 w-3" />
                    {a.account_name || a.platform}
                  </span>
                ))}
              </div>
            )}
            {current.caption && (
              <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3">{current.caption}</p>
            )}
            {media.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {media.slice(0, 6).map((u) => (
                  <img
                    key={u}
                    src={u}
                    alt=""
                    loading="lazy"
                    className="aspect-square w-full rounded-md border object-cover"
                  />
                ))}
              </div>
            )}
            {current.first_comment && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Komentar pertama:</span> {current.first_comment}
              </p>
            )}
            {current.last_error && current.status === "failed" && (
              <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                {current.last_error}
              </p>
            )}
            {links.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {links.slice(0, 5).map((u) => (
                  <a
                    key={u}
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary underline"
                  >
                    <ExternalLink className="h-3 w-3" /> Lihat postingan
                  </a>
                ))}
              </div>
            )}
            <Button asChild variant="outline" size="sm">
              <Link to="/qalling/app/$submoduleId" params={{ submoduleId: "post-scheduler" }}>
                Buka di Penjadwal
              </Link>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
