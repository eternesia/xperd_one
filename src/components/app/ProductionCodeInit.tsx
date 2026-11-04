import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { initializeProductionCodes } from "@/lib/production.functions";

export function ProductionCodeInit({ workspaceId }: { workspaceId: string }) {
  const initialize = useServerFn(initializeProductionCodes);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return <Button variant="outline" disabled={busy} onClick={async () => {
    setBusy(true);
    try { const r = await initialize({ data: { workspaceId, reason: "Inisialisasi kode formulasi CropLife oleh pengelola workspace" } }); toast.success(`${r.inserted} kode ditambahkan`); await qc.invalidateQueries({ queryKey: ["production", workspaceId] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Kode belum tersimpan"); }
    finally { setBusy(false); }
  }}><Database className="h-4 w-4" />Tambahkan kode standar</Button>;
}