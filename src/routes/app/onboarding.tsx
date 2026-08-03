import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { slugify, useApp } from "@/lib/app-context";
import { INDUSTRIES } from "@/lib/xperd";

export const Route = createFileRoute("/app/onboarding")({
  component: Onboarding,
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function Onboarding() {
  const { tenant, workspaces, userId, refresh, loading } = useApp();
  const navigate = useNavigate();
  const step = !tenant ? 1 : workspaces.length === 0 ? 2 : 3;

  useEffect(() => {
    if (!loading && tenant && workspaces.length > 0) navigate({ to: "/app", replace: true });
  }, [loading, tenant, workspaces.length, navigate]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-2 text-center">
        <p className="text-xs font-semibold tracking-[0.28em] text-gold">GETTING STARTED</p>
        <h1 className="text-3xl font-semibold text-navy">Set up XPERD One</h1>
        <p className="text-sm text-muted-foreground">
          Step {step} of 2 — {step === 1 ? "create your organisation" : "create your first company workspace"}
        </p>
      </div>
      {step === 1 ? (
        <OrganisationStep userId={userId} onDone={refresh} />
      ) : (
        <WorkspaceStep onDone={refresh} />
      )}
    </div>
  );
}

function OrganisationStep({ userId, onDone }: { userId?: string; onDone: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [city, setCity] = useState("");
  const [packageCode, setPackageCode] = useState("one-starter");
  const [busy, setBusy] = useState(false);

  const { data: packages } = useQuery({
    queryKey: ["signup-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("id,code,name,max_workspace,max_users,monthly_price")
        .eq("is_public_signup", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    const slug = slugify(subdomain || name);
    if (slug.length < 3) {
      toast.error("Subdomain must be at least 3 characters");
      return;
    }
    setBusy(true);
    try {
      const pkg = packages?.find((p) => p.code === packageCode);
      const trialEnds = new Date();
      trialEnds.setDate(trialEnds.getDate() + 14);
      const { error } = await supabase.from("tenants").insert({
        name: name.trim(),
        subdomain: slug,
        owner_id: userId,
        package_id: pkg?.id ?? null,
        status: "trial",
        industry: industry || null,
        city: city || null,
        trial_ends_at: trialEnds.toISOString().slice(0, 10),
        workspace_count: 0,
      });
      if (error) throw error;
      await onDone();
      toast.success("Organisation created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create organisation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your organisation</CardTitle>
        <CardDescription>This is your tenant — it can hold one or more company workspaces.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="org">Organisation name</Label>
            <Input
              id="org"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!subdomain) setSubdomain(slugify(e.target.value));
              }}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sub">Subdomain</Label>
            <div className="flex items-center gap-2">
              <Input
                id="sub"
                value={subdomain}
                onChange={(e) => setSubdomain(slugify(e.target.value))}
                required
              />
              <span className="whitespace-nowrap text-xs text-muted-foreground">.xperd.app</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Package</Label>
            <Select value={packageCode} onValueChange={setPackageCode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(packages ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.code}>
                    {p.name} — {p.max_workspace} workspace / {p.max_users} users
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Industry</Label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger>
                <SelectValue placeholder="Select an industry" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => (
                  <SelectItem key={i.slug} value={i.slug}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant="navy" disabled={busy} className="w-full">
              {busy && <Loader2 className="animate-spin" />} Continue
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function WorkspaceStep({ onDone }: { onDone: () => Promise<void> }) {
  const { tenant, userId } = useApp();
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [fiscalMonth, setFiscalMonth] = useState("1");
  const [costing, setCosting] = useState<"FIFO" | "LIFO" | "AVERAGE">("AVERAGE");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant || !userId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("workspaces")
        .insert({
          tenant_id: tenant.id,
          name: name.trim(),
          legal_name: legalName.trim() || null,
          slug: slugify(name),
          currency,
          timezone,
          fiscal_year_start_month: Number(fiscalMonth),
          default_costing_method: costing,
          status: "active",
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: memberError } = await supabase
        .from("workspace_members")
        .insert({ workspace_id: data.id, user_id: userId, role: "owner" });
      if (memberError) throw memberError;

      await onDone();
      toast.success("Workspace ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create workspace");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your first company workspace</CardTitle>
        <CardDescription>
          One workspace = one company, with its own ledger, chart of accounts and fiscal calendar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="wsname">Company / workspace name</Label>
            <Input id="wsname" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="legal">Legal entity name</Label>
            <Input id="legal" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["IDR", "USD", "SGD", "EUR"].map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "Asia/Singapore"].map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Fiscal year starts</Label>
            <Select value={fiscalMonth} onValueChange={setFiscalMonth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Default inventory costing</Label>
            <Select value={costing} onValueChange={(v) => setCosting(v as typeof costing)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AVERAGE">Moving Average</SelectItem>
                <SelectItem value="FIFO">FIFO</SelectItem>
                <SelectItem value="LIFO">LIFO (managerial only)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <Button type="submit" variant="gold" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Finish setup
            </Button>
            <p className="text-xs text-muted-foreground">
              Package quota is enforced automatically when you add more workspaces.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}