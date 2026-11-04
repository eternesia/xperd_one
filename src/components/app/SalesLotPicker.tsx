import { useQuery } from "@tanstack/react-query";
import { getSalesLotOptions } from "@/lib/erp-document.functions";
import { useI18n } from "@/lib/i18n";

/**
 * Pemilih lot penjualan (BS New 16): hanya tampil untuk item berprofil Production pada workspace berentitlement `manufacturing`;
 * mendaftar lot yang sudah dirilis, belum kedaluwarsa, dan teregistrasi. Server tetap menjadi otoritas (assertLotSellable + tiket FEFO).
 */
export function SalesLotPicker({
  workspaceId,
  itemCode,
  warehouse,
  value,
  onChange,
}: {
  workspaceId: string;
  itemCode: string;
  warehouse: string | null;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const q = useQuery({
    queryKey: ["sales-lot-options", workspaceId, itemCode, warehouse],
    enabled: !!itemCode,
    staleTime: 30_000,
    retry: false,
    queryFn: () => getSalesLotOptions({ data: { workspaceId, itemCodes: [itemCode], warehouse } }),
  });
  const info = q.data?.items?.[itemCode];
  if (!itemCode || !q.data?.enabled || !info) return null;
  return (
    <select
      aria-label={t("Lot", "Lot")}
      className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{t("Choose lot", "Pilih lot")}</option>
      {info.lots.map((l) => (
        <option key={l.lot_id} value={l.lot_id}>
          {l.lot_no}
          {l.expiry_date ? ` · ED ${l.expiry_date}` : ""}
          {warehouse ? ` · ${t("stock", "stok")} ${l.balance}` : ""}
        </option>
      ))}
    </select>
  );
}
