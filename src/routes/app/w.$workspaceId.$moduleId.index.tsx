import { createFileRoute } from "@tanstack/react-router";

import { ModuleDashboard } from "@/components/app/ModuleDashboard";
import { findModule } from "@/lib/modules";

export const Route = createFileRoute("/app/w/$workspaceId/$moduleId/")({
  component: ModuleOverview,
});

function ModuleOverview() {
  const { workspaceId, moduleId } = Route.useParams();
  const mod = findModule(moduleId);
  if (!mod) return null;
  return <ModuleDashboard mod={mod} workspaceId={workspaceId} />;
}
