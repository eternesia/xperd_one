import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminField } from "@/components/app/admin-ui";
import {
  adminCreateGrant,
  adminExtendGrant,
  adminListGrants,
  adminRevokeGrant,
} from "@/lib/feature-grants.functions";

export const Route = createFileRoute("/app-admin/grants")({
  head: () => ({ meta: [{ title: "Akses Uji Coba | XPERD Admin" }] }),
  component: GrantsAdmin,
});

const REASON: Record<string, string> = {
  trial: "Uji coba fitur",
  affiliate: "Afiliator",
  promo: "Imbal promosi",
  partner: "Mitra",
};
const STATUS: Record<string, string> = { active: "Aktif", expired: "Berakhir", revoked: "Dicabut" };

function GrantsAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-grants"], queryFn: () => adminListGrants() });
  const [f, setF] = useState({ email: "", tierId: "", days: "14", reason: "trial", note: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-grants"] });
  const create = useMutation({
    mutationFn: () =>
      adminCreateGrant({
        data: {
          email: f.email,
          tierId: f.tierId || (q.data?.tiers.at(-1)?.id ?? ""),
          days: Number(f.days),
          reason: f.reason as "trial",
          note: f.note || undefined,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Akses diberikan ke ${r.tenant} sampai ${r.ends_at}`);
      setF({ ...f, email: "", note: "" });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => adminRevokeGrant({ data: { id } }),
    onSuccess: () => {
      toast.success("Akses dicabut");
      refresh();
    },
  });
  const extend = useMutation({
    mutationFn: (id: string) => adminExtendGrant({ data: { id, days: 30 } }),
    onSuccess: () => {
      toast.success("Diperpanjang 30 hari");
      refresh();
    },
  });
  const tiers = q.data?.tiers ?? [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Akses Uji Coba</h1>
        <p className="text-sm text-muted-foreground">
          Beri pengguna akses sementara ke fitur paket tertentu (mis. Agency) tanpa mengganti paket
          mereka. Berlaku otomatis dan berakhir sendiri pada tanggalnya.
        </p>
      </div>
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <AdminField label="Email pengguna (sudah terdaftar)">
            <Input
              type="email"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
              placeholder="nama@email.com"
            />
          </AdminField>
          <AdminField label="Fitur setara paket">
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={f.tierId || tiers.at(-1)?.id || ""}
              onChange={(e) => setF({ ...f, tierId: e.target.value })}
            >
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Lama (hari)">
            <Input
              type="number"
              min={1}
              max={365}
              value={f.days}
              onChange={(e) => setF({ ...f, days: e.target.value })}
            />
          </AdminField>
          <AdminField label="Alasan">
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={f.reason}
              onChange={(e) => setF({ ...f, reason: e.target.value })}
            >
              {Object.entries(REASON).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </AdminField>
          <div className="sm:col-span-2">
            <AdminField label="Catatan (mis. syarat promosi yang disepakati)">
              <Input
                value={f.note}
                maxLength={500}
                onChange={(e) => setF({ ...f, note: e.target.value })}
              />
            </AdminField>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button disabled={!f.email || create.isPending} onClick={() => create.mutate()}>
              Berikan akses
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {(q.data?.grants ?? []).map((g) => (
          <div
            key={g.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{g.email ?? g.tenant_name}</p>
              <p className="text-xs text-muted-foreground">
                {g.tenant_name} · {g.tier_name ?? "—"} · {g.starts_at} → {g.ends_at}
              </p>
              {g.note && <p className="mt-1 text-xs">{g.note}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{REASON[g.reason] ?? g.reason}</Badge>
              <Badge variant={g.status === "active" ? "default" : "secondary"}>
                {STATUS[g.status]}
              </Badge>
              <Button size="sm" variant="outline" onClick={() => extend.mutate(g.id)}>
                +30 hari
              </Button>
              {g.status === "active" && (
                <Button size="sm" variant="outline" onClick={() => revoke.mutate(g.id)}>
                  Cabut
                </Button>
              )}
            </div>
          </div>
        ))}
        {q.data && q.data.grants.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Belum ada akses.</p>
        )}
      </div>
    </div>
  );
}
