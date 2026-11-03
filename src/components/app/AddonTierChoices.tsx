import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SubscriptionCheckout } from "@/components/app/SubscriptionCheckout";
import { useApp } from "@/lib/app-context";
import { listAddonOptions, listAddonTiers } from "@/lib/addon-catalog.functions";
import { getTrialTierState } from "@/lib/trial-tier.functions";
import { TrialTierSwitch } from "@/components/app/TrialTierSwitch";

const money = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export function AddonTierChoices() {
  const { tenant, activeWorkspace, workspaceRole, entitlements } = useApp();
  const tenantId = activeWorkspace?.tenant_id ?? tenant?.id;
  const fetchTrial = useServerFn(getTrialTierState);
  const trial = useQuery({
    queryKey: ["qalling-trial-tier", tenantId],
    enabled: Boolean(tenantId),
    queryFn: () => {
      if (!tenantId) throw new Error("Tenant tidak tersedia");
      return fetchTrial({ data: { tenantId } });
    },
  });
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const { data: tiers = [] } = useQuery({
    queryKey: ["addon-tiers"],
    queryFn: () => listAddonTiers(),
  });
  const { data: options = [] } = useQuery({
    queryKey: ["addon-options"],
    queryFn: () => listAddonOptions({ data: { activeOnly: true } }),
  });
  return (
    <section className="space-y-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="text-base font-semibold">Qalling · Pilihan paket</h2>
      {trial.data?.canSwitch && (
        <p className="text-sm text-muted-foreground">
          Uji coba sampai {trial.data.endsAt} · Pergantian paket Rp0 · Masa trial tidak diperpanjang
        </p>
      )}
      {trial.isError && (
        <p className="text-sm text-destructive">
          Paket trial belum dapat dimuat. Muat ulang halaman sebelum memilih paket.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiers
          .filter((t) => t.is_active && t.code !== "qalling_free")
          .map((t) => (
            <article
              key={t.id}
              data-testid={`tier-${t.code}`}
              className="flex flex-col rounded-xl border border-border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{t.name}</h3>
                {entitlements.qalling?.tier === t.code && (
                  <Badge>{trial.data?.canSwitch ? "Uji coba" : "Aktif"}</Badge>
                )}
              </div>
              <p className="mt-3 text-lg font-semibold">
                {money(t.monthly_price)}
                <span className="text-xs font-normal text-muted-foreground"> /bulan</span>
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Akun sosial</dt>
                <dd>{t.limits.max_accounts ?? "∞"}</dd>
                <dt className="text-muted-foreground">Pengguna</dt>
                <dd>{t.limits.max_users ?? "∞"}</dd>
                <dt className="text-muted-foreground">Penyimpanan</dt>
                <dd>{t.limits.storage_gb ?? "∞"} GB</dd>
                <dt className="text-muted-foreground">Posting /bulan</dt>
                <dd>{t.limits.monthly_post_limit ?? "∞"}</dd>
              </dl>
              {tenantId && trial.data?.canSwitch ? (
                <TrialTierSwitch
                  tenantId={tenantId}
                  tierId={t.id}
                  expectedTierId={trial.data.tierId}
                  name={t.name}
                  current={trial.data.tierId === t.id}
                />
              ) : (
                tenant &&
                workspaceRole === "owner" &&
                trial.isSuccess && (
                  <SubscriptionCheckout
                    tenantId={tenant.id}
                    kind="tier"
                    itemId={t.id}
                    label={`Pilih ${t.name}`}
                  />
                )
              )}
            </article>
          ))}
      </div>
      {options.length > 0 && <h3 className="pt-2 text-sm font-semibold">Tambahan opsional</h3>}
      <div className="divide-y divide-border">
        {options.map((o) => (
          <div
            key={o.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
          >
            <span>{o.name}</span>
            <span>{money(o.monthly_price)} /unit/bulan</span>
            {tenant && workspaceRole === "owner" && (
              <div className="flex items-center gap-3">
                <Input
                  className="w-20"
                  aria-label={`Jumlah ${o.name}`}
                  type="number"
                  min={0}
                  max={o.max_quantity}
                  value={quantities[o.id] ?? 1}
                  onChange={(e) => setQuantities({ ...quantities, [o.id]: Number(e.target.value) })}
                />
                <SubscriptionCheckout
                  tenantId={tenant.id}
                  kind="option"
                  itemId={o.id}
                  quantity={quantities[o.id] ?? 1}
                  label={`Pilih ${o.name}`}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
