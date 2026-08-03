import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";

import { AppTopbar } from "@/components/app/AppTopbar";
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
      <Outlet />
    </div>
  );
}