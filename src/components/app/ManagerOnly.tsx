import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";

/**
 * Pembatas halaman pengelolaan workspace (Tim, Pengaturan, Tagihan & Paket, Backup):
 * hanya owner atau admin bawaan. Peran kustom dan staff/viewer melihat pesan tanpa akses.
 */
export function ManagerOnly({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: React.ReactNode;
}) {
  const { accessLoading, workspaceRole, isWorkspaceManager } = useApp();
  const { lang } = useI18n();
  if (accessLoading || !workspaceRole) return null;
  if (isWorkspaceManager) return <>{children}</>;
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <Lock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="mt-4 text-lg font-semibold text-navy dark:text-foreground">
        {lang === "id" ? "Khusus owner dan admin" : "Owners and admins only"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {lang === "id"
          ? "Halaman ini untuk pengelola workspace. Minta owner workspace bila Anda butuh akses."
          : "This page is for workspace managers. Ask the workspace owner if you need access."}
      </p>
      <Button asChild variant="navy" className="mt-6">
        <Link to="/app/w/$workspaceId" params={{ workspaceId }}>
          {lang === "id" ? "Kembali ke peluncur" : "Back to launcher"}
        </Link>
      </Button>
    </div>
  );
}
