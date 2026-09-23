import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, LayoutDashboard, Lock } from "lucide-react";

import { useTenantAddons } from "@/lib/addons";
import { useI18n } from "@/lib/i18n";
import { findModule } from "@/lib/modules";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/w/$workspaceId/$moduleId")({
  component: ModuleShell,
});

function ModuleShell() {
  const { workspaceId, moduleId } = Route.useParams();
  const { lang } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const mod = findModule(moduleId);
  const { hasAddon, loading: addonsLoading } = useTenantAddons();

  if (!mod) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-center">
        <h1 className="text-xl font-semibold text-navy dark:text-primary-foreground">
          {lang === "id" ? "Modul tidak ditemukan" : "Module not found"}
        </h1>
        <Link
          to="/app/w/$workspaceId"
          params={{ workspaceId }}
          className="mt-4 inline-block text-sm text-gold underline"
        >
          {lang === "id" ? "Kembali ke peluncur" : "Back to launcher"}
        </Link>
      </div>
    );
  }

  if (mod.addon && !addonsLoading && !hasAddon(mod.addon)) {
    return (
      <div className="mx-auto max-w-lg px-5 py-20 text-center">
        <Lock className="mx-auto h-8 w-8 text-gold" />
        <h1 className="mt-4 text-xl font-semibold text-navy dark:text-primary-foreground">
          {lang === "id" ? `${mod.id_} belum aktif` : `${mod.en} is not active`}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {lang === "id"
            ? "Modul ini tersedia sebagai add-on berbayar. Hubungi tim XPERD atau buka halaman Billing untuk mengaktifkannya."
            : "This module is a paid add-on. Contact the XPERD team or open Billing to activate it."}
        </p>
        <Link
          to="/app/w/$workspaceId/billing"
          params={{ workspaceId }}
          className="mt-4 inline-block text-sm text-gold underline"
        >
          {lang === "id" ? "Buka Billing" : "Open Billing"}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-card p-4 md:flex">
        <Link
          to="/app/w/$workspaceId"
          params={{ workspaceId }}
          className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-navy/90"
        >
          <ChevronLeft className="h-4 w-4" /> {lang === "id" ? "Semua Modul" : "All Modules"}
        </Link>

        <div className="flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2">
          <mod.icon className="h-4 w-4 text-gold" />
          <span className="text-sm font-semibold text-navy dark:text-primary-foreground">
            {lang === "id" ? mod.id_ : mod.en}
          </span>
        </div>

        <nav className="mt-4 flex flex-col gap-1">
          <Link
            to="/app/w/$workspaceId/$moduleId"
            params={{ workspaceId, moduleId: mod.id }}
            activeOptions={{ exact: true }}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
              pathname === `/app/w/${workspaceId}/${mod.id}` &&
                "bg-navy text-primary-foreground hover:bg-navy hover:text-primary-foreground",
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            {lang === "id" ? "Dasbor" : "Dashboard"}
          </Link>
          {mod.submodules.map((sub) => {
            const to = `/app/w/${workspaceId}/${mod.id}/${sub.id}`;
            return (
              <Link
                key={sub.id}
                to="/app/w/$workspaceId/$moduleId/$submoduleId"
                params={{ workspaceId, moduleId: mod.id, submoduleId: sub.id }}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                  pathname === to && "bg-navy text-primary-foreground hover:bg-navy hover:text-primary-foreground",
                )}
              >
                {lang === "id" ? sub.id_ : sub.en}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex gap-2 overflow-x-auto border-b border-border bg-card px-4 py-3 md:hidden">
          <Link
            to="/app/w/$workspaceId/$moduleId"
            params={{ workspaceId, moduleId: mod.id }}
            className="whitespace-nowrap rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
          >
            {lang === "id" ? "Dasbor" : "Dashboard"}
          </Link>
          {mod.submodules.map((sub) => (
            <Link
              key={sub.id}
              to="/app/w/$workspaceId/$moduleId/$submoduleId"
              params={{ workspaceId, moduleId: mod.id, submoduleId: sub.id }}
              className="whitespace-nowrap rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
            >
              {lang === "id" ? sub.id_ : sub.en}
            </Link>
          ))}
        </div>
        <main className="p-6 lg:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}