import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateWorkspaceSettings } from "@/lib/platform.functions";
import { DOC_TEMPLATES, type DocTemplate } from "@/lib/doc-print";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/app/w/$workspaceId/settings")({
  component: SettingsPage,
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function SettingsPage() {
  const { workspaceId } = Route.useParams();
  const { activeWorkspace, tenant, pkg, refresh } = useApp();
  const { lang } = useI18n();
  const [form, setForm] = useState({
    name: "",
    legal_name: "",
    currency: "IDR",
    timezone: "Asia/Jakarta",
    fiscal: "1",
    costing: "AVERAGE" as "FIFO" | "LIFO" | "AVERAGE",
    address: "",
    tax_id: "",
    doc_template: "classic" as DocTemplate,
    bank_info: "",
    doc_footer_note: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!activeWorkspace) return;
    setForm({
      name: activeWorkspace.name,
      legal_name: activeWorkspace.legal_name ?? "",
      currency: activeWorkspace.currency,
      timezone: activeWorkspace.timezone,
      fiscal: String(activeWorkspace.fiscal_year_start_month),
      costing: activeWorkspace.default_costing_method,
      address: activeWorkspace.address ?? "",
      tax_id: activeWorkspace.tax_id ?? "",
      doc_template: activeWorkspace.doc_template === "modern" || activeWorkspace.doc_template === "minimal" ? activeWorkspace.doc_template : "classic",
      bank_info: activeWorkspace.bank_info ?? "",
      doc_footer_note: activeWorkspace.doc_footer_note ?? "",
    });
  }, [activeWorkspace]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateWorkspaceSettings({
        data: {
          workspaceId,
          data: {
            name: form.name.trim(),
            legal_name: form.legal_name.trim() || null,
            currency: form.currency,
            timezone: form.timezone,
            fiscal_year_start_month: Number(form.fiscal),
            default_costing_method: form.costing,
            address: form.address.trim() || null,
            tax_id: form.tax_id.trim() || null,
            doc_template: form.doc_template,
            bank_info: form.bank_info.trim() || null,
            doc_footer_note: form.doc_footer_note.trim() || null,
          },
        },
      });
      toast.success(lang === "id" ? "Pengaturan disimpan" : "Settings saved");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link
        to="/app/w/$workspaceId"
        params={{ workspaceId }}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-gold"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> {lang === "id" ? "Peluncur modul" : "Module launcher"}
      </Link>

      <h1 className="mt-3 text-2xl font-semibold text-navy dark:text-primary-foreground">
        {lang === "id" ? "Pengaturan workspace" : "Workspace settings"}
      </h1>
      <p className="text-sm text-muted-foreground">
        {tenant?.name} · {pkg?.name}
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{lang === "id" ? "Profil perusahaan" : "Company profile"}</CardTitle>
          <CardDescription>
            {lang === "id"
              ? "Identitas dan default akuntansi untuk workspace ini."
              : "Identity and accounting defaults for this workspace."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={save}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">{lang === "id" ? "Nama perusahaan" : "Company name"}</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="legal">{lang === "id" ? "Nama legal" : "Legal name"}</Label>
                <Input
                  id="legal"
                  value={form.legal_name}
                  onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{lang === "id" ? "Mata uang" : "Currency"}</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
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
                <Label htmlFor="tz">{lang === "id" ? "Zona waktu" : "Timezone"}</Label>
                <Input
                  id="tz"
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{lang === "id" ? "Awal tahun fiskal" : "Fiscal year starts"}</Label>
                <Select value={form.fiscal} onValueChange={(v) => setForm({ ...form, fiscal: v })}>
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
                <Label>{lang === "id" ? "Metode costing" : "Costing method"}</Label>
                <Select
                  value={form.costing}
                  onValueChange={(v) => setForm({ ...form, costing: v as typeof form.costing })}
                >
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="addr">{lang === "id" ? "Alamat" : "Address"}</Label>
                <Input id="addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax">{lang === "id" ? "NPWP" : "Tax ID"}</Label>
                <Input id="tax" value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold text-navy dark:text-primary-foreground">
                {lang === "id" ? "Branding dokumen" : "Document branding"}
              </p>
              <div className="mt-3">
                <Label>{lang === "id" ? "Template dokumen" : "Document template"}</Label>
                <Select value={form.doc_template} onValueChange={(v) => setForm({ ...form, doc_template: v as DocTemplate })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TEMPLATES.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {lang === "id" ? t.id_ : t.en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bank">
                    {lang === "id" ? "Info bank (muncul di dokumen)" : "Bank info (shown on documents)"}
                  </Label>
                  <Textarea id="bank" rows={3} value={form.bank_info} onChange={(e) => setForm({ ...form, bank_info: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="foot">{lang === "id" ? "Catatan kaki dokumen" : "Document footer note"}</Label>
                  <Textarea id="foot" rows={3} value={form.doc_footer_note} onChange={(e) => setForm({ ...form, doc_footer_note: e.target.value })} />
                </div>
              </div>
            </div>

            <Button type="submit" variant="navy" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Save />} {lang === "id" ? "Simpan" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}