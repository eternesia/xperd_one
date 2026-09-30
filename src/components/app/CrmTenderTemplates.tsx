/**
 * #52 (BS New 3): Template Isian Panitia.
 *
 * Rumah logika: PDF KAK/RKS sumber + formulir DOCX editable disimpan di server
 * workspace; saat diunduh, kop workspace ditempelkan dan placeholder profil
 * perusahaan diganti **tanpa mengubah berkas sumber** (`lib/tender-docx.ts`,
 * murni di browser memakai JSZip).
 *
 * Catatan porting ke Old:
 * - Supabase Storage → berkas disk lewat server fn (`uploadWsFile`) dan rute
 *   `/api/workspace-files` untuk membaca ulang DOCX sumber.
 * - Lapisan data memakai server fn Old, bukan Supabase.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, History, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { AdminField, AdminSelect } from "@/components/app/admin-ui";
import { openWsFile, uploadWsFile } from "@/components/app/CrmDocLibrary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/lib/app-context";
import { deleteWorkspaceRow, listWorkspaceRows, saveWorkspaceRow, upsertWorkspaceRows } from "@/lib/data.functions";
import { deleteWorkspaceFile, uploadWorkspaceFile } from "@/lib/files.functions";
import { useI18n } from "@/lib/i18n";
import { buildLetterheadedDocx, downloadBlob } from "@/lib/tender-docx";

export interface TenderTemplate {
  id: string;
  tender_id: string;
  tender_doc_id: string | null;
  category: string;
  name: string;
  source_pdf_path: string | null;
  source_pdf_name: string | null;
  source_pages: string | null;
  template_path: string;
  template_name: string;
  size: number;
  version: number;
  notes: string | null;
}

interface ChecklistDoc {
  id: string;
  name: string;
  category: string;
}
type TemplateForm = {
  id?: string;
  name: string;
  category: string;
  source_pages: string;
  notes: string;
  tender_doc_id: string;
  pdf: File | null;
  docx: File | null;
};
const EMPTY: TemplateForm = {
  name: "",
  category: "administrative",
  source_pages: "",
  notes: "",
  tender_doc_id: "",
  pdf: null,
  docx: null,
};
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function useTenderTemplates(workspaceId: string, tenderId: string) {
  return useQuery({
    queryKey: ["crm-tender-templates", workspaceId, tenderId],
    queryFn: async () => {
      const data = await listWorkspaceRows({
        data: {
          table: "crm_tender_templates",
          workspaceId,
          filters: { tender_id: tenderId },
          orderBy: "created_at",
          orderDir: "asc",
          limit: 500,
        },
      });
      return (data?.rows ?? []) as unknown as TenderTemplate[];
    },
  });
}

/** Profil kop untuk `buildLetterheadedDocx` (dari pengaturan workspace). */
export function letterheadProfile(workspace: ReturnType<typeof useApp>["activeWorkspace"]) {
  if (!workspace) throw new Error("Workspace tidak ditemukan");
  const config = workspace.letterhead_config ?? {};
  return {
    name: workspace.name,
    legalName: workspace.legal_name,
    address: workspace.address,
    taxId: workspace.tax_id,
    phone: workspace.phone,
    email: workspace.email,
    logoUrl: workspace.logo_url,
    backgroundUrl: config.background_url,
    showAddress: config.show_address !== false,
    showTaxId: config.show_tax_id !== false,
    showPhone: config.show_phone !== false,
    showEmail: config.show_email !== false,
    showDivider: config.show_divider !== false,
  };
}

/** DOCX sumber dibaca lewat rute unduh (cookie sesi), lalu ditempeli kop. */
export async function generateTenderDocx(
  template: TenderTemplate,
  workspace: ReturnType<typeof useApp>["activeWorkspace"],
) {
  const response = await fetch(`/api/workspace-files?path=${encodeURIComponent(template.template_path)}`);
  if (!response.ok) throw new Error("Berkas template tidak dapat dibaca");
  const blob = await response.blob();
  return buildLetterheadedDocx(blob, letterheadProfile(workspace));
}

function cleanDocxName(name: string) {
  const base = name
    .replace(/\.docx$/i, "")
    .replace(/[^\w\- ]+/g, "-")
    .trim();
  return `${base || "template-tender"}-dengan-kop.docx`;
}

export function TenderTemplates({
  workspaceId,
  tenderId,
  docs,
}: {
  workspaceId: string;
  tenderId: string;
  docs: ChecklistDoc[];
}) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const { activeWorkspace } = useApp();
  const qc = useQueryClient();
  const uploadFn = useServerFn(uploadWorkspaceFile);
  const deleteFileFn = useServerFn(deleteWorkspaceFile);
  const { data: templates = [], isLoading } = useTenderTemplates(workspaceId, tenderId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TemplateForm>(EMPTY);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [history, setHistory] = useState<TenderTemplate | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const existing = templates.find((item) => item.id === form.id);
      if (!existing && !form.docx) throw new Error(t("A DOCX file is required", "Berkas DOCX wajib dipilih"));
      if (form.docx && !form.docx.name.toLowerCase().endsWith(".docx")) {
        throw new Error(t("Template must be a .docx file", "Template harus berformat .docx"));
      }
      if (form.pdf && form.pdf.type !== "application/pdf") {
        throw new Error(t("Source document must be a PDF", "Dokumen sumber harus PDF"));
      }

      let templatePath = existing?.template_path ?? "";
      let templateName = existing?.template_name ?? "";
      let size = existing?.size ?? 0;
      let sourcePath = existing?.source_pdf_path ?? null;
      let sourceName = existing?.source_pdf_name ?? null;

      if (form.docx) {
        templatePath = await uploadWsFile(workspaceId, `crm/tenders/${tenderId}/templates`, form.docx, uploadFn);
        templateName = form.docx.name;
        size = form.docx.size;
      }
      if (form.pdf) {
        sourcePath = await uploadWsFile(workspaceId, `crm/tenders/${tenderId}/sources`, form.pdf, uploadFn);
        sourceName = form.pdf.name;
      }

      const values = {
        tender_id: tenderId,
        tender_doc_id: form.tender_doc_id || null,
        category: form.category,
        name: form.name.trim(),
        source_pdf_path: sourcePath,
        source_pdf_name: sourceName,
        source_pages: form.source_pages.trim() || null,
        template_path: templatePath,
        template_name: templateName,
        mime: DOCX_MIME,
        size,
        notes: form.notes.trim() || null,
      };

      if (existing) {
        if (form.docx) {
          // Versi lama tetap tersimpan sebagai riwayat.
          await upsertWorkspaceRows({
            data: {
              table: "crm_tender_template_versions",
              workspaceId,
              rows: [
                {
                  id: crypto.randomUUID(),
                  template_id: existing.id,
                  version: existing.version,
                  template_path: existing.template_path,
                  template_name: existing.template_name,
                  size: existing.size,
                },
              ],
            },
          });
        }
        await saveWorkspaceRow({
          data: {
            table: "crm_tender_templates",
            workspaceId,
            id: existing.id,
            data: { ...values, version: form.docx ? existing.version + 1 : existing.version },
          },
        });
      } else {
        await upsertWorkspaceRows({
          data: {
            table: "crm_tender_templates",
            workspaceId,
            rows: [{ id: crypto.randomUUID(), ...values, version: 1 }],
          },
        });
      }

      if (form.tender_doc_id) {
        await saveWorkspaceRow({
          data: { table: "crm_tender_docs", workspaceId, id: form.tender_doc_id, data: { status: "ready" } },
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crm-tender-templates", workspaceId, tenderId] });
      void qc.invalidateQueries({ queryKey: ["crm-tender-docs", workspaceId] });
      setOpen(false);
      toast.success(t("Fill-in template saved", "Template isian disimpan"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function download(template: TenderTemplate) {
    setDownloading(template.id);
    try {
      const blob = await generateTenderDocx(template, activeWorkspace);
      downloadBlob(blob, cleanDocxName(template.template_name));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Download failed", "Unduh gagal"));
    } finally {
      setDownloading(null);
    }
  }

  async function remove(template: TenderTemplate) {
    if (!confirm(t(`Delete template "${template.name}"?`, `Hapus template "${template.name}"?`))) return;
    try {
      const versions = await listWorkspaceRows({
        data: {
          table: "crm_tender_template_versions",
          workspaceId,
          filters: { template_id: template.id },
          limit: 200,
        },
      });
      const paths = [
        template.template_path,
        template.source_pdf_path,
        ...((versions?.rows ?? []) as { template_path?: string }[]).map((version) => version.template_path),
      ].filter((path): path is string => Boolean(path));

      await deleteWorkspaceRow({ data: { table: "crm_tender_templates", workspaceId, id: template.id } });
      for (const path of paths) await deleteFileFn({ data: { workspaceId, path } });
      void qc.invalidateQueries({ queryKey: ["crm-tender-templates", workspaceId, tenderId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Could not delete", "Gagal menghapus"));
    }
  }

  const catLabel = (category: string) =>
    category === "administrative"
      ? t("Administrative", "Administrasi")
      : category === "technical"
        ? t("Technical", "Teknis")
        : t("Price Offer", "Penawaran");

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-navy dark:text-primary-foreground">
              {t("Committee Fill-in Templates", "Template Isian Panitia")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t(
                "Keep the source PDF and editable DOCX pages; downloaded Word files receive your company letterhead.",
                "Simpan PDF sumber dan DOCX halaman isian; hasil Word otomatis memakai kop perusahaan.",
              )}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setForm(EMPTY);
              setOpen(true);
            }}
          >
            <Plus />
            {t("Add template", "Tambah template")}
          </Button>
        </div>

        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : templates.length === 0 ? (
          <div className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            <FileText className="mx-auto mb-2 h-7 w-7 text-gold" />
            {t("No fill-in templates for this tender yet.", "Belum ada template isian untuk tender ini.")}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map((template) => (
              <div key={template.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{template.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {template.template_name} · v{template.version}
                      {template.source_pages ? ` · ${t("pp.", "hal.")} ${template.source_pages}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline">{catLabel(template.category)}</Badge>
                </div>
                {template.notes && <p className="mt-2 text-xs text-muted-foreground">{template.notes}</p>}
                <div className="mt-3 flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="navy"
                    disabled={downloading === template.id}
                    onClick={() => void download(template)}
                  >
                    {downloading === template.id ? <Loader2 className="animate-spin" /> : <Download />}
                    {t("Letterheaded Word", "Word dengan kop")}
                  </Button>
                  {template.source_pdf_path && (
                    <Button size="sm" variant="outline" onClick={() => openWsFile(template.source_pdf_path ?? "")}>
                      <FileText />
                      PDF
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    title={t("Edit", "Ubah")}
                    onClick={() => {
                      setForm({
                        id: template.id,
                        name: template.name,
                        category: template.category,
                        source_pages: template.source_pages ?? "",
                        notes: template.notes ?? "",
                        tender_doc_id: template.tender_doc_id ?? "",
                        pdf: null,
                        docx: null,
                      });
                      setOpen(true);
                    }}
                  >
                    <Pencil />
                  </Button>
                  {template.version > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      title={t("Version history", "Riwayat versi")}
                      onClick={() => setHistory(template)}
                    >
                      <History />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" title={t("Delete", "Hapus")} onClick={() => void remove(template)}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {form.id ? t("Edit fill-in template", "Ubah template isian") : t("Add fill-in template", "Tambah template isian")}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField label={t("Form name", "Nama formulir")}>
                <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </AdminField>
              <AdminField label={t("Category", "Kategori")}>
                <AdminSelect value={form.category} onChange={(value) => setForm({ ...form, category: value })}>
                  <option value="administrative">{t("Administrative", "Administrasi")}</option>
                  <option value="technical">{t("Technical", "Teknis")}</option>
                  <option value="commercial">{t("Price Offer", "Penawaran")}</option>
                </AdminSelect>
              </AdminField>
              <AdminField label={t("Link to checklist", "Tautkan ke checklist")}>
                <AdminSelect value={form.tender_doc_id} onChange={(value) => setForm({ ...form, tender_doc_id: value })}>
                  <option value="">{t("— Not linked —", "— Tidak ditautkan —")}</option>
                  {docs.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminField label={t("Source PDF pages", "Halaman acuan PDF")}>
                <Input
                  placeholder={t("Example: 48-52", "Contoh: 48-52")}
                  value={form.source_pages}
                  onChange={(event) => setForm({ ...form, source_pages: event.target.value })}
                />
              </AdminField>
              <AdminField label={t("Source KAK/RKS PDF (optional)", "PDF KAK/RKS sumber (opsional)")}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm">
                  <Upload className="h-4 w-4" />
                  <span className="truncate">{form.pdf?.name ?? t("Choose PDF", "Pilih PDF")}</span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(event) => setForm({ ...form, pdf: event.target.files?.[0] ?? null })}
                  />
                </label>
              </AdminField>
              <AdminField label={form.id ? t("New DOCX (optional)", "DOCX baru (opsional)") : t("DOCX template", "Template DOCX")}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm">
                  <Upload className="h-4 w-4" />
                  <span className="truncate">{form.docx?.name ?? t("Choose DOCX", "Pilih DOCX")}</span>
                  <input
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={(event) => setForm({ ...form, docx: event.target.files?.[0] ?? null })}
                  />
                </label>
              </AdminField>
              <div className="sm:col-span-2">
                <AdminField label={t("Notes", "Catatan")}>
                  <Textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
                </AdminField>
              </div>
              <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground sm:col-span-2">
                {t(
                  "Supported placeholders: {{nama_perusahaan}}, {{nama_legal}}, {{alamat_perusahaan}}, {{npwp}}, {{telepon}}, {{email}}. The letterhead is still added when no placeholders are used.",
                  "Placeholder yang didukung: {{nama_perusahaan}}, {{nama_legal}}, {{alamat_perusahaan}}, {{npwp}}, {{telepon}}, {{email}}. Tanpa placeholder pun kop tetap dipasang.",
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="navy" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
                {save.isPending && <Loader2 className="animate-spin" />}
                {t("Save", "Simpan")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {history && <TemplateHistory template={history} workspaceId={workspaceId} onClose={() => setHistory(null)} />}
      </CardContent>
    </Card>
  );
}

interface TemplateVersion {
  id: string;
  version: number;
  template_path: string;
  template_name: string;
}

function TemplateHistory({
  template,
  workspaceId,
  onClose,
}: {
  template: TenderTemplate;
  workspaceId: string;
  onClose: () => void;
}) {
  const { lang } = useI18n();
  const { data = [] } = useQuery({
    queryKey: ["crm-tender-template-versions", template.id],
    queryFn: async () => {
      const result = await listWorkspaceRows({
        data: {
          table: "crm_tender_template_versions",
          workspaceId,
          filters: { template_id: template.id },
          orderBy: "version",
          orderDir: "desc",
          limit: 200,
        },
      });
      return (result?.rows ?? []) as unknown as TemplateVersion[];
    },
  });

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {lang === "id" ? "Riwayat versi" : "Version history"} — {template.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p className="font-medium">
            v{template.version} · {template.template_name}
          </p>
          {data.map((version) => (
            <div key={version.id} className="flex items-center justify-between rounded-md border border-border p-2">
              <span>
                v{version.version} · {version.template_name}
              </span>
              <Button size="icon" variant="ghost" onClick={() => openWsFile(version.template_path)}>
                <Download />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
