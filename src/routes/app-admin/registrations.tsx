import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Copy, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminList, adminSave } from "@/lib/platform.functions";
import { provisionRegistration } from "@/lib/provisioning.functions";

import { TablePager, usePaged } from "@/components/app/admin-table";

export const Route = createFileRoute("/app-admin/registrations")({
  component: RegistrationsPage,
});

type RegStatus = "pending" | "verified" | "provisioned" | "rejected";
const STATUSES: RegStatus[] = ["pending", "verified", "provisioned", "rejected"];

const STATUS_VARIANT: Record<RegStatus, "secondary" | "default" | "destructive" | "outline"> = {
  pending: "secondary",
  verified: "outline",
  provisioned: "default",
  rejected: "destructive",
};

interface Credentials {
  email: string;
  password: string | null;
  trialEndsAt: string;
  invoiceNumber: string;
}

function RegistrationsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RegStatus>("all");
  const [creds, setCreds] = useState<Credentials | null>(null);
  const provision = useServerFn(provisionRegistration);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-registrations"],
    queryFn: async () => {
      const data = await adminList({ data: { table: "registrations", orderBy: "created_at", orderDir: "desc" } });
      return data?.rows ?? [];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RegStatus }) => {
      await adminSave({ data: { table: "registrations", id, data: { status } } });
    },
    onSuccess: () => {
      toast.success("Registration updated");
      qc.invalidateQueries({ queryKey: ["admin-registrations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runProvision = useMutation({
    mutationFn: async (registrationId: string) => provision({ data: { registrationId } }),
    onSuccess: (res) => {
      setCreds({
        email: res.email,
        password: res.password,
        trialEndsAt: res.trialEndsAt,
        invoiceNumber: res.invoiceNumber,
      });
      toast.success("Tenant provisioned and ready to use");
      qc.invalidateQueries({ queryKey: ["admin-registrations"] });
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = rows.filter((r) => {
    const hit = `${r.company_name} ${r.subdomain} ${r.email} ${r.contact_name}`
      .toLowerCase()
      .includes(search.toLowerCase());
    return hit && (statusFilter === "all" || r.status === statusFilter);
  });

  const pg = usePaged(filtered);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Registrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verify online sign-ups, then provision the tenant: owner account, subscription, workspace with default
          chart of accounts, and the first invoice — in one click.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STATUSES.map((s) => (
          <Card key={s}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{s}</p>
              <p className="mt-1 text-2xl font-bold text-navy">
                {rows.filter((r) => r.status === s).length}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search company, subdomain, or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | RegStatus)}>
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
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>PIC</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    No registrations yet.
                  </TableCell>
                </TableRow>
              )}
              {pg.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium text-navy">{r.company_name}</p>
                    <p className="text-xs text-muted-foreground">{r.subdomain}.xperd.id</p>
                  </TableCell>
                  <TableCell className="text-sm">
                    <p>{r.contact_name}</p>
                    <p className="text-xs text-muted-foreground">{r.email}</p>
                  </TableCell>
                  <TableCell className="text-sm">{r.package_code}</TableCell>
                  <TableCell className="text-sm">{r.billing_cycle}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status as RegStatus]}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {r.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStatus.mutate({ id: r.id, status: "verified" })}
                        >
                          <CheckCircle2 /> Verify
                        </Button>
                      )}
                      {r.status !== "provisioned" && r.status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="gold"
                          disabled={runProvision.isPending}
                          onClick={() => runProvision.mutate(r.id)}
                        >
                          {runProvision.isPending && runProvision.variables === r.id ? (
                            <Loader2 className="animate-spin" />
                          ) : null}
                          Provision
                        </Button>
                      )}
                      {r.status !== "provisioned" && r.status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setStatus.mutate({ id: r.id, status: "rejected" })}
                        >
                          <XCircle /> Reject
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePager {...pg} />
        </CardContent>
      </Card>

      <Dialog open={!!creds} onOpenChange={(o) => !o && setCreds(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tenant is live</DialogTitle>
            <DialogDescription>
              Send these access details to the customer. The trial ends on {creds?.trialEndsAt} and invoice{" "}
              {creds?.invoiceNumber} is already drafted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
              <p className="font-medium">{creds?.email}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Temporary password</p>
              <p className="font-mono">{creds?.password ?? "Existing account — password unchanged"}</p>
            </div>
            {creds?.password && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(`${creds.email} / ${creds.password}`);
                  toast.success("Copied");
                }}
              >
                <Copy /> Copy credentials
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}