import { createFileRoute } from "@tanstack/react-router";

import { CrmDashboardView } from "@/components/app/CrmInsights";
import { HrDashboard } from "@/components/app/HrDashboard";
import { ModuleDashboard } from "@/components/app/ModuleDashboard";
import { OmnixDashboard } from "@/components/app/OmnixViews";
import { XproDashboard } from "@/components/app/XproViews";
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
  // Ronde 33 (BS New 10): dasbor proyek XPro.
  if (moduleId === "xpro") return <XproDashboard workspaceId={workspaceId} />;
  // Ronde 34: halaman index modul CRM memakai dasbor CRM yang sama dengan
  // submodul `crm/dashboard` (live menampilkan dasbor nyata, bukan placeholder).
  if (moduleId === "crm") return <CrmDashboardView workspaceId={workspaceId} />;
  // Ronde 34: dasbor Omni-channel (live: "Omni-channel Dashboard").
  if (moduleId === "omnix") return <OmnixDashboard workspaceId={workspaceId} />;
  return <ModuleDashboard mod={mod} workspaceId={workspaceId} />;
}
