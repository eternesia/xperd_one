/**
 * Studio Video: popup contoh video per tipe template, supaya pengguna tahu bentuk tiap template
 * (mis. "Motion Grafis") sebelum memilih. Contoh dipilih Super Admin dari hasil render nyata.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TEMPLATES } from "@/lib/ai-templates";
import { getTemplateSamples } from "@/lib/ai-studio.functions";
import { cn } from "@/lib/utils";

export function useTemplateSamples() {
  return useQuery({
    queryKey: ["template-samples"],
    queryFn: () => getTemplateSamples(),
    staleTime: 10 * 60_000,
  });
}

const aspect = (ratio: string) =>
  ratio === "16:9" ? "aspect-video" : ratio === "1:1" ? "aspect-square" : "aspect-[9/16]";

export function TemplateSampleDialog({
  open,
  initialKey,
  lang,
  onClose,
  onUse,
}: {
  open: boolean;
  initialKey: string;
  lang: "id" | "en";
  onClose: () => void;
  onUse?: (key: string) => void;
}) {
  const id = lang === "id";
  const { data: samples = {} } = useTemplateSamples();
  const [key, setKey] = useState(initialKey);
  useEffect(() => {
    if (open) setKey(initialKey);
  }, [open, initialKey]);
  const idx = Math.max(
    0,
    TEMPLATES.findIndex((t) => t.key === key),
  );
  const tpl = TEMPLATES[idx];
  const sample = samples[tpl.key];
  const go = (d: number) => setKey(TEMPLATES[(idx + d + TEMPLATES.length) % TEMPLATES.length].key);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{id ? `Contoh: ${tpl.name}` : `Sample: ${tpl.name_en}`}</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-sm text-muted-foreground">{id ? tpl.hint : tpl.hint_en}</p>
        <div className="relative flex items-center justify-center rounded-2xl bg-black/90 p-2">
          {sample ? (
            <video
              key={sample.url}
              src={sample.url}
              className={cn("max-h-[60vh] w-auto rounded-xl", aspect(sample.ratio))}
              autoPlay
              muted
              loop
              playsInline
              controls
            />
          ) : (
            <div className="flex aspect-[9/16] max-h-[50vh] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/70">
              <PlayCircle className="h-10 w-10 opacity-50" />
              {id
                ? "Contoh untuk template ini belum tersedia."
                : "No sample for this template yet."}
            </div>
          )}
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-black shadow"
            aria-label={id ? "Sebelumnya" : "Previous"}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-black shadow"
            aria-label={id ? "Berikutnya" : "Next"}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setKey(t.key)}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
                t.key === tpl.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {samples[t.key] && <PlayCircle className="h-3 w-3" />}
              {id ? t.name : t.name_en}
            </button>
          ))}
        </div>
        {onUse && (
          <Button
            variant="gold"
            onClick={() => {
              onUse(tpl.key);
              onClose();
            }}
          >
            {id ? `Pakai template ${tpl.name}` : `Use ${tpl.name_en}`}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
