import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppProvider, useApp } from "@/lib/app-context";
import { ThemeProvider } from "@/lib/theme";

export const Route = createFileRoute("/app")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "XPERD One Workspace" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "XPERD One ERP workspace application." },
    ],
  }),
  component: () => (
    <ThemeProvider>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </ThemeProvider>
  ),
});

function AppShell() {
  const { loading, userId, tenant, workspaces } = useApp();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onboarding = pathname.startsWith("/app/onboarding");

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      navigate({ to: "/auth", search: { next: undefined }, replace: true });
      return;
    }
    const needsSetup = !tenant || workspaces.length === 0;
    if (needsSetup && !onboarding) navigate({ to: "/app/onboarding", replace: true });
    if (!needsSetup && onboarding) navigate({ to: "/app", replace: true });
  }, [loading, userId, tenant, workspaces.length, onboarding, navigate]);

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading workspace…</div>;
  }

  if (onboarding) {
    return (
      <div className="min-h-screen bg-secondary/40 px-4 py-10">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30">
      <Outlet />
    </div>
  );
}