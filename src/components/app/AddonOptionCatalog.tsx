import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminField, fmtIDR } from "@/components/app/admin-ui";
import {
  adminSaveAddonOption,
  listAddonOptions,
  type AddonOption,
} from "@/lib/addon-catalog.functions";

export function AddonOptionCatalog() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["admin-addon-options"],
    queryFn: () => listAddonOptions({ data: {} }),
  });
  const [editing, setEditing] = useState<AddonOption | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      if (
        !Number.isSafeInteger(editing.monthly_price) ||
        editing.monthly_price < 0 ||
        !Number.isInteger(editing.max_quantity) ||
        editing.max_quantity < 1
      )
        throw new Error("Harga dan jumlah tidak valid");
      await adminSaveAddonOption({
        data: {
          id: editing.id,
          name: editing.name,
          monthly_price: editing.monthly_price,
          max_quantity: editing.max_quantity,
          is_active: editing.is_active,
        },
      });
    },
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["admin-addon-options"] });
      void qc.invalidateQueries({ queryKey: ["addon-options"] });
      toast.success("Option saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Optional extras</h2>
      <div className="divide-y divide-border">
        {rows.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">{o.name}</p>
              <p className="text-xs text-muted-foreground">
                {o.requires_features.join(", ") || "All tiers"} · max {o.max_quantity} ·{" "}
                {o.is_active ? "Active" : "Hidden"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm">{fmtIDR(o.monthly_price)} /unit/month</span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Edit option ${o.name}`}
                onClick={() => setEditing({ ...o })}
              >
                <Pencil />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.name}</DialogTitle>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <AdminField label="Name">
                <Input
                  required
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </AdminField>
              <AdminField label="Monthly price (IDR)">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={editing.monthly_price}
                  onChange={(e) =>
                    setEditing({ ...editing, monthly_price: Number(e.target.value) })
                  }
                />
              </AdminField>
              <AdminField label="Maximum quantity">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={editing.max_quantity}
                  onChange={(e) => setEditing({ ...editing, max_quantity: Number(e.target.value) })}
                />
              </AdminField>
              <label className="flex items-center gap-3">
                <Switch
                  checked={editing.is_active}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
                Available
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button variant="gold" disabled={save.isPending}>
                  Save option
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
