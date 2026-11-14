import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";

import { AppTopbar } from "@/components/app/AppTopbar";
import { LicenseBanner } from "@/components/app/LicenseBanner";
import { MobileBottomNav } from "@/components/app/MobileBottomNav";
import { useApp } from "@/lib/app-context";

export const Route = createFileRoute("/app/w/$workspaceId")({
  component: WorkspaceShell,
});

function WorkspaceShell() {
  const { workspaceId } = Route.useParams();
  const { workspaces, activeWorkspace, setActiveWorkspaceId } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!workspaces.length) return;
    const found = workspaces.find((w) => w.id === workspaceId);
    if (!found) {
      navigate({ to: "/app", replace: true });
      return;
    }
    if (activeWorkspace?.id !== found.id) setActiveWorkspaceId(found.id);
  }, [workspaces, workspaceId, activeWorkspace?.id, setActiveWorkspaceId, navigate]);

  return (
    <div className="min-h-screen bg-secondary/30">
      <AppTopbar workspaceId={workspaceId} />
      <LicenseBanner />
      {/* q-cards: tabel jadi kartu berlabel, tab pil, kartu bulat di HP (<768px); pb-28 agar tidak tertutup navigasi bawah. */}
      <main className="q-cards min-w-0 overflow-x-clip pb-28 lg:pb-0">
        <Outlet />
      </main>
      <MobileBottomNav workspaceId={workspaceId} />
    </div>
  );
}
