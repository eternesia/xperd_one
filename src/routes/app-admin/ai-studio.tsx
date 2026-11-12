import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { SignupBonusAdmin } from "@/components/app/SignupBonusAdmin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  TIER_LABELS,
  type StyleConfig,
  type AiTier,
  type CreditPack,
  type TierConfig,
  minCreditValue,
  perCredit,
} from "@/lib/ai-studio";
import {
  adminGetStudio,
  adminGrantCredits,
  adminProcessJobs,
  adminRotateWorkerToken,
  adminSaveStudio,
} from "@/lib/ai-studio.functions";

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
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [tab, setTab] = useState("ringkasan");
  const [tplEnabled, setTplEnabled] = useState(false);
  const [tplCredits, setTplCredits] = useState(1);
  // Harga Template per durasi: ≤15 dtk, ≤30 dtk, ≤60 dtk.
  const [tplPrices, setTplPrices] = useState<number[]>([2, 3, 5]);
  const [newToken, setNewToken] = useState<{ token: string; url: string } | null>(null);
  const rotateFn = useServerFn(adminRotateWorkerToken);
  const rotate = useMutation({
    mutationFn: () => rotateFn(),
    onSuccess: (r) => {
      setNewToken(r);
      qc.invalidateQueries({ queryKey: ["admin-ai-studio"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [styles, setStyles] = useState<StyleConfig[]>([]);
  const setStyleAt = (i: number, patch: Partial<StyleConfig>) =>
    setStyles((x) => x.map((y, j) => (j === i ? { ...y, ...patch } : y)));
  const [grant, setGrant] = useState({ email: "", credits: 10, note: "" });
  const grantFn = useServerFn(adminGrantCredits);

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
    setStyles(q.data.styles);
    setTplEnabled(q.data.template.enabled);
    setTplCredits(q.data.template.credits);
    const pr = q.data.template.prices;
    setTplPrices(
      [15, 30, 61].map((m, i) => pr.find((p) => p.max_s === m)?.credits ?? [2, 3, 5][i]),
    );
    setPacks(q.data.packs);
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
          packs: packs.filter((p) => p.credits > 0 && p.price_idr > 0),
          styles,
          templateEnabled: tplEnabled,
          templateCredits: tplCredits,
          templatePrices: [15, 30, 61].map((max_s, i) => ({ max_s, credits: tplPrices[i] })),
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
  const giveCredits = useMutation({
    mutationFn: () =>
      grantFn({
        data: {
          email: grant.email,
          credits: grant.credits,
          note: grant.note,
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: (r) => {
      toast.success(`${r.tenant}: saldo kredit sekarang ${r.balance}`);
      setGrant({ email: "", credits: 10, note: "" });
      qc.invalidateQueries({ queryKey: ["admin-ai-studio"] });
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
  // Nilai kredit terendah (paket termurah per kredit) → margin per video yang aman.
  const creditValue = minCreditValue(packs);
  const margin = d.totals30d.sales_idr - d.totals30d.cost_idr;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Studio AI · Foto → Video</h1>
        <p className="text-sm text-muted-foreground">
          Penyedia, paket kredit, harga per video, dan laporan. Nilai kredit terendah{" "}
          {rp(creditValue)} (dari paket termurah per kredit).
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-5">
        <TabsList className="sticky top-0 z-10 h-auto flex-wrap justify-start gap-1 bg-muted p-1">
          <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
          <TabsTrigger value="umum">Umum & penyedia</TabsTrigger>
          <TabsTrigger value="paket">Paket kredit</TabsTrigger>
          <TabsTrigger value="tingkat">Tingkat & harga</TabsTrigger>
          <TabsTrigger value="gaya">Gaya gerakan</TabsTrigger>
          <TabsTrigger value="template">Template</TabsTrigger>
          <TabsTrigger value="pekerjaan">Pekerjaan</TabsTrigger>
        </TabsList>

        <TabsContent value="ringkasan" className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Video (30 hari)" value={String(d.totals30d.jobs)} />
            <Stat label="Berhasil / gagal" value={`${d.totals30d.done} / ${d.totals30d.failed}`} />
            <Stat
              label="Penjualan paket"
              value={`${rp(d.totals30d.sales_idr)} · ${d.totals30d.packs_sold}×`}
            />
            <Stat label="Penjualan − biaya penyedia" value={rp(margin)} />
          </div>
          <p className="-mt-3 text-xs text-muted-foreground">
            30 hari, tanpa video uji dan pembelian Super Admin. Kredit terpakai{" "}
            {d.totals30d.credits_used} dari {d.totals30d.credits_sold} terjual; kredit beredar di
            semua tenant {d.credits_outstanding}. Biaya = perkiraan dari tarif per detik, cocokkan
            dengan tagihan penyedia.
          </p>
          <Card>
            <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
              <div className="max-w-xl space-y-1">
                <div className="font-semibold">
                  Status untuk pengguna:{" "}
                  {d.enabled ? (
                    <Badge>Aktif</Badge>
                  ) : (
                    <Badge variant="secondary">Nonaktif (mode uji Super Admin)</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Saat nonaktif, pengguna hanya melihat tombol “segera hadir” (uji minat). Super
                  Admin tetap bisa membuat video dari menu Media di workspace-nya sendiri untuk uji
                  kualitas; kredit dipotong dari saldo kredit workspace tersebut (beri kredit bonus
                  di bawah).
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={enabled} onCheckedChange={setEnabled} />
                Buka untuk semua pengguna
              </label>
            </CardContent>
          </Card>
          <SignupBonusAdmin studioOpen={d.enabled && d.template.enabled} />
        </TabsContent>

        <TabsContent value="umum" className="space-y-6">
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
            <CardContent className="space-y-3 p-4">
              <p className="font-semibold">Batas & laporan</p>
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
        </TabsContent>

        <TabsContent value="paket" className="space-y-6">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <p className="font-semibold">Paket kredit</p>
                <p className="text-sm text-muted-foreground">
                  Dibeli pengguna dari saldo Qalling atau dibayar langsung (QRIS/kartu, kredit masuk
                  otomatis setelah lunas). Kredit tidak hangus.
                </p>
              </div>
              {packs.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] items-end gap-2">
                  <Field label="Kredit">
                    <NumInput
                      value={p.credits}
                      onChange={(v) =>
                        setPacks((x) => x.map((y, j) => (j === i ? { ...y, credits: v } : y)))
                      }
                    />
                  </Field>
                  <Field label="Harga (Rp)">
                    <NumInput
                      value={p.price_idr}
                      onChange={(v) =>
                        setPacks((x) => x.map((y, j) => (j === i ? { ...y, price_idr: v } : y)))
                      }
                    />
                  </Field>
                  <p className="pb-2 text-xs text-muted-foreground">
                    {p.credits > 0 ? `${rp(perCredit(p))}/kredit` : "—"}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={packs.length <= 1}
                    onClick={() => setPacks((x) => x.filter((_, j) => j !== i))}
                  >
                    Hapus
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                {packs.length < 8 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPacks((x) => [...x, { credits: 0, price_idr: 0 }])}
                  >
                    Tambah paket
                  </Button>
                )}
                <Button size="sm" onClick={() => save.mutate(undefined)} disabled={save.isPending}>
                  Simpan paket
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <p className="font-semibold">Beri kredit bonus</p>
                <p className="text-sm text-muted-foreground">
                  Untuk uji coba, promosi, atau kompensasi. Angka negatif untuk mengurangi.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end">
                <Field label="Email pengguna">
                  <Input
                    value={grant.email}
                    onChange={(e) => setGrant((g) => ({ ...g, email: e.target.value }))}
                    placeholder="nama@contoh.id"
                  />
                </Field>
                <Field label="Kredit">
                  <NumInput
                    value={grant.credits}
                    onChange={(v) => setGrant((g) => ({ ...g, credits: v }))}
                  />
                </Field>
                <Field label="Catatan">
                  <Input
                    value={grant.note}
                    onChange={(e) => setGrant((g) => ({ ...g, note: e.target.value }))}
                    placeholder="mis. kredit uji coba"
                  />
                </Field>
                <Button
                  disabled={!grant.email || !grant.credits || giveCredits.isPending}
                  onClick={() => giveCredits.mutate()}
                >
                  Beri kredit
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tingkat" className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-4">
              <p className="font-semibold">Tingkat & harga per video (kredit)</p>
              {AI_TIERS.map((t) => {
                const c = tiers[t];
                const cost5 = c.cost_usd_per_s * 5 * usdIdr;
                const m5 = c.credits_5s * creditValue - cost5;
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
                            (
                            {c.credits_5s && creditValue
                              ? Math.round((m5 / (c.credits_5s * creditValue)) * 100)
                              : 0}
                            %)
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

              <Button onClick={() => save.mutate(undefined)} disabled={save.isPending}>
                Simpan tingkat & harga
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gaya" className="space-y-6">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <p className="font-semibold">Gaya gerakan bawaan</p>
                <p className="text-sm text-muted-foreground">
                  Tampil di tab “Bawaan” Studio. Prompt ditulis dalam bahasa Inggris dan tidak
                  terlihat pengguna. Kunci dipakai riwayat video, jadi jangan diubah setelah gaya
                  dipakai; nonaktifkan saja bila tidak dipakai lagi.
                </p>
              </div>
              {styles.map((st, i) => (
                <div key={i} className="space-y-2 rounded-2xl border p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                    <Field label="Nama (Indonesia)">
                      <Input
                        value={st.name}
                        onChange={(e) => setStyleAt(i, { name: e.target.value })}
                      />
                    </Field>
                    <Field label="Nama (Inggris)">
                      <Input
                        value={st.name_en}
                        onChange={(e) => setStyleAt(i, { name_en: e.target.value })}
                      />
                    </Field>
                    <Field label="Kunci (huruf kecil, tanpa spasi)">
                      <Input
                        value={st.key}
                        onChange={(e) =>
                          setStyleAt(i, {
                            key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                          })
                        }
                      />
                    </Field>
                    <label className="flex items-center gap-2 pb-2 text-sm sm:self-end">
                      <Switch
                        checked={st.enabled}
                        onCheckedChange={(v) => setStyleAt(i, { enabled: v })}
                      />
                      Aktif
                    </label>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Keterangan singkat (Indonesia)">
                      <Input
                        value={st.hint}
                        onChange={(e) => setStyleAt(i, { hint: e.target.value })}
                      />
                    </Field>
                    <Field label="Keterangan singkat (Inggris)">
                      <Input
                        value={st.hint_en}
                        onChange={(e) => setStyleAt(i, { hint_en: e.target.value })}
                      />
                    </Field>
                  </div>
                  <Field label="Prompt (Inggris)">
                    <Input
                      value={st.prompt}
                      onChange={(e) => setStyleAt(i, { prompt: e.target.value })}
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={i === 0}
                      onClick={() =>
                        setStyles((x) => {
                          const y = [...x];
                          [y[i - 1], y[i]] = [y[i], y[i - 1]];
                          return y;
                        })
                      }
                    >
                      Naikkan
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={styles.length <= 1}
                      onClick={() => setStyles((x) => x.filter((_, j) => j !== i))}
                    >
                      Hapus
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                {styles.length < 24 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setStyles((x) => [
                        ...x,
                        {
                          key: "",
                          name: "",
                          name_en: "",
                          hint: "",
                          hint_en: "",
                          prompt: "",
                          enabled: true,
                        },
                      ])
                    }
                  >
                    Tambah gaya
                  </Button>
                )}
                <Button size="sm" onClick={() => save.mutate(undefined)} disabled={save.isPending}>
                  Simpan gaya
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="template" className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl space-y-1">
                  <p className="font-semibold">Video Template (tanpa AI)</p>
                  <p className="text-sm text-muted-foreground">
                    Foto + teks digabung mesin render (Remotion) di VPS Anda. Tidak ada biaya model
                    AI per video. Saat nonaktif, hanya Super Admin yang melihat mode Template di
                    Studio.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={tplEnabled} onCheckedChange={setTplEnabled} />
                  Buka Template untuk pengguna
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {["Video sampai 15 detik", "16 sampai 30 detik", "31 sampai 60 detik"].map(
                  (label, i) => (
                    <Field key={label} label={`${label} (kredit)`}>
                      <NumInput
                        value={tplPrices[i]}
                        onChange={(v) =>
                          setTplPrices((x) => x.map((c, j) => (j === i ? Math.max(1, v) : c)))
                        }
                      />
                    </Field>
                  ),
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Harga mengikuti durasi akhir video (bisa lebih panjang dari pilihan pengguna bila
                fotonya banyak atau ada narasi). Render ±5 detik per detik video di VPS 2 vCPU.
              </p>
              <p className="text-xs text-muted-foreground">
                Template hanya tampil ke pengguna bila saklar utama Studio AI (tab Ringkasan) juga
                aktif.
              </p>
              <Button onClick={() => save.mutate(undefined)} disabled={save.isPending}>
                Simpan Template
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">
                    Mesin render{" "}
                    {d.template.worker_online ? (
                      <Badge>Terhubung</Badge>
                    ) : d.template.has_token ? (
                      <Badge variant="destructive">Tidak terhubung</Badge>
                    ) : (
                      <Badge variant="secondary">Belum disiapkan</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {d.template.worker_seen_at
                      ? `Terakhir menghubungi ${new Date(d.template.worker_seen_at).toLocaleString("id-ID")} (${d.template.worker_info ?? "?"})`
                      : "Belum pernah ada mesin render yang menghubungi."}{" "}
                    Antrean: {d.template.queued} video.
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={rotate.isPending}
                  onClick={() => {
                    if (
                      !d.template.has_token ||
                      window.confirm(
                        "Buat token baru? Token lama langsung tidak berlaku dan mesin render yang berjalan harus dipasang ulang.",
                      )
                    )
                      rotate.mutate();
                  }}
                >
                  {d.template.has_token ? "Ganti token" : "Buat token mesin render"}
                </Button>
              </div>
              {newToken && (
                <div className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3">
                  <p className="text-sm font-medium">
                    Salin perintah ini sekarang. Token hanya ditampilkan sekali.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Jalankan di VPS (Ubuntu dengan Docker) setelah masuk lewat SSH:
                  </p>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-muted p-3 text-xs">
                    {installCommand(newToken.url, newToken.token)}
                  </pre>
                  <Button
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        installCommand(newToken.url, newToken.token),
                      );
                      toast.success("Perintah disalin");
                    }}
                  >
                    Salin perintah
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Mesin render hanya membuat koneksi keluar ke Qalling, jadi VPS tidak perlu domain
                atau port terbuka. Panduan lengkap: docs/AI-STUDIO.md, bagian Template.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pekerjaan" className="space-y-6">
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
                          {styles.find((x) => x.key === j.style)?.name ?? String(j.style)}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

const WORKER_IMAGE = "ghcr.io/eternesia/xperd_one-render-worker:latest";
const installCommand = (url: string, token: string) =>
  `docker run -d --name qalling-render --restart=always \\\n  -e QALLING_URL=${url} \\\n  -e WORKER_TOKEN=${token} \\\n  ${WORKER_IMAGE}`;

function KeyField(p: {
  label: string;
  hint: string | null;
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium">
        {p.label}{" "}
        {p.hint ? (
          <Badge variant="outline">{p.hint}</Badge>
        ) : (
          <Badge variant="secondary">belum diisi</Badge>
        )}
      </div>
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
