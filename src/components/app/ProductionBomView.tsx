import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Eye, GitCompare, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProductionPagedTable } from "./ProductionPagedTable";
import { StatusPill, useProductionDocNav } from "./ProductionPageShell";
import { compareBomLines, type BomLine } from "@/lib/production-bom";
import { getBomLines, getProductionBoms } from "@/lib/production-bom.functions";

const LEVEL: Record<number, string> = { 1: "Level 1 · FG", 2: "Level 2 · Bulk" };

export function ProductionBomView({ workspaceId }: { workspaceId: string }) {
  const go = useProductionDocNav(workspaceId, "boms");
  const get = useServerFn(getProductionBoms);
  const read = useServerFn(getBomLines);
  const [page, setPage] = useState(0);
  const [compare, setCompare] = useState<ReturnType<typeof compareBomLines> | null>(null);
  const q = useQuery({ queryKey: ["production-boms", workspaceId, page], queryFn: () => get({ data: { workspaceId, page } }) });
  if (q.isPending) return <Loader2 className="m-8 animate-spin text-muted-foreground" />;
  if (q.isError) return <p className="py-12 text-muted-foreground">{q.error.message}</p>;
  const data = q.data;
  const itemName = (id?: string) => data.items.find((i) => i.id === id)?.name;
  const norm = (r: Awaited<ReturnType<typeof read>>) => r.lines.map((l) => ({ ...l, line_type: l.line_type as BomLine["line_type"], basis: l.basis as BomLine["basis"], add_step_note: l.add_step_note ?? "" }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Formulasi / BOM</h1>
        <Button disabled={!data.canWrite} onClick={() => void go("new")}><Plus className="size-4" />BOM baru</Button>
      </div>
      <ProductionPagedTable
        rows={data.versions}
        headers={["Kode / Produk", "Level", "Versi", "Status", "Batch", "Aksi"]}
        empty="Belum ada formulasi."
        row={(v) => {
          const b = data.boms.find((x) => x.id === v.bom_id);
          return (
            <TableRow key={v.id} className="cursor-pointer" onClick={() => void go(v.id)}>
              <TableCell className="text-center text-xs text-muted-foreground" />
              <TableCell><strong>{b?.code}</strong><div className="text-xs text-muted-foreground">{itemName(b?.item_id)}</div></TableCell>
              <TableCell>{LEVEL[Number((b as { bom_level?: number } | undefined)?.bom_level ?? 1)]}</TableCell>
              <TableCell>v{v.version_no}</TableCell>
              <TableCell><StatusPill status={v.status} /></TableCell>
              <TableCell>{v.base_batch_qty} {v.base_uom}</TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" aria-label="Buka" onClick={() => void go(v.id)}><Eye className="size-4" /></Button>
                  {v.status === "approved" && <Button variant="ghost" size="icon" aria-label="Buat revisi" disabled={!data.canWrite} onClick={() => void go(`rev-${v.id}`)}><Copy className="size-4" /></Button>}
                  <Button variant="ghost" size="icon" aria-label="Bandingkan dengan versi sebelumnya" disabled={v.version_no === 1}
                    onClick={async () => {
                      const prev = data.versions.find((x) => x.bom_id === v.bom_id && x.version_no === v.version_no - 1);
                      if (!prev) return;
                      try { const [a, c] = await Promise.all([read({ data: { workspaceId, versionId: prev.id } }), read({ data: { workspaceId, versionId: v.id } })]); setCompare(compareBomLines(norm(a), norm(c))); }
                      catch (e) { toast.error(e instanceof Error ? e.message : "Gagal membandingkan"); }
                    }}><GitCompare className="size-4" /></Button>
                </div>
              </TableCell>
            </TableRow>
          );
        }}
      />
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
        <span className="text-sm">{page + 1} / {Math.max(1, Math.ceil(data.total / 25))}</span>
        <Button variant="outline" disabled={(page + 1) * 25 >= data.total} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
      </div>
      <Dialog open={compare !== null} onOpenChange={() => setCompare(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Perbandingan komposisi</DialogTitle></DialogHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Phase</TableHead><TableHead>Item</TableHead><TableHead>Sebelum</TableHead><TableHead>Sesudah</TableHead></TableRow></TableHeader>
            <TableBody>
              {compare?.map((r) => (
                <TableRow key={`${r.item_id}|${r.phase}`}>
                  <TableCell>{r.phase || "—"}</TableCell>
                  <TableCell>{data.items.find((i) => i.id === r.item_id)?.code ?? r.item_id}</TableCell>
                  <TableCell>{r.before ? `${r.before.qty_per_base} ${r.before.uom}` : "—"}</TableCell>
                  <TableCell>{r.after ? `${r.after.qty_per_base} ${r.after.uom}` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
