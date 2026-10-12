import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, FileImage, FileText, Loader2, Save, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// Ronde 31 (BS New 8/10): tab Audit Trail di halaman Settings.
import { AuditTrailView } from "@/components/app/AuditTrailView";
import { updateWorkspaceSettings } from "@/lib/platform.functions";
import { DEFAULT_WORKSPACE_LOGO } from "@/lib/brand";
import { DOC_TEMPLATES, buildDocHtml, type DocTemplate } from "@/lib/doc-print";
import type { PrcDoc, PrcLine } from "@/lib/procurement";
import { useApp } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/app/w/$workspaceId/settings")({
  component: SettingsPage,
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** #53 (BS New 3): pengaturan kop surat tender. */
interface LetterheadForm {
  show_address: boolean;
  show_tax_id: boolean;
  show_phone: boolean;
  show_email: boolean;
  show_divider: boolean;
  background_url: string;
}

const DEFAULT_LETTERHEAD: LetterheadForm = {
  show_address: true,
  show_tax_id: true,
  show_phone: true,
  show_email: true,
  show_divider: true,
  background_url: "",
};

/** Kolom JSON bisa datang sebagai objek atau string (tergantung driver). */
function readLetterhead(value: unknown): LetterheadForm {
  let raw: Record<string, unknown> = {};
  if (typeof value === "string" && value.trim()) {
    try {
      raw = JSON.parse(value) as Record<string, unknown>;
    } catch {
      raw = {};
    }
  } else if (value && typeof value === "object") {
    raw = value as Record<string, unknown>;
  }
  return {
    show_address: raw.show_address !== false,
    show_tax_id: raw.show_tax_id !== false,
    show_phone: raw.show_phone !== false,
    show_email: raw.show_email !== false,
    show_divider: raw.show_divider !== false,
    background_url: typeof raw.background_url === "string" ? raw.background_url : "",
  };
}

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
    phone: "",
    email: "",
    bank_info: "",
    doc_footer_note: "",
    doc_template: "classic" as DocTemplate,
    logo_url: "",
  });
  const [letterhead, setLetterhead] = useState<LetterheadForm>(DEFAULT_LETTERHEAD);
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
      phone: activeWorkspace.phone ?? "",
      email: activeWorkspace.email ?? "",
      bank_info: activeWorkspace.bank_info ?? "",
      doc_footer_note: activeWorkspace.doc_footer_note ?? "",
      doc_template: (activeWorkspace.doc_template as DocTemplate) ?? "classic",
      logo_url: activeWorkspace.logo_url ?? "",
    });
    setLetterhead(readLetterhead(activeWorkspace.letterhead_config));
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
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
            bank_info: form.bank_info.trim() || null,
            doc_footer_note: form.doc_footer_note.trim() || null,
            doc_template: form.doc_template,
            logo_url: form.logo_url || null,
            letterhead_config: JSON.stringify(letterhead),
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

  /**
   * #4 (BS New): logo di-resize di browser (maks 400x160) lalu disimpan sebagai
   * data URL — Old tidak punya object storage seperti Supabase Storage.
   */
  function pickLogo(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(lang === "id" ? "File harus gambar" : "File must be an image");
      return;
    }
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, 400 / img.width, 160 / img.height);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        setForm((f) => ({ ...f, logo_url: c.toDataURL("image/png") }));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  /**
   * #53 (BS New 3): desain kop A4 dijadikan 1240×1754 px (rasio A4) lalu disimpan
   * sebagai data URL — Old tidak punya object storage seperti Supabase Storage.
   */
  function pickLetterheadBackground(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error(lang === "id" ? "Gunakan gambar PNG atau JPG" : "Use a PNG or JPG image");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(lang === "id" ? "Ukuran gambar maksimal 10 MB" : "Maximum image size is 10 MB");
      return;
    }
    const image = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      image.onload = () => {
        const targetWidth = 1240;
        const targetHeight = 1754;
        const sourceRatio = image.width / image.height;
        const a4Ratio = targetWidth / targetHeight;
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, targetWidth, targetHeight);
        const scale = Math.min(targetWidth / image.width, targetHeight / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(image, (targetWidth - width) / 2, (targetHeight - height) / 2, width, height);
        setLetterhead((current) => ({ ...current, background_url: canvas.toDataURL("image/jpeg", 0.88) }));
        if (Math.abs(sourceRatio - a4Ratio) > 0.04) {
          toast.warning(
            lang === "id"
              ? "Rasio gambar bukan A4; ruang kosong ditambahkan agar desain tidak terpotong."
              : "The image is not A4; blank space was added to prevent cropping.",
          );
        }
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
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

      {/* Ronde 31 (BS New 8/10): General | Audit Trail. */}
      <Tabs defaultValue="general" className="mt-6">
        <TabsList data-testid="settings-tabs">
          <TabsTrigger value="general" data-testid="settings-tab-general">
            {lang === "id" ? "Umum" : "General"}
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="settings-tab-audit">
            Audit Trail
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-6">

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
          <form id="workspace-settings-form" className="space-y-5" onSubmit={save}>
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
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="addr">{lang === "id" ? "Alamat" : "Address"}</Label>
                <Textarea
                  id="addr"
                  rows={2}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{lang === "id" ? "Telepon" : "Phone"}</Label>
                <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="npwp">NPWP / Tax ID</Label>
                <Input id="npwp" value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank">{lang === "id" ? "Info rekening" : "Bank details"}</Label>
                <Textarea
                  id="bank"
                  rows={2}
                  value={form.bank_info}
                  onChange={(e) => setForm({ ...form, bank_info: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="foot">{lang === "id" ? "Catatan kaki dokumen" : "Document footer note"}</Label>
                <Input
                  id="foot"
                  value={form.doc_footer_note}
                  onChange={(e) => setForm({ ...form, doc_footer_note: e.target.value })}
                />
              </div>
              {/* #4 (BS New): logo workspace dipakai di header cetak/PDF dokumen. */}
              <div className="space-y-2 sm:col-span-2">
                <Label>
                  {lang === "id"
                    ? "Logo dokumen (header Invoice, SO, DO, PO, GR)"
                    : "Document logo (Invoice, SO, DO, PO, GR header)"}
                </Label>
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-40 items-center justify-center rounded-md border border-dashed border-border bg-muted/30">
                    {/* #4: bila workspace belum punya logo sendiri, tampilkan logo default Xperd One. */}
                    <img
                      src={form.logo_url || DEFAULT_WORKSPACE_LOGO}
                      alt="Logo"
                      className="max-h-14 max-w-36 object-contain"
                    />
                  </div>
                  <Input
                    type="file"
                    accept="image/*"
                    className="max-w-xs"
                    onChange={(e) => pickLogo(e.target.files?.[0])}
                  />
                  {form.logo_url ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setForm({ ...form, logo_url: "" })}
                    >
                      {lang === "id" ? "Hapus" : "Remove"}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {lang === "id" ? "Logo default (Xperd One)" : "Default logo (Xperd One)"}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button type="submit" variant="navy" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Save />} {lang === "id" ? "Simpan" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* #53 (BS New 3): kop surat tender — desain A4 lengkap atau kop otomatis. */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{lang === "id" ? "Kop Surat Tender" : "Tender Letterhead"}</CardTitle>
          <CardDescription>
            {lang === "id"
              ? "Unggah desain kop A4 lengkap agar hasil Word sama dengan desain Anda. Kop otomatis tetap dipakai jika belum ada gambar."
              : "Upload a complete A4 letterhead design so Word matches your artwork. The automatic letterhead remains as a fallback."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 rounded-md border border-border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <Label htmlFor="tender-letterhead-background">
                {lang === "id" ? "Gambar latar kop surat" : "Letterhead background image"}
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {lang === "id"
                  ? "Gunakan PNG/JPG A4 potret (contoh: 1240 × 1754 px), maksimal 10 MB. Sisakan area tengah untuk isi surat."
                  : "Use an A4 portrait PNG/JPG (for example 1240 × 1754 px), up to 10 MB. Leave the middle area clear for document content."}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button type="button" variant="outline" asChild>
                <label htmlFor="tender-letterhead-background" className="cursor-pointer">
                  <Upload className="h-4 w-4" />
                  {letterhead.background_url
                    ? lang === "id"
                      ? "Ganti gambar"
                      : "Replace image"
                    : lang === "id"
                      ? "Unggah gambar"
                      : "Upload image"}
                </label>
              </Button>
              <Input
                id="tender-letterhead-background"
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(event) => pickLetterheadBackground(event.target.files?.[0])}
              />
              {letterhead.background_url && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLetterhead((current) => ({ ...current, background_url: "" }))}
                >
                  {lang === "id" ? "Hapus" : "Remove"}
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                ["show_address", lang === "id" ? "Alamat" : "Address"],
                ["show_tax_id", "NPWP"],
                ["show_phone", lang === "id" ? "Telepon" : "Phone"],
                ["show_email", "Email"],
                ["show_divider", lang === "id" ? "Garis pemisah" : "Divider"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-md border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={letterhead[key]}
                  onChange={(event) => setLetterhead({ ...letterhead, [key]: event.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="relative mx-auto aspect-[1/1.414] w-full max-w-xl overflow-hidden rounded-md border border-border bg-card shadow-sm">
            {letterhead.background_url ? (
              <img
                src={letterhead.background_url}
                alt={lang === "id" ? "Pratinjau kop surat" : "Letterhead preview"}
                className="absolute inset-0 h-full w-full object-contain"
              />
            ) : (
              <>
                <div className="absolute left-[7%] top-[3%] flex h-20 w-[28%] items-center">
                  {form.logo_url ? (
                    <img
                      src={form.logo_url}
                      alt=""
                      aria-hidden="true"
                      className="max-h-14 max-w-32 object-contain"
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-navy dark:text-primary-foreground">
                      <FileText className="h-8 w-8" />
                      <span className="text-xs font-bold">{form.legal_name || form.name || "PERUSAHAAN"}</span>
                    </div>
                  )}
                </div>
                {letterhead.show_divider && (
                  <div className="absolute left-[7%] right-[7%] top-[15%] border-b border-gold/80" />
                )}
                <div className="absolute bottom-[3%] right-[7%] w-[36%] text-right text-[9px] leading-4 text-muted-foreground">
                  {letterhead.show_phone && form.phone && <p>T {form.phone}</p>}
                  {letterhead.show_email && form.email && <p>E {form.email}</p>}
                  {letterhead.show_tax_id && form.tax_id && <p>NPWP {form.tax_id}</p>}
                  {letterhead.show_address && form.address && <p>{form.address}</p>}
                  {!form.phone && !form.email && !form.tax_id && !form.address && (
                    <p>
                      {lang === "id"
                        ? "Lengkapi profil perusahaan di atas"
                        : "Complete the company profile above"}
                    </p>
                  )}
                </div>
              </>
            )}
            <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-background/85 px-2 py-1 text-[9px] font-medium text-muted-foreground">
              <FileImage className="h-3 w-3" /> {lang === "id" ? "Pratinjau A4" : "A4 preview"}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {lang === "id"
              ? "Gunakan tombol Simpan di Profil Perusahaan setelah mengubah pengaturan kop."
              : "Use the Save changes button in Company Profile after changing letterhead settings."}
          </p>
          <Button type="submit" form="workspace-settings-form" variant="navy" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Save />}{" "}
            {lang === "id" ? "Simpan pengaturan kop" : "Save letterhead settings"}
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{lang === "id" ? "Template dokumen & invoice" : "Document & invoice template"}</CardTitle>
          <CardDescription>
            {lang === "id"
              ? "Dipakai untuk cetak dan unduh PDF di Quotation, SO, DO, PO, GR, AP, dan AR."
              : "Applied to print and PDF download for Quotation, SO, DO, PO, GR, AP and AR."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {DOC_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setForm({ ...form, doc_template: tpl.id })}
              className={`overflow-hidden rounded-xl border text-left transition ${
                form.doc_template === tpl.id ? "border-gold ring-2 ring-gold/40" : "border-border hover:border-gold/60"
              }`}
            >
              <div className="h-44 overflow-hidden bg-white">
                <iframe
                  title={tpl.en}
                  className="pointer-events-none h-[1123px] w-[794px] origin-top-left border-0"
                  style={{ transform: "scale(0.32)" }}
                  srcDoc={previewHtml(tpl.id, form.name || "XPERD", lang, form.logo_url || DEFAULT_WORKSPACE_LOGO)}
                />
              </div>
              <div className="border-t border-border p-3">
                <p className="text-sm font-semibold text-navy dark:text-primary-foreground">
                  {lang === "id" ? tpl.id_ : tpl.en}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{lang === "id" ? tpl.hint_id : tpl.hint_en}</p>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="audit" className="mt-6">
          <AuditTrailView workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function previewHtml(template: DocTemplate, companyName: string, lang: string, logoUrl?: string) {
  const doc = {
    doc_number: "INV/2026/0001",
    doc_date: "2026-08-14",
    due_date: "2026-08-28",
    supplier_name: lang === "id" ? "PT Contoh Pelanggan" : "Sample Customer Ltd",
    supplier_code: "C-0001",
    reference: "SO/2026/0007",
    status: "invoiced",
    currency: "IDR",
    subtotal: 2500000,
    discount_amount: 0,
    tax_amount: 275000,
    total: 2775000,
    notes: lang === "id" ? "Pembayaran maksimal 14 hari." : "Payment due within 14 days.",
    warehouse_code: "WH-01",
  } as unknown as PrcDoc;
  const lines = [
    { id: "1", item_code: "SRV-001", description: "Website & domain", qty: 1, uom_code: "PCS", unit_price: 2500000, tax_rate: 11, line_total: 2500000 },
  ] as unknown as PrcLine[];
  return buildDocHtml(doc, lines, {
    title: lang === "id" ? "Faktur" : "Invoice",
    lang,
    template,
    statusLabel: "UNPAID",
    // #5 (BS New): preview ikut menampilkan contoh rekening pembayaran.
    paymentAccount: "BCA 4974741191",
    company: {
      name: companyName,
      address: "Asia Pacific Building, BSD Serpong",
      phone: "0851 9504 1191",
      email: "info@example.co.id",
      bankInfo: "BCA 4974741191",
      // #4 (BS New): preview menampilkan logo workspace bila sudah ada.
      logoUrl: logoUrl || null,
    },
    labels: {
      number: lang === "id" ? "Nomor" : "Number",
      date: lang === "id" ? "Tanggal" : "Date",
      dueDate: lang === "id" ? "Jatuh tempo" : "Due date",
      reference: lang === "id" ? "Referensi" : "Reference",
      status: "Status",
      warehouse: lang === "id" ? "Gudang" : "Warehouse",
      description: lang === "id" ? "Deskripsi" : "Description",
      qty: "Qty",
      price: lang === "id" ? "Harga" : "Price",
      tax: lang === "id" ? "Pajak" : "Tax",
      lineTotal: "Total",
      subtotal: "Subtotal",
      discount: lang === "id" ? "Diskon" : "Discount",
      total: "Total",
      notes: lang === "id" ? "Catatan" : "Notes",
      bank: lang === "id" ? "Rekening" : "Bank",
      billedTo: lang === "id" ? "Ditagihkan kepada" : "Billed to",
      from: lang === "id" ? "Dari" : "From",
      signature: lang === "id" ? "Tanda tangan" : "Signature",
      thanks: lang === "id" ? "Terima kasih." : "Thank you for your business.",
      noLines: "-",
    },
  });
}