import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Pencil, Plus, Trash2 } from "lucide-react";
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
import { adminDelete, adminList, adminSave } from "@/lib/platform.functions";
import { AdminField, AdminSelect } from "@/components/app/admin-ui";

export const Route = createFileRoute("/app-admin/payments")({
  component: PaymentsPage,
});

interface GatewayForm {
  id?: string;
  provider: string;
  display_name: string;
  mode: string;
  is_active: boolean;
  merchant_id: string;
  client_key: string;
  server_key_secret_name: string;
  server_key: string;
  has_server_key?: boolean;
  callback_url: string;
  instructions: string;
  sort_order: number;
}

const EMPTY: GatewayForm = {
  provider: "midtrans",
  display_name: "Midtrans Snap",
  mode: "sandbox",
  is_active: false,
  merchant_id: "",
  client_key: "",
  server_key_secret_name: "",
  server_key: "",
  callback_url: "",
  instructions: "",
  sort_order: 0,
};

const PROVIDERS = ["midtrans", "xendit", "doku", "stripe", "manual_transfer"];

function PaymentsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<GatewayForm>(EMPTY);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-payment-gateways"],
    queryFn: async () => {
      const data = await adminList({ data: { table: "payment_gateways", orderBy: "sort_order", orderDir: "asc" } });
      return data?.rows ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (v: GatewayForm) => {
      const payload = {
        provider: v.provider,
        display_name: v.display_name.trim(),
        mode: v.mode,
        is_active: v.is_active,
        merchant_id: v.merchant_id || null,
        client_key: v.client_key || null,
        server_key_secret_name: v.server_key_secret_name || null,
        server_key: v.server_key,
        callback_url: v.callback_url || null,
        instructions: v.instructions || null,
        sort_order: Number(v.sort_order) || 0,
      };
      await adminSave({ data: { table: "payment_gateways", id: v.id ?? undefined, data: payload } });
    },
    onSuccess: () => {
      toast.success("Gateway saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-payment-gateways"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await adminDelete({ data: { table: "payment_gateways", id } });
    },
    onSuccess: () => {
      toast.success("Gateway removed");
      qc.invalidateQueries({ queryKey: ["admin-payment-gateways"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-navy">
            <CreditCard className="h-5 w-5 text-gold" /> Payment Gateway
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure the checkout providers tenants use to activate or renew their package.
          </p>
        </div>
        <Button variant="gold" onClick={() => { setForm(EMPTY); setOpen(true); }}>
          <Plus /> Add gateway
        </Button>
      </header>

      <Card className="border-gold/40 bg-gold/5">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Paste the gateway <span className="font-medium text-navy">Server key</span> below. It is stored write-only
          and never shown again (leave it empty to keep the saved key). The
          <span className="font-medium text-navy"> Server key secret name </span> field is an optional fallback to an
          environment variable.
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gateway</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Merchant / Client key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No gateway configured yet.</TableCell></TableRow>
              )}
              {rows.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>
                    <p className="font-medium text-navy">{g.display_name}</p>
                    <p className="text-xs text-muted-foreground">{g.provider}</p>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{g.mode}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <p>{g.merchant_id || "—"}</p>
                    <p className="truncate">{g.client_key || "—"}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={g.is_active ? "default" : "secondary"}>{g.is_active ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit gateway"
                      onClick={() => {
                        setForm({
                          id: g.id,
                          provider: g.provider,
                          display_name: g.display_name,
                          mode: g.mode,
                          is_active: g.is_active,
                          merchant_id: g.merchant_id ?? "",
                          client_key: g.client_key ?? "",
                          server_key_secret_name: g.server_key_secret_name ?? "",
                          server_key: "",
                          has_server_key: Boolean(Number(g.has_server_key)),
                          callback_url: g.callback_url ?? "",
                          instructions: g.instructions ?? "",
                          sort_order: g.sort_order,
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete gateway"
                      onClick={() => { if (confirm(`Delete ${g.display_name}?`)) remove.mutate(g.id); }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit gateway" : "New gateway"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField label="Provider">
                <AdminSelect value={form.provider} onChange={(v: string) => setForm({ ...form, provider: v })}>
                  {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                </AdminSelect>
              </AdminField>
              <AdminField label="Display name">
                <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} required />
              </AdminField>
              <AdminField label="Mode">
                <AdminSelect value={form.mode} onChange={(v: string) => setForm({ ...form, mode: v })}>
                  <option value="sandbox">sandbox</option>
                  <option value="live">live</option>
                </AdminSelect>
              </AdminField>
              <AdminField label="Sort order">
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </AdminField>
              <AdminField label="Merchant ID">
                <Input value={form.merchant_id} onChange={(e) => setForm({ ...form, merchant_id: e.target.value })} />
              </AdminField>
              <AdminField label="Client key (publishable)">
                <Input value={form.client_key} onChange={(e) => setForm({ ...form, client_key: e.target.value })} />
              </AdminField>
              <AdminField label="Server key secret name">
                <Input
                  value={form.server_key_secret_name}
                  onChange={(e) => setForm({ ...form, server_key_secret_name: e.target.value })}
                  placeholder="MIDTRANS_SERVER_KEY"
                />
              </AdminField>
              <AdminField label="Server key (rahasia)">
                <Input
                  id="gw-server-key"
                  type="password"
                  autoComplete="new-password"
                  value={form.server_key}
                  onChange={(e) => setForm({ ...form, server_key: e.target.value })}
                  placeholder={form.has_server_key ? "Tersimpan — kosongkan untuk mempertahankan" : "Tempel server key dari dashboard gateway"}
                />
              </AdminField>
              <AdminField label="Callback / webhook URL">
                <Input value={form.callback_url} onChange={(e) => setForm({ ...form, callback_url: e.target.value })} />
              </AdminField>
            </div>
            <AdminField label="Payment instructions (shown to tenant)">
              <Textarea rows={3} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
            </AdminField>
            <div className="flex items-center gap-3">
              <Switch id="gw-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label htmlFor="gw-active">Active for tenant checkout</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="gold" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save gateway"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}