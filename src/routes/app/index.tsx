import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Building2, Loader2, LogOut, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { slugify, useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/app/")({
  component: WorkspacePicker,
});

function WorkspacePicker() {
  const { workspaces, tenant, pkg, userId, email, refresh, setActiveWorkspaceId } = useApp();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [costing, setCosting] = useState<"FIFO" | "LIFO" | "AVERAGE">("AVERAGE");
  const [busy, setBusy] = useState(false);

  const quota = pkg?.max_workspace ?? null;
  const atLimit = quota !== null && workspaces.length >= quota;

  function enter(id: string) {
    setActiveWorkspaceId(id);
    navigate({ to: "/app/w/$workspaceId", params: { workspaceId: id } });
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant || !userId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("workspaces")
        .insert({
          tenant_id: tenant.id,
          name: name.trim(),
          slug: slugify(name),
          currency,
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
      toast.success(lang === "id" ? "Workspace dibuat" : "Workspace created");
      setOpen(false);
      setName("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create workspace");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">XPERD ONE</p>
          <h1 className="mt-1 text-3xl font-semibold text-navy dark:text-primary-foreground">
            {lang === "id" ? "Pilih workspace" : "Choose a workspace"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tenant?.name} · {workspaces.length} / {quota ?? "∞"} {lang === "id" ? "workspace terpakai" : "workspaces used"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="gold" disabled={atLimit}>
                <Plus /> {lang === "id" ? "Workspace baru" : "New workspace"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{lang === "id" ? "Buat workspace" : "Create workspace"}</DialogTitle>
                <DialogDescription>
                  {lang === "id"
                    ? "Satu workspace = satu perusahaan dengan buku besar sendiri."
                    : "One workspace = one company with its own ledger."}
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={create}>
                <div className="space-y-2">
                  <Label htmlFor="wname">{lang === "id" ? "Nama perusahaan" : "Company name"}</Label>
                  <Input id="wname" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{lang === "id" ? "Mata uang" : "Currency"}</Label>
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
                    <Label>{lang === "id" ? "Metode costing" : "Costing method"}</Label>
                    <Select value={costing} onValueChange={(v) => setCosting(v as typeof costing)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AVERAGE">Moving Average</SelectItem>
                        <SelectItem value="FIFO">FIFO</SelectItem>
                        <SelectItem value="LIFO">LIFO</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" variant="navy" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />} {lang === "id" ? "Buat workspace" : "Create workspace"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth", replace: true });
            }}
          >
            <LogOut /> {lang === "id" ? "Keluar" : "Sign out"}
          </Button>
        </div>
      </div>

      {atLimit && (
        <p className="mt-6 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-navy dark:text-gold">
          {lang === "id"
            ? `Kuota workspace paket ${pkg?.name} sudah penuh. Upgrade paket untuk menambah perusahaan.`
            : `You have reached the workspace quota for ${pkg?.name}. Upgrade to add more companies.`}
        </p>
      )}

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {workspaces.map((w) => (
          <Card
            key={w.id}
            role="button"
            tabIndex={0}
            onClick={() => enter(w.id)}
            onKeyDown={(e) => e.key === "Enter" && enter(w.id)}
            className="group cursor-pointer transition-all hover:-translate-y-1 hover:border-gold hover:shadow-lg"
          >
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-navy text-gold">
                  <Building2 className="h-5 w-5" />
                </span>
                <Badge variant="secondary" className="uppercase">
                  {w.status}
                </Badge>
              </div>
              <CardTitle className="pt-3 text-lg">{w.name}</CardTitle>
              <CardDescription>{w.legal_name ?? w.slug}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {w.currency} · {w.default_costing_method}
              </span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:text-gold" />
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-10 text-xs text-muted-foreground">{email}</p>
    </div>
  );
}