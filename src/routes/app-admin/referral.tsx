import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getReferralSettings,
  saveReferralSettings,
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
    <div className="max-w-xl space-y-5 rounded-xl border border-border bg-card p-6">
      <div>
        <h1 className="text-xl font-semibold">Program Referral</h1>
        <p className="text-sm text-muted-foreground">
          Komisi saldo untuk pengundang saat teman melakukan top up pertama yang terverifikasi.
        </p>
      </div>
      <div className="flex items-center justify-between">
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
          <Label htmlFor="ref-min">Min. top up (Rp)</Label>
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
  );
}
