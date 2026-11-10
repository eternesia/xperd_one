import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlarmClock, AlertTriangle, Bell, CheckCheck, MessageSquare, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type AppNotification,
  listMyNotifications,
  markNotificationsRead,
} from "@/lib/xpro-tasks.functions";

const ICON: Record<string, typeof Bell> = {
  xpro_assigned: UserPlus,
  xpro_comment: MessageSquare,
  xpro_due: AlarmClock,
  xpro_today: AlarmClock,
  xpro_late: AlertTriangle,
};

function ago(iso: string, id: boolean) {
  const mins = Math.max(
    0,
    Math.round((Date.now() - Date.parse(iso.replace(" ", "T") + "Z")) / 60000),
  );
  if (mins < 1) return id ? "baru saja" : "just now";
  if (mins < 60) return id ? `${mins} mnt lalu` : `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return id ? `${h} jam lalu` : `${h}h ago`;
  const d = Math.round(h / 24);
  return id ? `${d} hari lalu` : `${d}d ago`;
}

/** Bel notifikasi in-app (tugas XPro: ditugaskan, komentar, tenggat, terlambat). */
export function NotificationBell({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const id = lang === "id";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const key = ["notifications", workspaceId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => listMyNotifications({ data: { workspaceId } }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const read = useMutation({
    mutationFn: (ids: string[] | "all") => markNotificationsRead({ data: { workspaceId, ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const items = q.data?.items ?? [];
  const unread = q.data?.unread ?? 0;

  const openItem = (n: AppNotification) => {
    if (!n.read_at) read.mutate([n.id]);
    setOpen(false);
    if (n.link) navigate({ to: n.link as "/app" });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            id ? `Notifikasi (${unread} belum dibaca)` : `Notifications (${unread} unread)`
          }
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium">{id ? "Notifikasi" : "Notifications"}</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => read.mutate("all")}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {id ? "Tandai semua dibaca" : "Mark all read"}
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {!items.length && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {id ? "Belum ada notifikasi." : "No notifications yet."}
            </p>
          )}
          {items.map((n) => {
            const Icon = ICON[n.kind] ?? Bell;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => openItem(n)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/50",
                  !n.read_at && "bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary",
                    n.kind === "xpro_late" && "bg-destructive/10 text-destructive",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", !n.read_at && "font-medium")}>
                    {n.title}
                  </span>
                  {n.body && (
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                      {n.body}
                    </span>
                  )}
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {ago(n.created_at, id)}
                  </span>
                </span>
                {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-gold" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
