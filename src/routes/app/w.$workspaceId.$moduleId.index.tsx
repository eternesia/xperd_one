import { createFileRoute } from "@tanstack/react-router";

import { HrDashboard } from "@/components/app/HrDashboard";
import { ModuleDashboard } from "@/components/app/ModuleDashboard";
import { findModule } from "@/lib/modules";

export const Route = createFileRoute("/app/w/$workspaceId/$moduleId/")({
  component: ModuleOverview,
});

function ModuleOverview() {
  const { workspaceId, moduleId } = Route.useParams();
  const mod = findModule(moduleId);
  if (!mod) return null;
  // Batch 2: modul HR punya dasbor payroll sendiri (paritas Business Suite New 2).
  if (moduleId === "hr") return <HrDashboard workspaceId={workspaceId} />;
  return <ModuleDashboard mod={mod} workspaceId={workspaceId} />;
}
