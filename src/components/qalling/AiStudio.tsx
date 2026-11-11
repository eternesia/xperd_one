import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { AiVideoInterest } from "@/components/qalling/AiVideoInterest";
import { getStudioAccess } from "@/lib/ai-studio.functions";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Akses Studio AI untuk workspace (dipakai tombol di Media dan menu samping). */
export function useStudioAccess(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["ai-studio-access", workspaceId],
    queryFn: () => getStudioAccess({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Titik masuk Studio AI di Media. Bila Studio tersedia → tautan ke halaman Studio;
 * bila belum (fitur OFF untuk pengguna) → tombol "segera hadir" (uji minat).
 */
export function AiStudioEntry({
  workspaceId,
  className,
}: {
  workspaceId: string;
  className?: string;
}) {
  const access = useStudioAccess(workspaceId);
  const { pick } = useI18n();
  if (!access.data?.available)
    return <AiVideoInterest workspaceId={workspaceId} className={className} />;
  return (
    <Link
      to="/qalling/app/studio"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-500/20 dark:text-violet-300",
        className,
      )}
    >
      <Sparkles className="size-3.5" />
      {pick("Photo → AI video", "Foto → Video AI")}
      {access.data.mode === "admin_preview" && (
        <span className="rounded-full bg-amber-500 px-1.5 py-px text-[10px] text-white">
          {pick("admin test", "uji admin")}
        </span>
      )}
    </Link>
  );
}
