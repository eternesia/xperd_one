import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminField, AdminSelect, fmtIDR } from "@/components/app/admin-ui";
import { adminSaveAddonTier, listAddonTiers } from "@/lib/addon-catalog.functions";
import { validateTierPrice } from "@/lib/entitlements";
import { QALLING_FEATURE_LABELS } from "@/lib/qalling-catalog";
import { PRODUCTION_FEATURE_LABELS } from "@/lib/production";
import { TablePager, TableSearch, usePaged, rowText } from "@/components/app/admin-table";

const empty = {
  id: "",
  addon_id: "",
  code: "",
  name: "",
  monthly_price: 0,
  limits: "{}",
  features: "{}",
  is_active: true,
  sort_order: 0,
};

export function AddonTierCatalog({ addons }: { addons: { id: string; name: string; module_id?: string | null }[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const { data: tiers = [] } = useQuery({
    queryKey: ["addon-tiers"],
    queryFn: () => listAddonTiers(),
  });
  const pg = usePaged(tiers, rowText);
  const limitValues = JSON.parse(form.limits) as Record<string, number | null>;
  const featureValues = JSON.parse(form.features) as Record<string, boolean>;
  const save = useMutation({
    mutationFn: async () => {
      const limits = JSON.parse(form.limits) as Record<string, number | null>;
      const features = JSON.parse(form.features) as Record<string, boolean>;
      if (
        !limits ||
        Array.isArray(limits) ||
        typeof limits !== "object" ||
        !features ||
        Array.isArray(features) ||
        typeof features !== "object"
      )
        throw new Error("Limits/features harus berupa objek");
      if (Object.values(limits).some((v) => v !== null && (!Number.isSafeInteger(v) || v < 0)))
        throw new Error("Batas harus bilangan bulat positif atau null");
      if (Object.values(features).some((v) => typeof v !== "boolean"))
        throw new Error("Fitur harus true/false");
      validateTierPrice(
        form.monthly_price,
        limits.max_accounts ?? null,
        tiers
          .filter((t) => t.id !== form.id && t.addon_id === form.addon_id && t.is_active)
          .map((t) => ({ monthly_price: t.monthly_price, limits: t.limits })),
      );
      await adminSaveAddonTier({
        data: {
          id: form.id || undefined,
          addon_id: form.addon_id,
          code: form.code.trim(),
          name: form.name.trim(),
          monthly_price: form.monthly_price,
          limits,
          features,
          is_active: form.is_active,
          sort_order: form.sort_order,
        },
      });
    },
    onSuccess: () => {
      setOpen(false);
      toast.success("Tier saved");
      void qc.invalidateQueries({ queryKey: ["addon-tiers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Add-on tiers</h2>
        <Button
          variant="gold"
          onClick={() => {
            setForm({ ...empty, addon_id: addons[0]?.id ?? "" });
            setOpen(true);
          }}
        >
          <Plus />
          New tier
        </Button>
      </header>
      <TableSearch value={pg.query} onChange={pg.setQuery} placeholder="Cari paket…" />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tier</TableHead>
              <TableHead>Monthly</TableHead>
              <TableHead>Accounts</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Storage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pg.rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.code}</p>
                </TableCell>
                <TableCell>{fmtIDR(t.monthly_price)}</TableCell>
                <TableCell>{t.limits.max_accounts ?? "∞"}</TableCell>
                <TableCell>{t.limits.max_users ?? "∞"}</TableCell>
                <TableCell>{t.limits.storage_gb ?? "∞"} GB</TableCell>
                <TableCell>{t.is_active ? "Active" : "Hidden"}</TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${t.name}`}
                    onClick={() => {
                      setForm({
                        ...t,
                        limits: JSON.stringify(t.limits, null, 2),
                        features: JSON.stringify(t.features, null, 2),
                      });
                      setOpen(true);
                    }}
                  >
                    <Pencil />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <TablePager {...pg} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit tier" : "New tier"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField label="Add-on">
                <AdminSelect
                  value={form.addon_id}
                  onChange={(v) => setForm({ ...form, addon_id: v })}
                >
                  {addons.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminField label="Code">
                <Input
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </AdminField>
              <AdminField label="Name">
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </AdminField>
              <AdminField label="Monthly price (IDR)">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={form.monthly_price}
                  onChange={(e) => setForm({ ...form, monthly_price: Number(e.target.value) })}
                />
              </AdminField>
              {Object.entries({
                max_accounts: "Akun sosial",
                max_users: "Pengguna",
                storage_gb: "Penyimpanan (GB)",
                monthly_post_limit: "Posting per bulan",
                max_video_mb: "Batas video (MB)",
              }).map(([key, label]) => (
                <AdminField key={key} label={label}>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Tanpa batas"
                    value={limitValues[key] ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        limits: JSON.stringify({
                          ...limitValues,
                          [key]: e.target.value === "" ? null : Number(e.target.value),
                        }),
                      })
                    }
                  />
                </AdminField>
              ))}
              <div className="sm:col-span-2">
                <h3 className="mb-3 text-sm font-medium">Menu & fitur paket</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {Object.entries(
                    addons.find((x) => x.id === form.addon_id)?.module_id === "manufacturing"
                      ? PRODUCTION_FEATURE_LABELS
                      : QALLING_FEATURE_LABELS,
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={featureValues[key] === true}
                        onCheckedChange={(v) =>
                          setForm({
                            ...form,
                            features: JSON.stringify({ ...featureValues, [key]: v === true }),
                          })
                        }
                      />
                      {label.id}
                    </label>
                  ))}
                </div>
              </div>
              <AdminField label="Sort order">
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                />
              </AdminField>
              <label className="flex items-center gap-3">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
                Available for new assignments
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="gold" disabled={save.isPending || !form.addon_id}>
                Save tier
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
