import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Megaphone, Sparkles, Tag, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listMyAnnouncements } from "@/lib/support.functions";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SEEN = "qalling_seen_announcements";
const readSeen = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN) ?? "[]");
  } catch {
    return [];
  }
};
const ICON: Record<string, typeof Bell> = {
  promo: Tag,
  update: Sparkles,
  warning: TriangleAlert,
  critical: TriangleAlert,
};

/** Ikon notifikasi di navbar: pengumuman update/promo dari Super Admin; titik merah untuk yang belum dibaca. */
export function AnnouncementBell() {
  const { tenant } = useApp();
  const { pick, lang } = useI18n();
  const [seen, setSeen] = useState<string[]>(readSeen);
  const q = useQuery({
    queryKey: ["my-announcements", tenant?.id ?? null],
    queryFn: () => listMyAnnouncements({ data: { tenantId: tenant?.id ?? null } }),
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
  });
  const items = q.data ?? [];
  const unread = items.filter((a) => !seen.includes(a.id)).length;
  const markAll = () => {
    const ids = [...new Set([...seen, ...items.map((a) => a.id)])].slice(-200);
    try {
      localStorage.setItem(SEEN, JSON.stringify(ids));
    } catch {
      /* penyimpanan tidak tersedia */
    }
    setSeen(ids);
  };
  return (
    <Popover onOpenChange={(o) => o && unread && setTimeout(markAll, 1500)}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={pick("Notifications", "Notifikasi")}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">{pick("Notifications", "Notifikasi")}</p>
          {unread > 0 && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={markAll}
            >
              {pick("Mark all read", "Tandai sudah dibaca")}
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {pick("No announcements right now.", "Belum ada pengumuman.")}
            </p>
          ) : (
            items.map((a) => {
              const Icon = ICON[a.severity] ?? Megaphone;
              const title = lang === "id" ? a.title_id || a.title_en : a.title_en;
              const body = lang === "id" ? a.body_id || a.body_en : a.body_en || a.body_id;
              return (
                <div
                  key={a.id}
                  className={cn(
                    "flex gap-3 border-b px-4 py-3 last:border-0",
                    !seen.includes(a.id) && "bg-sky-50 dark:bg-secondary/40",
                  )}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      a.severity === "promo"
                        ? "text-gold"
                        : a.severity === "critical" || a.severity === "warning"
                          ? "text-destructive"
                          : "text-primary",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{title}</p>
                    {body && (
                      <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">
                        {body}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(`${a.starts_at.replace(" ", "T")}Z`).toLocaleDateString(
                        lang === "id" ? "id-ID" : "en-US",
                        { dateStyle: "medium" },
                      )}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
