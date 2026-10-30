import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SubscriptionCheckout } from "@/components/app/SubscriptionCheckout";
import { useApp } from "@/lib/app-context";
import { listAddonOptions, listAddonTiers } from "@/lib/addon-catalog.functions";

const money = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export function AddonTierChoices() {
  const { tenant, workspaceRole, entitlements } = useApp();
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
                {entitlements.qalling?.tier === t.code && <Badge>Aktif</Badge>}
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
              {tenant && workspaceRole === "owner" && (
                <SubscriptionCheckout
                  tenantId={tenant.id}
                  kind="tier"
                  itemId={t.id}
                  label={`Pilih ${t.name}`}
                />
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
