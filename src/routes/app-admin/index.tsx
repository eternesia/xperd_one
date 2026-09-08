import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, CreditCard, FileText, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAdminDashboardStats } from "@/lib/platform.functions";
import { formatDate, formatIDR } from "@/lib/xperd";

export const Route = createFileRoute("/app-admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const res = await getAdminDashboardStats({ data: {} });
      return {
        tenantCount: res.tenantCount,
        activeTenants: res.activeTenants,
        subCount: res.subCount,
        leadCount: res.leadCount,
        outstanding: res.outstanding,
        recent: res.recent ?? [],
      };
    },
  });

  const stats = [
    { label: "Tenants", value: String(data?.tenantCount ?? 0), icon: Building2, hint: `${data?.activeTenants ?? 0} active` },
    { label: "Subscriptions", value: String(data?.subCount ?? 0), icon: CreditCard, hint: "All plans" },
    { label: "Outstanding invoices", value: formatIDR(data?.outstanding ?? 0), icon: FileText, hint: "Unpaid total" },
    { label: "Sales leads", value: String(data?.leadCount ?? 0), icon: Users, hint: "Business & Enterprise" },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-navy">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of tenancy, subscriptions, and billing across the XPERD platform.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-gold" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-navy">{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Latest tenants</CardTitle>
          <Link to="/app-admin/tenancy" className="text-sm text-gold hover:underline">
            Manage tenancy
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.recent ?? []).map((t) => (
            <div key={t.id} className="flex items-center justify-between border-b border-border/60 pb-3 last:border-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-navy">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.subdomain}.xperd.id · {formatDate(t.created_at)}</p>
              </div>
              <Badge variant="secondary">{t.status}</Badge>
            </div>
          ))}
          {(data?.recent ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No tenants yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
