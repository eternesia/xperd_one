import { createFileRoute } from "@tanstack/react-router";

import { CrmView } from "@/components/app/CrmViews";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { findModule } from "@/lib/modules";

export const Route = createFileRoute("/qalling/app/$submoduleId")({
  component: QallingSubmodule,
});

function QallingSubmodule() {
  const { submoduleId } = Route.useParams();
  const { activeWorkspace, accessLoading, canViewSubmodule } = useApp();
  const { pick } = useI18n();
  const valid = findModule("crm")?.submodules.some((s) => s.id === submoduleId) ?? false;

  if (!activeWorkspace) return null;
  if (!valid || (!accessLoading && !canViewSubmodule("crm", submoduleId))) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        {pick("Menu not found.", "Menu tidak ditemukan.")}
      </div>
    );
  }
  return <CrmView submoduleId={submoduleId} workspaceId={activeWorkspace.id} />;
}
