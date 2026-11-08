import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getKirimdevAdmin, saveKirimdevKey } from "@/lib/kirimdev.functions";

export const Route = createFileRoute("/app-admin/kirimdev")({
  head: () => ({
    meta: [
      { title: "WhatsApp (Kirimdev) | XPERD Admin" },
      { name: "description", content: "API key induk Kirimdev untuk WhatsApp resmi Qalling." },
    ],
  }),
  component: KirimdevAdmin,
});

function KirimdevAdmin() {
  const qc = useQueryClient();
  const getFn = useServerFn(getKirimdevAdmin);
  const saveFn = useServerFn(saveKirimdevKey);
  const [key, setKey] = useState("");
  const q = useQuery({ queryKey: ["kirimdev-admin"], queryFn: () => getFn() });
  const save = useMutation({
    mutationFn: () => saveFn({ data: { apiKey: key.trim() } }),
    onSuccess: (r) => {
      setKey("");
      qc.invalidateQueries({ queryKey: ["kirimdev-admin"] });
      if (r.status === "verified") toast.success("Terhubung ke Kirimdev");
      else toast.error(r.lastError ?? "API key tidak valid");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const d = q.data;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">WhatsApp (Kirimdev)</h1>
        <p className="text-sm text-muted-foreground">
          Satu API key induk untuk semua workspace. Tiap workspace menjadi customer Kirimdev dan
          memasang nomor WhatsApp-nya sendiri lewat setup link (Embedded Signup Meta), tanpa mengisi
          API key.
        </p>
      </div>
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium">Status</span>
            <Badge variant={d?.status === "verified" ? "secondary" : "outline"}>
              {d?.status === "verified"
                ? "Terverifikasi"
                : d?.status === "invalid"
                  ? "Tidak valid"
                  : "Belum diatur"}
            </Badge>
            {d?.keyHint && <span className="text-sm text-muted-foreground">{d.keyHint}</span>}
          </div>
          {d?.lastError && <p className="text-sm text-destructive">{d.lastError}</p>}
          <div className="flex flex-wrap gap-2">
            <Input
              type="password"
              className="max-w-sm"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="kdv_live_…"
              autoComplete="off"
            />
            <Button
              disabled={key.trim().length < 10 || save.isPending}
              onClick={() => save.mutate()}
            >
              Simpan &amp; verifikasi
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Buat key di dashboard Kirimdev (Settings → API Keys). Key disimpan di server dan tidak
            pernah dikirim ke browser pengguna.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Workspace memakai mode dikelola</p>
            <p className="text-xl font-bold">{d?.workspaces ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Nomor WhatsApp terhubung</p>
            <p className="text-xl font-bold">{d?.connected ?? 0}</p>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Biaya langganan Kirimdev ditanggung platform (paket Kirimdev yang mencukupi jumlah
            nomor). Biaya pesan Meta ditagih Meta langsung ke metode pembayaran di WhatsApp Business
            Account milik masing-masing pengguna.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
