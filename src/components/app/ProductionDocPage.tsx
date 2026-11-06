import { Lock } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { ProductionBomForm } from "@/components/app/ProductionBomForm";
import { ProductionOrderForm } from "@/components/app/ProductionOrderForm";
import { ProductionQualityDoc } from "@/components/app/ProductionQualityDoc";
import { ProductionWorkCenterDoc } from "@/components/app/ProductionWorkCenterDoc";

/**
 * Halaman penuh untuk dokumen Production (pengganti modal). URL: /app/w/<ws>/manufacturing/<menu>/<docId>
 * docId = "new" untuk membuat, atau id dokumen. Menu quality memakai awalan: spec-new, spec-<id>, insp-<id>, dev-new, dev-<id>.
 */
export function ProductionDocPage({ workspaceId, section, docId }: { workspaceId: string; section: string; docId: string }) {
  const { accessLoading, canViewSubmodule } = useApp();
  if (accessLoading) return <p className="text-sm text-muted-foreground">Memuat akses…</p>;
  if (!canViewSubmodule("manufacturing", section))
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">Akses submodul dibatasi</h1>
      </div>
    );
  if (section === "boms") return <ProductionBomForm workspaceId={workspaceId} docId={docId} />;
  if (section === "orders") return <ProductionOrderForm workspaceId={workspaceId} docId={docId} />;
  if (section === "quality") return <ProductionQualityDoc workspaceId={workspaceId} docId={docId} />;
  if (section === "work-centers") return <ProductionWorkCenterDoc workspaceId={workspaceId} docId={docId} />;
  return <p className="text-sm text-muted-foreground">Halaman tidak tersedia.</p>;
}
