import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DEFAULT_MEDIA_POLICY,
  mediaUploadSchema,
  type MediaUploadPolicy,
} from "@/lib/media-upload-policy";
import { getMediaPolicy, saveMediaPolicy } from "@/lib/media-policy.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function MediaUploadSettings() {
  const query = useQuery({ queryKey: ["media-upload-policy"], queryFn: () => getMediaPolicy() });
  if (query.isLoading) return <p>Memuat pengaturan media…</p>;
  if (query.error)
    return (
      <p role="alert" className="text-destructive">
        Pengaturan media tidak dapat dimuat.
      </p>
    );
  return (
    <MediaForm key={JSON.stringify(query.data)} initial={query.data ?? DEFAULT_MEDIA_POLICY} />
  );
}
function MediaForm({ initial }: { initial: MediaUploadPolicy }) {
  const [form, setForm] = useState(initial);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async () => {
      await saveMediaPolicy({ data: mediaUploadSchema.parse(form) });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["media-upload-policy"] });
      toast.success("Pengaturan media tersimpan");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const numbers = [
    ["photo_mb", "Batas foto (MB)", 1, 50],
    ["video_mb", "Batas video (MB)", 1, 50],
    ["image_quality", "Kualitas foto (%)", 85, 100],
    ["image_max_edge", "Sisi terpanjang foto (px)", 1920, 4096],
    ["video_mbps", "Kualitas video (Mbps)", 8, 30],
  ] as const;
  return (
    <section className="space-y-4 border-b border-border pb-6">
      <h2 className="text-xl font-semibold">Unggahan & kualitas media</h2>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {numbers.map(([key, label, min, max]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={`media-${key}`}>{label}</Label>
              <Input
                id={`media-${key}`}
                type="number"
                min={min}
                max={max}
                required
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
        {(
          [
            ["compress_images", "Kompresi foto"],
            ["compress_videos", "Kompresi video"],
          ] as const
        ).map(([key, label]) => (
          <div className="flex items-center gap-3" key={key}>
            <Switch
              id={key}
              checked={form[key]}
              onCheckedChange={(v) => setForm({ ...form, [key]: v })}
            />
            <Label htmlFor={key}>{label}</Label>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Video maksimal Full HD, suara dipertahankan. File asli digunakan jika kompresi tidak
          didukung atau tidak lebih kecil. Batas per file hingga 50 MB; kuota paket tetap berlaku.
        </p>
        <Button disabled={save.isPending} variant="gold">
          {save.isPending ? "Menyimpan…" : "Simpan pengaturan media"}
        </Button>
      </form>
    </section>
  );
}
