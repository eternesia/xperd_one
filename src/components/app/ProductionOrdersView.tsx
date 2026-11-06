import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { AdminSelect } from "./admin-ui";
import { ProductionPagedTable } from "./ProductionPagedTable";
import { StatusPill, useProductionDocNav } from "./ProductionPageShell";
import { getProductionOrders } from "@/lib/production-orders.functions";

export const ORDER_STAGE: Record<string, string> = {
  draft: "Draft", planned: "Approved", released: "Approved · siap produksi", in_progress: "Sedang produksi",
  qc_pending: "Menunggu QC", completed: "Selesai", closed: "Ditutup", cancelled: "Dibatalkan",
};

export function ProductionOrdersView({ workspaceId }: { workspaceId: string }) {
  const go = useProductionDocNav(workspaceId, "orders");
  const get = useServerFn(getProductionOrders);
  const [status, setStatus] = useState("");
  const q = useQuery({ queryKey: ["production-orders", workspaceId, status], queryFn: () => get({ data: { workspaceId, status } }) });
  if (q.isPending) return <Loader2 className="m-8 animate-spin text-muted-foreground" />;
  if (q.isError) return <p className="py-12 text-muted-foreground">{q.error.message}</p>;
  const d = q.data;
  const item = (id: string) => d.items.find((i) => i.id === id);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Planning & Production Order</h1>
        <div className="flex gap-2">
          <AdminSelect className="w-48" value={status} onChange={setStatus}>
            <option value="">Semua status</option>
            {Object.entries(ORDER_STAGE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </AdminSelect>
          <Button disabled={!d.canWrite} onClick={() => void go("new")}><Plus className="size-4" />Planning baru</Button>
        </div>
      </div>
      <ProductionPagedTable
        rows={d.orders}
        headers={["Nomor", "Produk", "Qty", "Jadwal", "Status", "Tahap", "Yield"]}
        empty="Belum ada planning produksi."
        row={(o) => (
          <TableRow key={o.id} className="cursor-pointer" onClick={() => void go(o.id)}>
            <TableCell className="text-center text-xs text-muted-foreground" />
            <TableCell className="font-medium">{o.order_no}</TableCell>
            <TableCell>{item(o.item_id)?.code}<div className="text-xs text-muted-foreground">{item(o.item_id)?.name}</div></TableCell>
            <TableCell>{o.planned_qty} {o.uom}</TableCell>
            <TableCell className="text-sm">{o.planned_start ?? "—"}{o.planned_end ? ` → ${o.planned_end}` : ""}</TableCell>
            <TableCell>{o.status === "cancelled" ? <span className="text-destructive">Dibatalkan</span> : <StatusPill status={o.status} />}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{["draft", "planned"].includes(o.status) ? "—" : ORDER_STAGE[o.status]}</TableCell>
            <TableCell>{o.yield_pct != null ? `${o.yield_pct}%` : "—"}</TableCell>
          </TableRow>
        )}
      />
    </div>
  );
}
