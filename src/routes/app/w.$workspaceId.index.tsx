import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Lock } from "lucide-react";

import launcherBg from "@/assets/launcher-vector-bg.jpg";
import { Badge } from "@/components/ui/badge";
import { TrialBanner } from "@/components/app/TrialBanner";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { APP_MODULES, LAUNCHER_UTILITIES, TONE_CLASS } from "@/lib/modules";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/w/$workspaceId/")({
  component: Launcher,
});

function Launcher() {
  const { workspaceId } = Route.useParams();
  const { activeWorkspace } = useApp();
  const { lang } = useI18n();

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <img
        src={launcherBg}
        alt=""
        aria-hidden
        width={1920}
        height={1080}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-background/35 dark:bg-background/65" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col justify-center px-5 py-8">
        <div className="mb-4">
          <TrialBanner workspaceId={workspaceId} />
        </div>
        <div className="text-center">
          <p className="text-[11px] font-semibold tracking-[0.32em] text-gold">
            {lang === "id" ? "PELUNCUR MODUL" : "MODULE LAUNCHER"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-navy dark:text-primary-foreground lg:text-3xl">
            {activeWorkspace?.name}
          </h1>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {APP_MODULES.map((m) => {
            const inner = (
              <>
                <div className="flex items-start justify-between">
                  <span className={`grid h-11 w-11 place-items-center rounded-xl ${TONE_CLASS[m.tone]}`}>
                    <m.icon className="h-5 w-5" />
                  </span>
                  {m.disabled && (
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Lock className="h-3 w-3" /> {lang === "id" ? "Segera" : "Soon"}
                    </Badge>
                  )}
                </div>
                <p className="mt-3 text-sm font-semibold text-navy dark:text-primary-foreground">
                  {lang === "id" ? m.id_ : m.en}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {lang === "id" ? m.descId : m.descEn}
                </p>
                <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-muted-foreground group-hover:text-gold">
                  {m.submodules.length} {lang === "id" ? "sub modul" : "sub modules"}
                  <ArrowUpRight className="h-3 w-3" />
                </p>
              </>
            );
            const base =
              "group relative overflow-hidden rounded-2xl border border-border bg-card/90 p-4 shadow-sm backdrop-blur transition-all";
            if (m.disabled) {
              return (
                <div key={m.id} className={cn(base, "cursor-not-allowed opacity-50")} aria-disabled>
                  {inner}
                </div>
              );
            }
            return (
              <Link
                key={m.id}
                to="/app/w/$workspaceId/$moduleId"
                params={{ workspaceId, moduleId: m.id }}
                className={cn(base, "hover:-translate-y-1 hover:border-gold hover:shadow-xl")}
              >
                {inner}
              </Link>
            );
          })}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LAUNCHER_UTILITIES.map((u) => (
            <Link
              key={u.id}
              to={u.to}
              params={{ workspaceId }}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-card/90 p-4 shadow-sm backdrop-blur transition-all hover:-translate-y-1 hover:border-gold hover:shadow-xl"
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONE_CLASS[u.tone]}`}>
                <u.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-navy dark:text-primary-foreground">
                  {lang === "id" ? u.id_ : u.en}
                </span>
                <span className="mt-0.5 block line-clamp-1 text-xs text-muted-foreground">
                  {lang === "id" ? u.descId : u.descEn}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}