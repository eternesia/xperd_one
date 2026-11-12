/** Panjang caption per platform yang dipilih (composer Qalling): aman / jadi utas / akan gagal. */
import { AlertTriangle, CheckCircle2, ListOrdered } from "lucide-react";

import { checkCaption, PLATFORM_LABEL } from "@/lib/caption-limits";
import { cn } from "@/lib/utils";

export function CaptionLimitHints({
  platforms,
  caption,
  hasMedia,
  lang,
  className,
}: {
  platforms: string[];
  caption: string;
  hasMedia: boolean;
  lang: "id" | "en";
  className?: string;
}) {
  const id = lang === "id";
  const verdicts = [...new Set(platforms)]
    .map((p) => checkCaption(p, caption, { hasMedia }))
    .filter((v): v is NonNullable<typeof v> => !!v);
  if (!caption || !verdicts.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {verdicts.map((v) => {
        const label = PLATFORM_LABEL[v.platform] ?? v.platform;
        const split = v.ok && "threadParts" in v;
        return (
          <span
            key={v.platform}
            title={
              !v.ok
                ? id
                  ? `${v.error}. Akun ${label} akan gagal; akun lain tetap terbit.`
                  : `Over the ${label} limit. ${label} will fail; other accounts still publish.`
                : split
                  ? id
                    ? `Lebih dari ${v.max} karakter: dibagi otomatis menjadi utas ${v.threadParts} bagian.`
                    : `Over ${v.max} characters: split automatically into a ${v.threadParts}-part thread.`
                  : undefined
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] tabular-nums",
              !v.ok
                ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
                : split
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                  : "border-border text-muted-foreground",
            )}
          >
            {!v.ok ? (
              <AlertTriangle className="size-3" />
            ) : split ? (
              <ListOrdered className="size-3" />
            ) : (
              <CheckCircle2 className="size-3 text-emerald-600" />
            )}
            {label} {v.length}/{v.max}
            {split && (id ? ` · utas ${v.threadParts}` : ` · ${v.threadParts}-part thread`)}
            {!v.ok && (id ? " · akan gagal" : " · will fail")}
          </span>
        );
      })}
    </div>
  );
}
