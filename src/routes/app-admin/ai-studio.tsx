import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AI_PROVIDERS,
  AI_TIERS,
  CREDIT_IDR,
  STYLE_LABELS,
  TIER_LABELS,
  type AiStyle,
  type AiTier,
  type TierConfig,
} from "@/lib/ai-studio";
import { adminGetStudio, adminProcessJobs, adminSaveStudio } from "@/lib/ai-studio.functions";

export const Route = createFileRoute("/app-admin/ai-studio")({
  head: () => ({ meta: [{ title: "Studio AI | XPERD Admin" }] }),
  component: StudioAdmin,
});

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

function StudioAdmin() {
  const qc = useQueryClient();
  const getFn = useServerFn(adminGetStudio);
  const saveFn = useServerFn(adminSaveStudio);
  const processFn = useServerFn(adminProcessJobs);
  const q = useQuery({ queryKey: ["admin-ai-studio"], queryFn: () => getFn() });

  const [enabled, setEnabled] = useState(false);
  const [falKey, setFalKey] = useState("");
  const [atlasKey, setAtlasKey] = useState("");
  const [tiers, setTiers] = useState<Record<AiTier, TierConfig> | null>(null);
  const [extraText, setExtraText] = useState<Record<AiTier, string>>({
    hemat: "",
    standar: "",
    premium: "",
  });
  const [dailyLimit, setDailyLimit] = useState(10);
  const [usdIdr, setUsdIdr] = useState(16500);

  useEffect(() => {
    if (!q.data) return;
    setEnabled(q.data.enabled);
    setTiers(q.data.tiers);
    setExtraText(
      Object.fromEntries(
        AI_TIERS.map((t) => [
          t,
          q.data.tiers[t].extra ? JSON.stringify(q.data.tiers[t].extra) : "",
        ]),
      ) as Record<AiTier, string>,
    );
    setDailyLimit(q.data.daily_limit);
    setUsdIdr(q.data.usd_idr);
  }, [q.data]);

  const save = useMutation({
    mutationFn: (opts?: { clearFal?: boolean; clearAtlas?: boolean }) => {
      if (!tiers) throw new Error("Belum dimuat");
      const withExtra = Object.fromEntries(
        AI_TIERS.map((t) => {
          const raw = extraText[t].trim();
          let extra: Record<string, unknown> | undefined;
          if (raw) {
            try {
              extra = JSON.parse(raw);
            } catch {
              throw new Error(`Parameter tambahan ${TIER_LABELS[t].id} bukan JSON yang valid`);
            }
          }
          return [t, { ...tiers[t], extra }];
        }),
      ) as Record<AiTier, TierConfig>;
      return saveFn({
        data: {
          enabled,
          falApiKey: falKey.trim() || undefined,
          atlasApiKey: atlasKey.trim() || undefined,
          tiers: withExtra,
          dailyLimit,
          usdIdr,
          ...opts,
        },
      });
    },
    onSuccess: () => {
      setFalKey("");
      setAtlasKey("");
      qc.invalidateQueries({ queryKey: ["admin-ai-studio"] });
      toast.success("Pengaturan Studio AI disimpan");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const process = useMutation({
    mutationFn: () => processFn(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["admin-ai-studio"] });
      toast.success(`${r.checked} pekerjaan diperiksa`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setTier = (t: AiTier, patch: Partial<TierConfig>) =>
    setTiers((cur) => (cur ? { ...cur, [t]: { ...cur[t], ...patch } } : cur));

  if (q.isLoading || !tiers) return <p className="text-sm text-muted-foreground">Memuat…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;
  const margin = d.totals30d.revenue_idr - d.totals30d.cost_idr;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Studio AI · Foto → Video</h1>
        <p className="text-sm text-muted-foreground">
          Penyedia, harga kredit per tingkat, dan laporan pemakaian. 1 kredit = {rp(CREDIT_IDR)}.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
          <div className="max-w-xl space-y-1">
            <p className="font-semibold">
              Status untuk pengguna:{" "}
              {d.enabled ? (
                <Badge>Aktif</Badge>
              ) : (
                <Badge variant="secondary">Nonaktif (mode uji Super Admin)</Badge>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              Saat nonaktif, pengguna hanya melihat tombol “segera hadir” (uji minat). Super Admin
              tetap bisa membuat video dari menu Media di workspace-nya sendiri untuk uji kualitas;
              kredit tetap dipotong dari saldo workspace tersebut.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            Buka untuk semua pengguna
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <p className="font-semibold">API key penyedia</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <KeyField
              label="fal.ai"
              hint={d.fal_key_hint}
              value={falKey}
              onChange={setFalKey}
              onClear={() => save.mutate({ clearFal: true })}
            />
            <KeyField
              label="Atlas Cloud"
              hint={d.atlas_key_hint}
              value={atlasKey}
              onChange={setAtlasKey}
              onClear={() => save.mutate({ clearAtlas: true })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Key disimpan di server dan tidak pernah dikirim ke browser. Penyedia mengambil foto
            lewat URL bertanda tangan, jadi uji harus dijalankan di domain produksi
            (APP_PUBLIC_URL), bukan localhost.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <p className="font-semibold">Tingkat & harga</p>
          {AI_TIERS.map((t) => {
            const c = tiers[t];
            const cost5 = c.cost_usd_per_s * 5 * usdIdr;
            const m5 = c.credits_5s * CREDIT_IDR - cost5;
            return (
              <div key={t} className="space-y-3 rounded-2xl border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{TIER_LABELS[t].id}</p>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={c.enabled}
                      onCheckedChange={(v) => setTier(t, { enabled: v })}
                    />
                    Dibuka
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="Penyedia">
                    <select
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={c.provider}
                      onChange={(e) =>
                        setTier(t, { provider: e.target.value as TierConfig["provider"] })
                      }
                    >
                      {AI_PROVIDERS.map((p) => (
                        <option key={p} value={p}>
                          {p === "fal" ? "fal.ai" : "Atlas Cloud"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="ID model" className="sm:col-span-2">
                    <Input
                      value={c.model}
                      onChange={(e) => setTier(t, { model: e.target.value })}
                    />
                  </Field>
                  <Field label="Parameter gambar">
                    <Input
                      value={c.image_param}
                      onChange={(e) => setTier(t, { image_param: e.target.value })}
                    />
                  </Field>
                  <Field label="Kredit / 5 detik">
                    <NumInput
                      value={c.credits_5s}
                      onChange={(v) => setTier(t, { credits_5s: v })}
                    />
                  </Field>
                  <Field label="Kredit / 10 detik">
                    <NumInput
                      value={c.credits_10s}
                      onChange={(v) => setTier(t, { credits_10s: v })}
                    />
                  </Field>
                  <Field label="Biaya penyedia USD/detik">
                    <NumInput
                      step={0.001}
                      value={c.cost_usd_per_s}
                      onChange={(v) => setTier(t, { cost_usd_per_s: v })}
                    />
                  </Field>
                  <Field label="Margin 5 detik (perkiraan)">
                    <p className="pt-2 text-sm">
                      {rp(m5)}{" "}
                      <span className="text-muted-foreground">
                        ({c.credits_5s ? Math.round((m5 / (c.credits_5s * CREDIT_IDR)) * 100) : 0}%)
                      </span>
                    </p>
                  </Field>
                  <Field label="Parameter tambahan (JSON, opsional)" className="sm:col-span-4">
                    <Input
                      placeholder='{"resolution":"720p"}'
                      value={extraText[t]}
                      onChange={(e) => setExtraText((x) => ({ ...x, [t]: e.target.value }))}
                    />
                  </Field>
                </div>
              </div>
            );
          })}
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Batas video per workspace / 24 jam">
              <NumInput value={dailyLimit} onChange={setDailyLimit} />
            </Field>
            <Field label="Kurs USD → IDR (laporan)">
              <NumInput value={usdIdr} onChange={setUsdIdr} />
            </Field>
          </div>
          <Button onClick={() => save.mutate(undefined)} disabled={save.isPending}>
            Simpan pengaturan
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Video (30 hari)" value={String(d.totals30d.jobs)} />
        <Stat label="Berhasil / gagal" value={`${d.totals30d.done} / ${d.totals30d.failed}`} />
        <Stat label="Pendapatan kredit" value={rp(d.totals30d.revenue_idr)} />
        <Stat label="Margin (perkiraan)" value={rp(margin)} />
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        Tanpa video uji Super Admin. Biaya = perkiraan dari tarif per detik; cocokkan dengan tagihan
        penyedia.
      </p>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Pekerjaan terbaru</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => process.mutate()}
              disabled={process.isPending}
            >
              <RefreshCw className="mr-1 h-4 w-4" /> Periksa sekarang
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Tingkat / model</TableHead>
                  <TableHead>Gaya</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Kredit</TableHead>
                  <TableHead className="text-right">Biaya est.</TableHead>
                  <TableHead className="text-right">Proses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.jobs.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      Belum ada video.
                    </TableCell>
                  </TableRow>
                )}
                {d.jobs.map((j) => (
                  <TableRow key={String(j.id)}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {j.created_at.slice(0, 16)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {String(j.workspace_name ?? "—")}
                      {j.is_admin_test && (
                        <Badge variant="outline" className="ml-1">
                          uji
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {TIER_LABELS[j.tier as AiTier]?.id ?? String(j.tier)} · {j.duration_s}s
                      <p className="max-w-[220px] truncate text-muted-foreground">
                        {String(j.provider)}: {String(j.model)}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs">
                      {STYLE_LABELS[j.style as AiStyle]?.id ?? String(j.style)}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge
                        variant={
                          j.status === "failed"
                            ? "destructive"
                            : j.status === "done"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {String(j.status)}
                      </Badge>
                      {j.refunded && <span className="ml-1 text-muted-foreground">refund</span>}
                      {j.error && (
                        <p
                          className="max-w-[260px] truncate text-destructive"
                          title={String(j.error)}
                        >
                          {String(j.error)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs">{j.credits}</TableCell>
                    <TableCell className="text-right text-xs">{rp(j.est_cost_idr)}</TableCell>
                    <TableCell className="text-right text-xs">
                      {j.seconds != null ? `${j.seconds}s` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KeyField(p: {
  label: string;
  hint: string | null;
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">
        {p.label}{" "}
        {p.hint ? (
          <Badge variant="outline">{p.hint}</Badge>
        ) : (
          <Badge variant="secondary">belum diisi</Badge>
        )}
      </p>
      <div className="flex gap-2">
        <Input
          type="password"
          autoComplete="off"
          placeholder={p.hint ? "Isi untuk mengganti" : "Tempel API key"}
          value={p.value}
          onChange={(e) => p.onChange(e.target.value)}
        />
        {p.hint && (
          <Button type="button" variant="outline" onClick={p.onClear}>
            Hapus
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <Input
      type="number"
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
