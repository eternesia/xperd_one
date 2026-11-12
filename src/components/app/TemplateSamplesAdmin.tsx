/** Super Admin → Studio AI → Template: pilih contoh video per tipe template dari hasil render. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlayCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AdminSelect } from "@/components/app/admin-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TEMPLATES } from "@/lib/ai-templates";
import { adminSetTemplateSample, adminTemplateSamples } from "@/lib/ai-studio.functions";

export function TemplateSamplesAdmin() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-template-samples"],
    queryFn: () => adminTemplateSamples(),
  });
  const [pick, setPick] = useState<Record<string, string>>({});
  const set = useMutation({
    mutationFn: (v: { key: string; jobId: string | null }) => adminSetTemplateSample({ data: v }),
    onSuccess: (_, v) => {
      toast.success(v.jobId ? "Contoh disimpan" : "Contoh dihapus");
      void qc.invalidateQueries({ queryKey: ["admin-template-samples"] });
      void qc.invalidateQueries({ queryKey: ["template-samples"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const d = q.data;
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="max-w-2xl space-y-1">
          <p className="flex items-center gap-2 font-semibold">
            <PlayCircle className="h-4 w-4 text-gold" /> Contoh video per template
          </p>
          <p className="text-sm text-muted-foreground">
            Ditampilkan ke pengguna lewat tombol “Lihat contoh video” di Studio, supaya mereka tahu
            bentuk tiap template sebelum memilih. Buat video template di workspace Anda (mode uji),
            lalu pilih hasilnya di sini. Berkas disalin, jadi aman walau media aslinya dihapus.
          </p>
        </div>
        {q.isLoading || !d ? (
          <p className="text-sm text-muted-foreground">Memuat…</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {TEMPLATES.map((t) => {
              const s = d.samples[t.key];
              const cands = d.candidates.filter((c) => c.template === t.key);
              return (
                <div key={t.key} className="flex gap-3 rounded-xl border p-3">
                  <div className="flex h-28 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/90">
                    {s ? (
                      <video
                        src={s.url}
                        className="h-full w-full object-cover"
                        muted
                        loop
                        autoPlay
                        playsInline
                      />
                    ) : (
                      <PlayCircle className="h-6 w-6 text-white/40" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-sm font-medium">
                      {t.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        {s ? `· ${s.ratio}` : "· belum ada contoh"}
                      </span>
                    </p>
                    {cands.length ? (
                      <AdminSelect
                        value={pick[t.key] ?? ""}
                        onChange={(v) => setPick({ ...pick, [t.key]: v })}
                      >
                        <option value="">Pilih video hasil render…</option>
                        {cands.map((c) => (
                          <option key={c.id} value={c.id}>
                            {new Date(c.created_at.replace(" ", "T") + "Z").toLocaleString(
                              "id-ID",
                              {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}{" "}
                            · {c.ratio} · {c.duration}s · {c.workspace ?? "-"}
                            {c.admin_test ? " (uji)" : ""}
                          </option>
                        ))}
                      </AdminSelect>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Belum ada video {t.name} yang selesai dirender.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!pick[t.key] || set.isPending}
                        onClick={() => set.mutate({ key: t.key, jobId: pick[t.key] })}
                      >
                        Jadikan contoh
                      </Button>
                      {s && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={set.isPending}
                          onClick={() => set.mutate({ key: t.key, jobId: null })}
                        >
                          <Trash2 /> Hapus
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
