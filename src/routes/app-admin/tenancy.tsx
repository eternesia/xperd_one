import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { tenantSourceLabel } from "@/lib/tenant-source";
import { seo } from "@/components/qalling/QallingSite";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  adminDelete,
  adminList,
  adminListTenantsWithPackages,
  adminSave,
} from "@/lib/platform.functions";
import { adminResetTenantTransactions } from "@/lib/admin-users.functions";
import { formatDate } from "@/lib/xperd";

import { TablePager, usePaged } from "@/components/app/admin-table";

export const Route = createFileRoute("/app-admin/tenancy")({
  head: () =>
    seo(
      "Tenancy — XPERD Super Admin",
      "Kelola tenant, sumber pendaftaran Qalling dan XPERD, paket serta status pelanggan.",
    ),
  component: TenancyPage,
});

type TenantStatus = "trial" | "active" | "suspended" | "cancelled";

const STATUSES: TenantStatus[] = ["trial", "active", "suspended", "cancelled"];

const STATUS_VARIANT: Record<TenantStatus, "default" | "secondary" | "destructive" | "outline"> = {
  trial: "outline",
  active: "default",
  suspended: "secondary",
  cancelled: "destructive",
};

interface TenantForm {
  id?: string;
  name: string;
  subdomain: string;
  package_id: string;
  status: TenantStatus;
  industry: string;
  pic_name: string;
  pic_email: string;
  pic_phone: string;
  city: string;
  user_count: number;
  workspace_count: number;
  started_at: string;
  trial_ends_at: string;
  ends_at: string;
  notes: string;
}

const EMPTY: TenantForm = {
  name: "",
  subdomain: "",
  package_id: "",
  status: "trial",
  industry: "",
  pic_name: "",
  pic_email: "",
  pic_phone: "",
  city: "",
  user_count: 1,
  workspace_count: 1,
  started_at: new Date().toISOString().slice(0, 10),
  trial_ends_at: "",
  ends_at: "",
  notes: "",
};

function TenancyPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TenantForm>(EMPTY);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TenantStatus>("all");
  // #65: pemisah produk — tenant XPERD ERP vs Qalling.
  const [productFilter, setProductFilter] = useState<"all" | "xperd" | "qalling">("all");

  const { data: packages = [] } = useQuery({
    queryKey: ["admin-packages"],
    queryFn: async () => {
      const data = await adminList({
        data: { table: "packages", orderBy: "sort_order", orderDir: "asc" },
      });
      return data?.rows ?? [];
    },
  });

  const selectedPackage = packages.find((p) => p.id === form.package_id);
  const maxWorkspace = selectedPackage?.max_workspace ?? null;
  const maxUsers = selectedPackage?.max_users ?? null;
  const workspaceError =
    maxWorkspace !== null && form.workspace_count > maxWorkspace
      ? `${selectedPackage?.name} allows a maximum of ${maxWorkspace} workspace${maxWorkspace > 1 ? "s" : ""}.`
      : null;
  const userError =
    maxUsers !== null && form.user_count > maxUsers
      ? `${selectedPackage?.name} allows a maximum of ${maxUsers} users.`
      : null;
  const quotaBlocked = Boolean(workspaceError || userError);

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["admin-tenants"],
    queryFn: async () => {
      const rows = await adminListTenantsWithPackages({ data: {} });
      return (rows ?? []) as any[];
    },
  });

  const save = useMutation({
    mutationFn: async (values: TenantForm) => {
      const pkg = packages.find((p) => p.id === values.package_id);
      if (pkg?.max_workspace != null && Number(values.workspace_count) > pkg.max_workspace) {
        throw new Error(`${pkg.name} allows a maximum of ${pkg.max_workspace} workspace(s).`);
      }
      if (pkg?.max_users != null && Number(values.user_count) > pkg.max_users) {
        throw new Error(`${pkg.name} allows a maximum of ${pkg.max_users} users.`);
      }
      const payload = {
        name: values.name,
        subdomain: values.subdomain.trim().toLowerCase(),
        package_id: values.package_id || null,
        status: values.status,
        industry: values.industry || null,
        pic_name: values.pic_name || null,
        pic_email: values.pic_email || null,
        pic_phone: values.pic_phone || null,
        city: values.city || null,
        user_count: Number(values.user_count) || 1,
        workspace_count: Number(values.workspace_count) || 1,
        started_at: values.started_at || new Date().toISOString().slice(0, 10),
        trial_ends_at: values.trial_ends_at || null,
        ends_at: values.ends_at || null,
        notes: values.notes || null,
      };
      await adminSave({ data: { table: "tenants", id: values.id ?? undefined, data: payload } });
    },
    onSuccess: () => {
      toast.success("Tenant saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TenantStatus }) => {
      await adminSave({ data: { table: "tenants", id, data: { status } } });
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await adminDelete({ data: { table: "tenants", id } });
    },
    onSuccess: () => {
      toast.success("Tenant deleted");
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // #65: ganti produk tenant (XPERD ⇄ Qalling).
  const changeProduct = useMutation({
    mutationFn: async ({ id, product }: { id: string; product: "xperd" | "qalling" }) => {
      await adminSave({ data: { table: "tenants", id, data: { product } } });
    },
    onSuccess: (_r, v) => {
      toast.success(`Produk tenant diubah ke ${v.product === "qalling" ? "Qalling" : "XPERD"}`);
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = tenants.filter((t) => {
    const matchesSearch = `${t.name} ${t.subdomain} ${t.pic_email ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
    return (
      matchesSearch &&
      (statusFilter === "all" || t.status === statusFilter) &&
      (productFilter === "all" || (t.product ?? "xperd") === productFilter)
    );
  });

  const counts = STATUSES.map((s) => ({
    status: s,
    count: tenants.filter((t) => t.status === s).length,
  }));

  const pg = usePaged(filtered);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Tenancy</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create, update, and deactivate customer tenants and their packages.
          </p>
        </div>
        <Button
          variant="gold"
          onClick={() => {
            setForm(EMPTY);
            setOpen(true);
          }}
        >
          <Plus /> New tenant
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {counts.map((c) => (
          <Card key={c.status}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.status}</p>
              <p className="mt-1 text-2xl font-bold text-navy">{c.count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search tenant, subdomain, or PIC email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as "all" | TenantStatus)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={productFilter}
          onValueChange={(v) => setProductFilter(v as "all" | "xperd" | "qalling")}
        >
          <SelectTrigger className="w-44" aria-label="Filter produk">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua produk</SelectItem>
            <SelectItem value="xperd">XPERD ERP</SelectItem>
            <SelectItem value="qalling">Qalling</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Sumber daftar</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Workspaces</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Ends</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-sm text-muted-foreground">
                    No tenants found.
                  </TableCell>
                </TableRow>
              )}
              {pg.rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-navy">{t.name}</p>
                      {/* #65: klik badge untuk menukar produk tenant. */}
                      <button
                        type="button"
                        title="Ganti produk"
                        disabled={changeProduct.isPending}
                        onClick={() =>
                          changeProduct.mutate({
                            id: t.id,
                            product: (t.product ?? "xperd") === "qalling" ? "xperd" : "qalling",
                          })
                        }
                      >
                        <Badge
                          variant={(t.product ?? "xperd") === "qalling" ? "default" : "outline"}
                        >
                          {(t.product ?? "xperd") === "qalling" ? "Qalling" : "XPERD"}
                        </Badge>
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t.subdomain}.xperd.id</p>
                  </TableCell>
                  <TableCell className="text-sm">
                    <Badge variant="outline">{tenantSourceLabel(t.signup_source ?? null)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{t.packages?.name ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANT[t.status as TenantStatus]}>{t.status}</Badge>
                      <Select
                        value={t.status}
                        onValueChange={(v) =>
                          changeStatus.mutate({ id: t.id, status: v as TenantStatus })
                        }
                      >
                        <SelectTrigger
                          className="h-8 w-32"
                          aria-label={`Change status for ${t.name}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{t.workspace_count}</TableCell>
                  <TableCell className="text-sm">{t.user_count}</TableCell>
                  <TableCell className="text-sm">{formatDate(t.started_at)}</TableCell>
                  <TableCell className="text-sm">
                    {t.ends_at ? formatDate(t.ends_at) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit tenant"
                      onClick={() => {
                        setForm({
                          id: t.id,
                          name: t.name,
                          subdomain: t.subdomain,
                          package_id: t.package_id ?? "",
                          status: t.status as TenantStatus,
                          industry: t.industry ?? "",
                          pic_name: t.pic_name ?? "",
                          pic_email: t.pic_email ?? "",
                          pic_phone: t.pic_phone ?? "",
                          city: t.city ?? "",
                          user_count: t.user_count,
                          workspace_count: t.workspace_count ?? 1,
                          started_at: t.started_at ?? "",
                          trial_ends_at: t.trial_ends_at ?? "",
                          ends_at: t.ends_at ?? "",
                          notes: t.notes ?? "",
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {/* #25 (BS New): reset transaksi tenant — logika & daftar tabelnya
                        ada di KODE (`adminResetTenantTransactions`), tanpa trigger DB. */}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Reset transaction data"
                      title="Reset transaction data"
                      onClick={async () => {
                        const typed = prompt(
                          `Reset SEMUA transaksi "${t.name}" (jurnal, penjualan, pembelian, stok, kas/bank, pajak)? Master data tetap.\nKetik RESET untuk melanjutkan.`,
                        );
                        if (typed !== "RESET") return;
                        try {
                          const r = await adminResetTenantTransactions({
                            data: { tenantId: t.id },
                          });
                          toast.success(`Transaksi dibersihkan di ${r.workspaces} workspace.`);
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Gagal mereset transaksi");
                        }
                      }}
                    >
                      <RotateCcw className="h-4 w-4 text-amber-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete tenant"
                      onClick={() => {
                        if (confirm(`Delete tenant "${t.name}"? This cannot be undone.`))
                          remove.mutate(t.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit tenant" : "New tenant"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </Field>
              <Field label="Subdomain">
                <Input
                  value={form.subdomain}
                  onChange={(e) => setForm({ ...form, subdomain: e.target.value })}
                  pattern="[a-z0-9-]{3,32}"
                  required
                />
              </Field>
              <Field label="Package">
                <Select
                  value={form.package_id}
                  onValueChange={(v) => setForm({ ...form, package_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select package" />
                  </SelectTrigger>
                  <SelectContent>
                    {packages.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPackage && (
                  <p className="text-xs text-muted-foreground">
                    Quota: {maxWorkspace ?? "unlimited"} workspace · {maxUsers ?? "unlimited"} users
                  </p>
                )}
              </Field>
              <Field label="Status">
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as TenantStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["trial", "active", "suspended", "cancelled"] as TenantStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Industry">
                <Input
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                />
              </Field>
              <Field label="City">
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </Field>
              <Field label="PIC name">
                <Input
                  value={form.pic_name}
                  onChange={(e) => setForm({ ...form, pic_name: e.target.value })}
                />
              </Field>
              <Field label="PIC email">
                <Input
                  type="email"
                  value={form.pic_email}
                  onChange={(e) => setForm({ ...form, pic_email: e.target.value })}
                />
              </Field>
              <Field label="PIC phone">
                <Input
                  value={form.pic_phone}
                  onChange={(e) => setForm({ ...form, pic_phone: e.target.value })}
                />
              </Field>
              <Field label="Workspaces">
                <Input
                  type="number"
                  min={1}
                  max={maxWorkspace ?? undefined}
                  value={form.workspace_count}
                  onChange={(e) => setForm({ ...form, workspace_count: Number(e.target.value) })}
                />
                {workspaceError && <p className="text-xs text-destructive">{workspaceError}</p>}
              </Field>
              <Field label="Users">
                <Input
                  type="number"
                  min={1}
                  max={maxUsers ?? undefined}
                  value={form.user_count}
                  onChange={(e) => setForm({ ...form, user_count: Number(e.target.value) })}
                />
                {userError && <p className="text-xs text-destructive">{userError}</p>}
              </Field>
              <Field label="Started at">
                <Input
                  type="date"
                  value={form.started_at}
                  onChange={(e) => setForm({ ...form, started_at: e.target.value })}
                />
              </Field>
              <Field label="Trial ends at">
                <Input
                  type="date"
                  value={form.trial_ends_at}
                  onChange={(e) => setForm({ ...form, trial_ends_at: e.target.value })}
                />
              </Field>
              <Field label="Ends at">
                <Input
                  type="date"
                  value={form.ends_at}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Notes">
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={save.isPending || quotaBlocked}>
                {save.isPending ? "Saving…" : "Save tenant"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
