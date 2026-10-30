// Add-ons — client hooks (ported from Business Suite lib/addons.ts). Now backed
// by the MySQL server functions in @/lib/addons.functions instead of Supabase.
import { useQuery } from "@tanstack/react-query";

import { useApp } from "@/lib/app-context";
import { listAddonCatalog, listTenantAddons } from "@/lib/addons.functions";
import type { AddonRow, TenantAddonRow } from "@/lib/addons.functions";
import { isLiveAddon } from "@/lib/entitlements";

export type AddonRecord = AddonRow;
export type TenantAddonRecord = TenantAddonRow;

/** Sama dengan New 11: berlaku bila active/trial, sudah mulai, dan belum lewat `ends_at` (grace tidak membuka modul). */
function isLive(row: TenantAddonRow) {
  return isLiveAddon(row, new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10));
}

/** Add-on codes currently unlocked for the signed-in user's tenant. */
export function useTenantAddons() {
  const { tenant } = useApp();
  const tenantId = tenant?.id;

  const query = useQuery({
    queryKey: ["tenant-addons", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      if (!tenantId) return [] as TenantAddonRow[];
      const data = await listTenantAddons({ data: { tenantId } });
      return data ?? [];
    },
  });

  const rows = query.data ?? [];
  const activeCodes = rows
    .filter(isLive)
    .map((r) => r.addons?.code)
    .filter(Boolean) as string[];

  return {
    rows,
    activeCodes,
    loading: query.isLoading,
    hasAddon: (code?: string) => (code ? activeCodes.includes(code) : true),
  };
}

/** Catalog of purchasable add-ons. */
export function useAddonCatalog() {
  return useQuery({
    queryKey: ["addon-catalog"],
    queryFn: async () => {
      const data = await listAddonCatalog();
      return data ?? [];
    },
  });
}
