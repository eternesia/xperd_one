import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Status produksi disederhanakan: Draft / Approved (turunan eksekusi ditampilkan sebagai progres). */
export function StatusPill({ status }: { status: string }) {
  const approved = ["approved", "planned", "released", "in_progress", "qc_pending", "completed", "closed", "passed"].includes(status);
  const label = status === "draft" ? "Draft" : approved ? "Approved" : status;
  return <Badge variant={status === "draft" ? "secondary" : approved ? "default" : "destructive"}>{label}</Badge>;
}

/** Kerangka halaman penuh untuk form buat/ubah (pengganti modal). */
export function ProductionPageShell({
  workspaceId,
  section,
  title,
  subtitle,
  status,
  actions,
  children,
}: {
  workspaceId: string;
  section: string;
  title: string;
  subtitle?: string;
  status?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/app/w/$workspaceId/$moduleId/$submoduleId"
            params={{ workspaceId, moduleId: "manufacturing", submoduleId: section }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Kembali ke daftar
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{title}</h1>
            {status ? <StatusPill status={status} /> : null}
          </div>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      {children}
    </div>
  );
}
