import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  deleteReferralPoster,
  getReferralPromoAdmin,
  getReferralSettings,
  saveReferralPromo,
  saveReferralSettings,
  uploadReferralPoster,
  type ReferralSettings,
} from "@/lib/referral.functions";

export const Route = createFileRoute("/app-admin/referral")({
  head: () => ({
    meta: [
      { title: "Referral — XPERD Super Admin" },
      { name: "description", content: "Atur komisi referral saldo." },
      { property: "og:title", content: "Referral — XPERD Super Admin" },
      { property: "og:description", content: "Atur komisi referral saldo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReferralSettingsPage,
});

type S = ReferralSettings;

function ReferralSettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["referral-settings"],
    queryFn: () => getReferralSettings(),
  });
  const [f, setF] = useState<S | null>(null);
  useEffect(() => {
    if (data && !f)
      setF({
        enabled: data.enabled,
        percent: Number(data.percent),
        max_idr: Number(data.max_idr),
        min_topup_idr: Number(data.min_topup_idr),
      });
  }, [data, f]);
  const save = useMutation({
    mutationFn: async (v: S) => {
      await saveReferralSettings({ data: v });
    },
    onSuccess: () => {
      toast.success("Pengaturan referral disimpan");
      qc.invalidateQueries({ queryKey: ["referral-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!f) return <p className="text-sm text-muted-foreground">Memuat…</p>;
  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Program Referral</h1>
          <p className="text-sm text-muted-foreground">
            Komisi saldo untuk pengundang saat teman melakukan top up pertama yang terverifikasi.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="ref-on">Program aktif</Label>
          <Switch
            id="ref-on"
            checked={f.enabled}
            onCheckedChange={(enabled) => setF({ ...f, enabled })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="ref-p">Komisi (%)</Label>
            <Input
              id="ref-p"
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={f.percent}
              onChange={(e) => setF({ ...f, percent: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ref-max">Maksimal (Rp)</Label>
            <Input
              id="ref-max"
              type="number"
              min={0}
              step={1000}
              value={f.max_idr}
              onChange={(e) => setF({ ...f, max_idr: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ref-min">Min. pembelian paket (Rp)</Label>
            <Input
              id="ref-min"
              type="number"
              min={0}
              step={1000}
              value={f.min_topup_idr}
              onChange={(e) => setF({ ...f, min_topup_idr: Number(e.target.value) })}
            />
          </div>
        </div>
        <Button disabled={save.isPending} onClick={() => save.mutate(f)}>
          Simpan
        </Button>
      </div>
      <hr className="border-border" />
      <PromoSection />
    </div>
  );
}

const POSTER_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Materi promosi yang tampil di Qalling → Referral (teks dengan {link}/{code} + poster). */
function PromoSection() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["referral-promo-admin"],
    queryFn: () => getReferralPromoAdmin(),
  });
  const [f, setF] = useState<{ enabled: boolean; whatsapp: string; social: string } | null>(null);
  useEffect(() => {
    if (data && !f) setF({ enabled: data.enabled, whatsapp: data.whatsapp, social: data.social });
  }, [data, f]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["referral-promo-admin"] });
    void qc.invalidateQueries({ queryKey: ["referral-promo"] });
  };
  const save = useMutation({
    mutationFn: async () => {
      if (f) await saveReferralPromo({ data: f });
    },
    onSuccess: () => {
      toast.success("Materi promosi disimpan");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!POSTER_TYPES.includes(file.type)) throw new Error("Poster harus PNG, JPG, atau WebP.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran poster maksimal 5 MB.");
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
        r.onerror = () => reject(new Error("Gagal membaca berkas"));
        r.readAsDataURL(file);
      });
      await uploadReferralPoster({ data: { mime: file.type, base64 } });
    },
    onSuccess: () => {
      toast.success("Poster diunggah");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => deleteReferralPoster(),
    onSuccess: () => {
      toast.success("Poster dihapus");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!f) return null;
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Materi Promosi Referral</h2>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor="promo-on">Tampilkan materi ke pengguna</Label>
        <Switch
          id="promo-on"
          checked={f.enabled}
          onCheckedChange={(enabled) => setF({ ...f, enabled })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="promo-wa">Pesan WhatsApp</Label>
        <Textarea
          id="promo-wa"
          rows={4}
          value={f.whatsapp}
          onChange={(e) => setF({ ...f, whatsapp: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="promo-social">Caption media sosial</Label>
        <Textarea
          id="promo-social"
          rows={4}
          value={f.social}
          onChange={(e) => setF({ ...f, social: e.target.value })}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {"{link}"} = link referral pengguna · {"{code}"} = kode referral pengguna
      </p>
      <div className="space-y-2">
        <Label htmlFor="promo-image">Poster promosi (PNG, JPG, WebP · maks. 5 MB)</Label>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" disabled={upload.isPending}>
            <label className="cursor-pointer">
              <ImagePlus /> {data?.poster_url ? "Ganti gambar" : "Unggah gambar"}
              <input
                id="promo-image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) upload.mutate(file);
                }}
              />
            </label>
          </Button>
          {data?.poster_url && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Hapus poster"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              <Trash2 />
            </Button>
          )}
        </div>
        {data?.poster_url && (
          <img
            src={data.poster_url}
            alt="Poster promosi"
            className="max-h-80 rounded-md border object-contain"
          />
        )}
      </div>
      <Button disabled={save.isPending} onClick={() => save.mutate()}>
        <Save /> Simpan materi promosi
      </Button>
    </div>
  );
}
