import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutList, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminList, adminSave } from "@/lib/platform.functions";
import { AdminField, AdminSelect, fmtIDR } from "@/components/app/admin-ui";

import { TablePager, TableSearch, usePaged, rowText } from "@/components/app/admin-table";

export const Route = createFileRoute("/app-admin/packages")({
  component: PackagesPage,
});

interface PlanForm {
  id?: string;
  code: string;
  name: string;
  product_line: string;
  tagline: string;
  description: string;
  monthly_price: number;
  max_workspace: number;
  max_users: number;
  max_company: number;
  features: string;
  sort_order: number;
  is_public_signup: boolean;
  is_active: boolean;
}

const EMPTY: PlanForm = {
  code: "",
  name: "",
  product_line: "one",
  tagline: "",
  description: "",
  monthly_price: 0,
  max_workspace: 1,
  max_users: 3,
  max_company: 1,
  features: "",
  sort_order: 0,
  is_public_signup: true,
  is_active: true,
};

function PackagesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PlanForm>(EMPTY);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-packages"],
    queryFn: async () => {
      const data = await adminList({ data: { table: "packages", orderBy: "sort_order", orderDir: "asc" } });
      return data?.rows ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (v: PlanForm) => {
      const features = v.features
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);
      const payload = {
        code: v.code.trim(),
        name: v.name.trim(),
        product_line: v.product_line as "one",
        tagline: v.tagline || null,
        description: v.description || null,
        monthly_price: Number(v.monthly_price) || 0,
        max_workspace: Number(v.max_workspace) || null,
        max_users: Number(v.max_users) || null,
        max_company: Number(v.max_company) || null,
        features,
        sort_order: Number(v.sort_order) || 0,
        is_public_signup: v.is_public_signup,
        is_active: v.is_active,
      };
      await adminSave({ data: { table: "packages", id: v.id ?? undefined, data: payload } });
    },
    onSuccess: () => {
      toast.success("Plan saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-packages"] });
      qc.invalidateQueries({ queryKey: ["packages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pg = usePaged(rows, rowText);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-navy">
            <LayoutList className="h-5 w-5 text-gold" /> Plan & Packages
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Control the pricing plans shown on the public website and the quota limits enforced per tenant.
          </p>
        </div>
        <Button variant="gold" onClick={() => { setForm(EMPTY); setOpen(true); }}>
          <Plus /> New plan
        </Button>
      </header>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <div className="border-b border-border p-4"><TableSearch value={pg.query} onChange={pg.setQuery} /></div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Line</TableHead>
                <TableHead className="text-right">Monthly</TableHead>
                <TableHead>Quota (WS / Users)</TableHead>
                <TableHead>Website</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {pg.rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <p className="font-medium text-navy">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.code}</p>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{p.product_line}</Badge></TableCell>
                  <TableCell className="text-right text-sm">
                    {p.monthly_price ? fmtIDR(Number(p.monthly_price)) : "Custom"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.max_workspace ?? "∞"} / {p.max_users ?? "∞"}
                  </TableCell>
                  <TableCell className="space-x-1">
                    <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Visible" : "Hidden"}</Badge>
                    {Boolean(Number(p.is_public_signup)) && <Badge variant="secondary">Self-signup</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit plan"
                      onClick={() => {
                        setForm({
                          id: p.id,
                          code: p.code,
                          name: p.name,
                          product_line: p.product_line,
                          tagline: p.tagline ?? "",
                          description: p.description ?? "",
                          monthly_price: Number(p.monthly_price ?? 0),
                          max_workspace: Number(p.max_workspace ?? 0),
                          max_users: Number(p.max_users ?? 0),
                          max_company: Number(p.max_company ?? 0),
                          features: Array.isArray(p.features) ? (p.features as string[]).join("\n") : "",
                          sort_order: p.sort_order,
                          is_public_signup: p.is_public_signup,
                          is_active: p.is_active,
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePager {...pg} />
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit plan" : "New plan"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField label="Code">
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
              </AdminField>
              <AdminField label="Name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </AdminField>
              <AdminField label="Product line">
                <AdminSelect value={form.product_line} onChange={(v: string) => setForm({ ...form, product_line: v })}>
                  <option value="one">one</option>
                  <option value="business">business</option>
                  <option value="enterprise">enterprise</option>
                </AdminSelect>
              </AdminField>
              <AdminField label="Monthly price (IDR, 0 = custom)">
                <Input type="number" value={form.monthly_price} onChange={(e) => setForm({ ...form, monthly_price: Number(e.target.value) })} />
              </AdminField>
              <AdminField label="Max workspace">
                <Input type="number" value={form.max_workspace} onChange={(e) => setForm({ ...form, max_workspace: Number(e.target.value) })} />
              </AdminField>
              <AdminField label="Max users">
                <Input type="number" value={form.max_users} onChange={(e) => setForm({ ...form, max_users: Number(e.target.value) })} />
              </AdminField>
              <AdminField label="Max company">
                <Input type="number" value={form.max_company} onChange={(e) => setForm({ ...form, max_company: Number(e.target.value) })} />
              </AdminField>
              <AdminField label="Sort order">
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </AdminField>
            </div>
            <AdminField label="Tagline">
              <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
            </AdminField>
            <AdminField label="Description">
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </AdminField>
            <AdminField label="Features (one per line)">
              <Textarea rows={5} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} />
            </AdminField>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-3">
                <Switch id="plan-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label htmlFor="plan-active">Show on website</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch id="plan-signup" checked={form.is_public_signup} onCheckedChange={(v) => setForm({ ...form, is_public_signup: v })} />
                <Label htmlFor="plan-signup">Allow online self-registration</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="gold" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save plan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}