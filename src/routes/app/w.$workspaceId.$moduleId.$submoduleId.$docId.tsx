import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Download, Lock, Printer } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getWorkspaceRow, listWorkspaceRows } from "@/lib/data.functions";
import { useApp } from "@/lib/app-context";
import { DEFAULT_WORKSPACE_LOGO } from "@/lib/brand";
import { downloadDocHtmlPdf, printDocHtml, type DocPrintMeta, type DocTemplate } from "@/lib/doc-print";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  findPrcEntity,
  formatMoney,
  STATUS_LABEL,
  STATUS_TONE,
  type PrcDoc,
  type PrcLine,
} from "@/lib/procurement";
import { findSlsEntity } from "@/lib/sales";
import { useCardLabels } from "@/lib/card-labels";
import { ProductionDocPage } from "@/components/app/ProductionDocPage";

export const Route = createFileRoute("/app/w/$workspaceId/$moduleId/$submoduleId/$docId")({
  validateSearch: (search: Record<string, unknown>) => ({
    print: search.print ? 1 : undefined,
  }),
  component: DocumentRoute,
});

function DocumentRoute() {
  const { workspaceId, moduleId, submoduleId, docId } = Route.useParams();
  if (moduleId === "manufacturing") return <ProductionDocPage workspaceId={workspaceId} section={submoduleId} docId={docId} />;
  return <DocumentDetail />;
}

function DocumentDetail() {
  const { workspaceId, moduleId, submoduleId, docId } = Route.useParams();
  const { print } = Route.useSearch();
  const { lang } = useI18n();
  const { activeWorkspace, accessLoading, canViewSubmodule } = useApp();
  const [pdfBusy, setPdfBusy] = useState(false);
  const lineTableRef = useCardLabels();
  const t = (en: string, id: string) => (lang === "id" ? id : en);
  const isSales = moduleId === "sales";
  const salesEntity = findSlsEntity(submoduleId);
  const entity = isSales ? salesEntity : findPrcEntity(submoduleId);
  // Delivery orders list goods only — BS hides every price/tax/total for them.
  const hideAmounts = isSales && entity?.docType === "delivery_order";

  const { data, isLoading } = useQuery({
    queryKey: ["doc-detail", moduleId, docId],
    queryFn: async () => {
      const docTable = isSales ? "sls_documents" : "prc_documents";
      const lineTable = isSales ? "sls_document_lines" : "prc_document_lines";
      const [doc, lines] = await Promise.all([
        getWorkspaceRow({ data: { table: docTable, workspaceId, id: docId } }),
        listWorkspaceRows({
          data: { table: lineTable, workspaceId, filters: { document_id: docId }, orderBy: "line_no", orderDir: "asc", limit: 500 },
        }),
      ]);
      const raw = (doc ?? null) as unknown as (PrcDoc & { customer_name?: string | null; customer_code?: string | null }) | null;
      return {
        doc: raw
          ? ({
              ...raw,
              supplier_name: isSales ? (raw.customer_name ?? null) : raw.supplier_name,
              supplier_code: isSales ? (raw.customer_code ?? null) : raw.supplier_code,
            } as PrcDoc)
          : null,
        lines: (lines?.rows ?? []) as unknown as PrcLine[],
      };
    },
  });

  const doc = data?.doc ?? null;
  const lines = data?.lines ?? [];

  const labels = {
    number: t("Number", "Nomor"),
    date: t("Date", "Tanggal"),
    dueDate: t("Due date", "Jatuh tempo"),
    supplier: isSales ? t("Customer", "Pelanggan") : t("Supplier", "Pemasok"),
    status: t("Status", "Status"),
    reference: t("Reference", "Referensi"),
    item: t("Item", "Item"),
    description: t("Description", "Deskripsi"),
    qty: t("Qty", "Qty"),
    uom: t("UoM", "Satuan"),
    price: t("Price", "Harga"),
    lineTotal: t("Line total", "Total baris"),
    subtotal: t("Subtotal", "Subtotal"),
    discount: t("Discount", "Diskon"),
    tax: t("Tax", "Pajak"),
    total: t("Total", "Total"),
    notes: t("Notes", "Catatan"),
    warehouse: t("Warehouse", "Gudang"),
    bank: t("Cash / Bank", "Kas / Bank"),
    billedTo: isSales ? t("Billed to", "Ditagihkan kepada") : t("Supplier", "Pemasok"),
    from: t("From", "Dari"),
    signature: t("Authorised signature", "Tanda tangan berwenang"),
    thanks: t("Thank you for your business.", "Terima kasih atas kerja samanya."),
    noLines: t("No lines.", "Tidak ada rincian."),
  };

  const printMeta = (): DocPrintMeta => ({
    title: lang === "id" ? (entity?.id_ ?? "") : (entity?.en ?? ""),
    lang,
    template: ((activeWorkspace?.doc_template as DocTemplate | undefined) ?? "classic"),
    statusLabel: doc ? (lang === "id" ? STATUS_LABEL[doc.status].id_ : STATUS_LABEL[doc.status].en) : "",
    hideAmounts,
    // #2 (BS New): blok rekening di dokumen memakai rekening yang DIPILIH pada
    // dokumen AR Invoice, bukan teks bank info milik workspace.
    paymentAccount:
      isSales && entity?.docType === "ar_invoice"
        ? ((doc as unknown as { bank_account_name?: string | null } | null)?.bank_account_name ?? null)
        : null,
    company: {
      name: activeWorkspace?.name ?? "XPERD",
      legalName: activeWorkspace?.legal_name ?? null,
      address: activeWorkspace?.address ?? null,
      phone: activeWorkspace?.phone ?? null,
      email: activeWorkspace?.email ?? null,
      taxId: activeWorkspace?.tax_id ?? null,
      bankInfo: activeWorkspace?.bank_info ?? null,
      footerNote: activeWorkspace?.doc_footer_note ?? null,
      // #4: workspace yang belum unggah logo memakai logo brand Xperd One.
      logoUrl: activeWorkspace?.logo_url || DEFAULT_WORKSPACE_LOGO,
    },
    labels,
  });

  useEffect(() => {
    if (print && doc && entity) {
      const id = window.setTimeout(() => printDocHtml(doc, lines, printMeta()), 400);
      return () => window.clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [print, doc, entity]);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("Loading…", "Memuat…")}</p>;
  // #59 (BS New 3): dokumen hanya boleh dibuka bila peran punya akses submodulnya.
  if (accessLoading)
    return <p className="text-sm text-muted-foreground">{t("Loading access…", "Memuat akses…")}</p>;
  if (!canViewSubmodule(moduleId, submoduleId)) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold text-navy dark:text-primary-foreground">
          {t("Document access restricted", "Akses dokumen dibatasi")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "Contact your workspace admin to request access.",
            "Hubungi admin workspace untuk mendapatkan akses.",
          )}
        </p>
      </div>
    );
  }
  if (!doc || !entity)
    return <p className="text-sm text-muted-foreground">{t("Document not found.", "Dokumen tidak ditemukan.")}</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to="/app/w/$workspaceId/$moduleId/$submoduleId"
          params={{ workspaceId, moduleId, submoduleId }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gold"
        >
          <ChevronLeft className="h-4 w-4" /> {lang === "id" ? entity.id_ : entity.en}
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => doc && printDocHtml(doc, lines, printMeta())}>
            <Printer /> {t("Print", "Cetak")}
          </Button>
          <Button
            variant="gold"
            disabled={pdfBusy}
            onClick={async () => {
              setPdfBusy(true);
              try {
                await downloadDocHtmlPdf(doc, lines, printMeta());
              } catch (err) {
                toast.error(
                  t("Could not build the PDF. Use Print instead.", "Gagal membuat PDF. Gunakan Cetak sebagai alternatif."),
                  { description: err instanceof Error ? err.message : undefined },
                );
              } finally {
                setPdfBusy(false);
              }
            }}
          >
            <Download /> {pdfBusy ? t("Preparing…", "Menyiapkan…") : t("Download PDF", "Unduh PDF")}
          </Button>
        </div>
      </div>

      <article className="rounded-2xl border border-border bg-card p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.28em] text-gold">
              {(lang === "id" ? entity.id_ : entity.en).toUpperCase()}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-navy dark:text-primary-foreground">{doc.doc_number}</h1>
            <p className="text-sm text-muted-foreground">{activeWorkspace?.name}</p>
          </div>
          <Badge variant="secondary" className={cn("border-0", STATUS_TONE[doc.status])}>
            {lang === "id" ? STATUS_LABEL[doc.status].id_ : STATUS_LABEL[doc.status].en}
          </Badge>
        </header>

        <dl className="grid gap-4 border-b border-border py-6 sm:grid-cols-3">
          <Info label={labels.date} value={doc.doc_date} />
          <Info label={labels.dueDate} value={doc.due_date ?? "—"} />
          <Info label={labels.supplier} value={doc.supplier_name || doc.supplier_code || "—"} />
          <Info label={labels.reference} value={doc.reference ?? "—"} />
          <Info label={t("Warehouse", "Gudang")} value={doc.warehouse_code ?? "—"} />
          {!hideAmounts && <Info label={t("Currency", "Mata uang")} value={doc.currency} />}
          {(doc as unknown as { bank_account_name?: string | null }).bank_account_name && (
            <Info
              label={labels.bank}
              value={(doc as unknown as { bank_account_name?: string | null }).bank_account_name ?? "—"}
            />
          )}
        </dl>

        <table ref={lineTableRef} className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 text-left">#</th>
              <th className="py-2 text-left">{labels.item}</th>
              <th className="py-2 text-left">{labels.description}</th>
              <th className="py-2 text-right">{labels.qty}</th>
              <th className="py-2 text-left">{labels.uom}</th>
              {!hideAmounts && <th className="py-2 text-right">{labels.price}</th>}
              {!hideAmounts && <th className="py-2 text-right">{labels.lineTotal}</th>}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={hideAmounts ? 5 : 7} className="py-6 text-center text-muted-foreground">
                  {t("No lines.", "Tidak ada rincian.")}
                </td>
              </tr>
            )}
            {lines.map((l, i) => (
              <tr key={l.id} className="border-b border-border/60">
                <td className="py-2 text-muted-foreground">{i + 1}</td>
                <td className="py-2">{l.item_code ?? "—"}</td>
                <td className="py-2">{l.description ?? "—"}</td>
                <td className="py-2 text-right">{l.qty}</td>
                <td className="py-2">{l.uom_code ?? "—"}</td>
                {!hideAmounts && <td className="py-2 text-right">{formatMoney(l.unit_price, lang, doc.currency)}</td>}
                {!hideAmounts && <td className="py-2 text-right">{formatMoney(l.line_total, lang, doc.currency)}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        {!hideAmounts && (
          <div className="mt-6 flex flex-col items-end gap-1 text-sm">
            <Total label={labels.subtotal} value={formatMoney(doc.subtotal, lang, doc.currency)} />
            <Total label={labels.discount} value={formatMoney(doc.discount_amount, lang, doc.currency)} />
            <Total label={labels.tax} value={formatMoney(doc.tax_amount, lang, doc.currency)} />
            <div className="mt-1 flex w-64 justify-between border-t border-border pt-2 text-base font-semibold text-navy dark:text-primary-foreground">
              <span>{labels.total}</span>
              <span>{formatMoney(doc.total, lang, doc.currency)}</span>
            </div>
          </div>
        )}

        {doc.notes && (
          <div className="mt-8 border-t border-border pt-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{labels.notes}</p>
            <p className="mt-1 whitespace-pre-line text-sm">{doc.notes}</p>
          </div>
        )}
      </article>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-64 justify-between text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}