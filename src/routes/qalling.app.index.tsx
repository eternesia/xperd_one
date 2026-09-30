import { createFileRoute } from "@tanstack/react-router";

import { CrmDashboardView } from "@/components/app/CrmInsights";
import { useApp } from "@/lib/app-context";

export const Route = createFileRoute("/qalling/app/")({
  component: QallingDashboard,
});

function QallingDashboard() {
  const { activeWorkspace } = useApp();
  if (!activeWorkspace) return null;
  return <CrmDashboardView workspaceId={activeWorkspace.id} />;
}
