import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Blocks, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminField, AdminSelect, fmtIDR, todayISO } from "@/components/app/admin-ui";
import { adminDelete, adminList, adminSave } from "@/lib/platform.functions";
import {
  adminListTenantAddons,
  adminSetTenantAddonStatus,
  adminUpsertTenantAddon,
} from "@/lib/addons.functions";
import { useServerFn } from "@tanstack/react-start";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddonTierCatalog } from "@/components/app/AddonTierCatalog";
import { AddonOptionCatalog } from "@/components/app/AddonOptionCatalog";
import { listAddonTiers } from "@/lib/addon-catalog.functions";
import { TablePager, TableSearch, usePaged } from "@/components/app/admin-table";

export const Route = createFileRoute("/app-admin/addons")({
  component: AddonsPage,
});

interface AddonForm {
  id?: string;
  code: string;
  name: string;
  tagline: string;
  description: string;
  monthly_price: number;
  module_id: string;
  is_active: boolean;
  sort_order: number;
}

const EMPTY: AddonForm = {
  code: "",
  name: "",
  tagline: "",
  description: "",
  monthly_price: 0,
  module_id: "",
  is_active: true,
  sort_order: 0,
};

function AddonsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AddonForm>(EMPTY);
  const [grant, setGrant] = useState({ tenant_id: "", addon_id: "", tier_id: "", status: "active", ends_at: "" });
  const { data: tiers = [] } = useQuery({ queryKey: ["addon-tiers"], queryFn: () => listAddonTiers() });

  const { data: addons = [] } = useQuery({
    queryKey: ["admin-addons"],
    queryFn: async () => {
      const res = await adminList({ data: { table: "addons", orderBy: "sort_order", orderDir: "asc", limit: 500 } });
      return (res?.rows ?? []).map((r) => ({
        ...r,
        monthly_price: Number(r.monthly_price) || 0,
        is_active: Boolean(r.is_active),
        sort_order: Number(r.sort_order) || 0,
      })) as any[];
    },
  });

  const { data: tenants = [] } = useQuery({
    queryKey: ["admin-addon-tenants"],
    queryFn: async () => {
      const res = await adminList({ data: { table: "tenants", orderBy: "name", orderDir: "asc", limit: 2000 } });
      return (res?.rows ?? []) as any[];
    },
  });

  const { data: subs = [] } = useQuery({
    queryKey: ["admin-tenant-addons"],
    queryFn: async () => {
      const rows = await adminListTenantAddons();
      return (rows ?? []) as any[];
    },
  });

  const subPg = usePaged(
    subs,
    (r) => `${tenants.find((t) => t.id === r.tenant_id)?.name ?? ""} ${addons.find((a) => a.id === r.addon_id)?.name ?? ""} ${r.status}`,
  );

  const saveAddon = useMutation({
    mutationFn: async (v: AddonForm) => {
      const payload = {
        code: v.code.trim(),
        name: v.name.trim(),
        tagline: v.tagline || null,
        description: v.description || null,
        monthly_price: Number(v.monthly_price) || 0,
        module_id: v.module_id || null,
        is_active: v.is_active ? 1 : 0,
        sort_order: Number(v.sort_order) || 0,
      };
      await adminSave({ data: { table: "addons", id: v.id || undefined, data: payload } });
    },
    onSuccess: () => {
      toast.success("Add-on saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-addons"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAddon = useMutation({
    mutationFn: async (id: string) => {
      await adminDelete({ data: { table: "addons", id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-addons"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const grantAddon = useMutation({
    mutationFn: async () => {
      const addon = addons.find((a) => a.id === grant.addon_id);
      const tier = tiers.find((t) => t.id === grant.tier_id && t.addon_id === grant.addon_id && t.is_active);
      if (grant.tier_id && !tier) throw new Error("Tier unavailable");
      await adminUpsertTenantAddon({
        data: {
          tenantId: grant.tenant_id,
          addonId: grant.addon_id,
          status: grant.status,
          startsAt: todayISO(),
          endsAt: grant.ends_at || undefined,
          tierId: tier?.id ?? null,
          monthlyPrice: Number(tier?.monthly_price ?? addon?.monthly_price ?? 0),
        },
      });
    },
    onSuccess: () => {
      toast.success("Add-on assigned");
      setGrant({ tenant_id: "", addon_id: "", tier_id: "", status: "active", ends_at: "" });
      qc.invalidateQueries({ queryKey: ["workspace-entitlements"] });
      qc.invalidateQueries({ queryKey: ["admin-tenant-addons"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSub = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await adminSetTenantAddonStatus({ data: { id, status } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-tenant-addons"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? id;
  const addonName = (id: string) => addons.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">MONETISATION</p>
          <h1 className="text-2xl font-semibold text-navy dark:text-primary-foreground">Add-on Modules</h1>
        </div>
        <Button
          variant="navy"
          onClick={() => {
            setForm(EMPTY);
            setOpen(true);
          }}
        >
          <Plus /> New add-on
        </Button>
      </div>

      <Tabs defaultValue="tiers" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="tiers">Tiers</TabsTrigger>
          <TabsTrigger value="options">Optional extras</TabsTrigger>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="tenants">Tenant add-ons</TabsTrigger>
        </TabsList>
        <TabsContent value="tiers">
          <Card>
            <CardContent className="pt-6">
              <AddonTierCatalog addons={addons} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="options">
          <Card>
            <CardContent className="pt-6">
              <AddonOptionCatalog />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="catalog">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Blocks className="h-4 w-4 text-gold" /> Catalog
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Module</TableHead>
                <TableHead className="text-right">Price / month</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {addons.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.code}</TableCell>
                  <TableCell>{a.name}</TableCell>
                  <TableCell>{a.module_id ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmtIDR(Number(a.monthly_price))}</TableCell>
                  <TableCell>
                    <Badge variant={a.is_active ? "secondary" : "outline"}>{a.is_active ? "Active" : "Hidden"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setForm({
                          id: a.id,
                          code: a.code,
                          name: a.name,
                          tagline: a.tagline ?? "",
                          description: a.description ?? "",
                          monthly_price: Number(a.monthly_price),
                          module_id: a.module_id ?? "",
                          is_active: a.is_active,
                          sort_order: a.sort_order,
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeAddon.mutate(a.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="tenants">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tenant activation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-6">
            <AdminField label="Tenant">
              <AdminSelect value={grant.tenant_id} onChange={(v) => setGrant({ ...grant, tenant_id: v })}>
                <option value="">Select tenant</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Add-on">
              <AdminSelect value={grant.addon_id} onChange={(v) => setGrant({ ...grant, addon_id: v, tier_id: "" })}>
                <option value="">Select add-on</option>
                {addons.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Tier">
              <AdminSelect value={grant.tier_id} onChange={(v) => setGrant({ ...grant, tier_id: v })}>
                <option value="">Legacy / flat</option>
                {tiers
                  .filter((t) => t.addon_id === grant.addon_id && t.is_active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {fmtIDR(t.monthly_price)}
                    </option>
                  ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Status">
              <AdminSelect value={grant.status} onChange={(v) => setGrant({ ...grant, status: v })}>
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="inactive">Inactive</option>
              </AdminSelect>
            </AdminField>
            <AdminField label="Ends at (optional)">
              <Input type="date" value={grant.ends_at} onChange={(e) => setGrant({ ...grant, ends_at: e.target.value })} />
            </AdminField>
            <div className="flex items-end">
              <Button
                variant="gold"
                className="w-full"
                disabled={!grant.tenant_id || !grant.addon_id || grantAddon.isPending}
                onClick={() => grantAddon.mutate()}
              >
                <Power /> Apply
              </Button>
            </div>
          </div>

          <div className="mb-4 p-4"><TableSearch value={subPg.query} onChange={subPg.setQuery} placeholder="Cari tenant atau add-on…" /></div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Add-on</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No tenant has an add-on yet.
                  </TableCell>
                </TableRow>
              )}
              {subPg.rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{tenantName(s.tenant_id)}</TableCell>
                  <TableCell>
                    {addonName(s.addon_id)}
                    <p className="text-xs text-muted-foreground">
                      {tiers.find((t) => t.id === s.tier_id)?.name ?? "Legacy / flat"}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">{fmtIDR(Number(s.monthly_price))}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.starts_at} → {s.ends_at ?? "∞"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.status === "inactive" ? "outline" : "secondary"}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        toggleSub.mutate({ id: s.id, status: s.status === "active" ? "inactive" : "active" })
                      }
                    >
                      {s.status === "active" ? "Deactivate" : "Activate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePager {...subPg} />
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit add-on" : "New add-on"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Code">
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </AdminField>
            <AdminField label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </AdminField>
            <AdminField label="Module id">
              <Input value={form.module_id} onChange={(e) => setForm({ ...form, module_id: e.target.value })} placeholder="crm" />
            </AdminField>
            <AdminField label="Monthly price (IDR)">
              <Input
                type="number"
                value={form.monthly_price}
                onChange={(e) => setForm({ ...form, monthly_price: Number(e.target.value) })}
              />
            </AdminField>
            <AdminField label="Tagline">
              <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
            </AdminField>
            <AdminField label="Sort order">
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
              />
            </AdminField>
            <div className="sm:col-span-2">
              <AdminField label="Description">
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </AdminField>
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <span className="text-sm text-muted-foreground">Visible / purchasable</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="navy"
              disabled={!form.code.trim() || !form.name.trim() || saveAddon.isPending}
              onClick={() => saveAddon.mutate(form)}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}