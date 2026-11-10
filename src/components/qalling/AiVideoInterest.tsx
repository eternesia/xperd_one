import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { recordFeatureInterest } from "@/lib/feature-interest.functions";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const KEY = "qalling:ai-video-interest";

/** Tombol "segera hadir" untuk menguji minat fitur foto → video AI sebelum dibangun. */
export function AiVideoInterest({
  workspaceId,
  className,
  compact,
}: {
  workspaceId?: string;
  className?: string;
  compact?: boolean;
}) {
  const { pick } = useI18n();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [joined, setJoined] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const rec = useMutation({
    mutationFn: (event: "click" | "want") =>
      recordFeatureInterest({
        data: {
          feature: "ai_photo_video",
          event,
          workspaceId,
          note: event === "want" ? note : undefined,
        },
      }),
  });
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          rec.mutate("click");
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-500/20 dark:text-violet-300",
          className,
        )}
      >
        <Sparkles className="size-3.5" />
        {compact ? pick("AI video", "Video AI") : pick("Photo → AI video", "Foto → Video AI")}
        <span className="rounded-full bg-violet-600 px-1.5 py-px text-[10px] text-white">
          {pick("soon", "segera")}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-violet-600" />
              {pick("AI Studio is coming", "Studio AI segera hadir")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {pick(
                "Turn one product photo into a 5–10 second promo video for Reels and TikTok, saved to Media and ready to schedule. Paid per video with AI credits from your balance.",
                "Ubah satu foto produk menjadi video promo 5–10 detik untuk Reels dan TikTok, tersimpan di Media dan siap dijadwalkan. Dibayar per video memakai kredit AI dari saldo.",
              )}
            </p>
            {joined ? (
              <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-400">
                <Check className="size-4" />
                {pick(
                  "You're on the early list. We'll let you know first.",
                  "Anda sudah masuk daftar awal. Kami kabari lebih dulu.",
                )}
              </p>
            ) : (
              <>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder={pick(
                    "Optional: what videos would you make? (e.g. food, fashion, property)",
                    "Opsional: video apa yang ingin Anda buat? (mis. makanan, fashion, properti)",
                  )}
                />
                <Button
                  className="w-full rounded-full"
                  disabled={rec.isPending}
                  onClick={() =>
                    rec.mutate("want", {
                      onSuccess: () => {
                        try {
                          localStorage.setItem(KEY, "1");
                        } catch {
                          /* abaikan */
                        }
                        setJoined(true);
                        toast.success(
                          pick("Thanks! You're on the list.", "Terima kasih! Anda masuk daftar."),
                        );
                      },
                    })
                  }
                >
                  {pick("I want this, notify me", "Saya mau, kabari saya")}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
