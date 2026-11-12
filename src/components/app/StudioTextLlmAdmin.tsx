/** Super Admin → Studio AI → Umum: asisten teks (LLM) untuk "mode perintah" Studio. */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { adminGetTextLlm, adminSaveTextLlm } from "@/lib/ai-studio.functions";

const PRESETS: { label: string; base_url: string; hint: string }[] = [
  {
    label: "Anthropic (Claude)",
    base_url: "https://api.anthropic.com/v1",
    hint: "model mis. claude-haiku-…",
  },
  {
    label: "OpenRouter",
    base_url: "https://openrouter.ai/api/v1",
    hint: "model mis. anthropic/claude-…",
  },
  { label: "OpenAI", base_url: "https://api.openai.com/v1", hint: "model mis. gpt-…-mini" },
];

export function StudioTextLlmAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-text-llm"], queryFn: () => adminGetTextLlm() });
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  useEffect(() => {
    if (q.data) {
      setBaseUrl(q.data.base_url);
      setModel(q.data.model);
    }
  }, [q.data]);
  const save = useMutation({
    mutationFn: (v: { off?: boolean; test?: boolean }) =>
      adminSaveTextLlm({
        data: {
          config: v.off
            ? null
            : { base_url: baseUrl.trim(), model: model.trim(), api_key: key.trim() },
          test: !!v.test,
        },
      }),
    onSuccess: (r, v) => {
      setKey("");
      void qc.invalidateQueries({ queryKey: ["admin-text-llm"] });
      if (v.off) toast.success("Asisten AI dimatikan; mode perintah memakai pengurai aturan");
      else if (r.test)
        toast.success(`Tersambung (${r.test.ms} ms): “${r.test.sample.headline}”`, {
          description: [r.test.sample.subline, r.test.sample.badge, r.test.sample.cta]
            .filter(Boolean)
            .join(" · "),
        });
      else toast.success("Tersimpan");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="max-w-2xl space-y-1">
          <p className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-4 w-4 text-gold" /> Asisten teks untuk “mode perintah”
            <span className="text-xs font-normal text-muted-foreground">
              {q.data ? `aktif · ${q.data.model} · kunci ${q.data.key_hint}` : "belum diatur"}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            Pengguna cukup menulis perintah (mis. “promo kopi susu, diskon 20%, ajak pesan via WA”);
            judul, keterangan, lencana, ajakan, dan suasana musik disusun otomatis. Tanpa API pun
            tetap jalan memakai pengurai aturan sederhana; dengan API hasilnya jauh lebih luwes.
            Gratis untuk pengguna — biaya model kecil ±Rp1–5 per perintah ditanggung platform.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              type="button"
              size="sm"
              variant={baseUrl === p.base_url ? "default" : "outline"}
              onClick={() => setBaseUrl(p.base_url)}
              title={p.hint}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Base URL (kompatibel OpenAI)</span>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://…/v1"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Model</span>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="nama model"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">API key</span>
            <Input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={q.data ? "kosong = tetap" : "sk-…"}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={save.isPending || !baseUrl || !model}
            onClick={() => save.mutate({ test: true })}
          >
            Uji & simpan
          </Button>
          {q.data && (
            <Button
              variant="ghost"
              disabled={save.isPending}
              onClick={() => save.mutate({ off: true })}
            >
              Matikan
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
