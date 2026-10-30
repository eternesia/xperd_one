import { createFileRoute } from "@tanstack/react-router";

import { CrmView } from "@/components/app/CrmViews";
import { useApp } from "@/lib/app-context";
import { findModule } from "@/lib/modules";

export const Route = createFileRoute("/qalling/app/$submoduleId")({
  head: ({ params }) => {
    const name =
      findModule("crm")?.submodules.find((s) => s.id === params.submoduleId)?.en ?? "CRM";
    const title = `${name} | Qalling CRM`;
    const description = `Manage ${name.toLowerCase()} in your Qalling CRM workspace.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: QallingSubmodule,
});

function QallingSubmodule() {
  const { submoduleId } = Route.useParams();
  const { activeWorkspace, accessLoading, canViewSubmodule } = useApp();
  const valid = findModule("crm")?.submodules.some((s) => s.id === submoduleId);
  if (!activeWorkspace) return null;
  if (accessLoading) return null;
  if (!canViewSubmodule("crm", submoduleId))
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Fitur tidak tersedia untuk paket atau akses Anda.
      </div>
    );
  if (!valid) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">Menu tidak ditemukan.</div>
    );
  }
  return <CrmView submoduleId={submoduleId} workspaceId={activeWorkspace.id} />;
}
