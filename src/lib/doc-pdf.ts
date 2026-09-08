import type { PrcDoc, PrcLine } from "@/lib/procurement";

interface PdfMeta {
  title: string;
  companyName: string;
  lang: string;
  labels: Record<string, string>;
}

function money(v: number, lang: string, currency: string) {
  return new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(v ?? 0)) + ` ${currency}`;
}

export async function buildDocPdf(doc: PrcDoc, lines: PrcLine[], meta: PdfMeta) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 40;

  pdf.setFontSize(16);
  pdf.setTextColor(10, 26, 53);
  pdf.text(meta.companyName, marginX, 50);
  pdf.setFontSize(12);
  pdf.setTextColor(120, 120, 120);
  pdf.text(meta.title.toUpperCase(), marginX, 68);

  pdf.setFontSize(10);
  pdf.setTextColor(40, 40, 40);
  const info: [string, string][] = [
    [meta.labels.number, doc.doc_number],
    [meta.labels.date, doc.doc_date],
    [meta.labels.supplier, doc.supplier_name || doc.supplier_code || "-"],
    [meta.labels.status, doc.status],
    [meta.labels.reference, doc.reference || "-"],
    [meta.labels.dueDate, doc.due_date || "-"],
  ];
  const bankName = (doc as unknown as { bank_account_name?: string | null }).bank_account_name;
  const bankCode = (doc as unknown as { bank_account_code?: string | null }).bank_account_code;
  if (doc.warehouse_code && meta.labels.warehouse) info.push([meta.labels.warehouse, doc.warehouse_code]);
  if (bankName || bankCode) info.push([meta.labels.bank ?? "Bank", bankName || bankCode || "-"]);
  info.forEach(([k, v], i) => {
    const x = i % 2 === 0 ? marginX : 320;
    const y = 100 + Math.floor(i / 2) * 16;
    pdf.setTextColor(130, 130, 130);
    pdf.text(`${k}:`, x, y);
    pdf.setTextColor(30, 30, 30);
    pdf.text(String(v), x + 80, y);
  });

  autoTable(pdf, {
    startY: 108 + Math.ceil(info.length / 2) * 16 + 16,
    head: [[
      "#",
      meta.labels.item,
      meta.labels.description,
      meta.labels.qty,
      meta.labels.uom,
      meta.labels.price,
      meta.labels.lineTotal,
    ]],
    body: lines.map((l, i) => [
      String(i + 1),
      l.item_code ?? "-",
      l.description ?? "-",
      String(l.qty),
      l.uom_code ?? "-",
      money(l.unit_price, meta.lang, doc.currency),
      money(l.line_total, meta.lang, doc.currency),
    ]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [10, 26, 53], textColor: 255 },
    theme: "grid",
    margin: { left: marginX, right: marginX },
  });

  const endY = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
  let y = endY + 24;
  const totals: [string, number][] = [
    [meta.labels.subtotal, doc.subtotal],
    [meta.labels.discount, doc.discount_amount],
    [meta.labels.tax, doc.tax_amount],
    [meta.labels.total, doc.total],
  ];
  totals.forEach(([k, v], i) => {
    pdf.setFontSize(i === totals.length - 1 ? 11 : 10);
    pdf.setTextColor(i === totals.length - 1 ? 10 : 110, i === totals.length - 1 ? 26 : 110, i === totals.length - 1 ? 53 : 110);
    pdf.text(k, 360, y);
    pdf.setTextColor(30, 30, 30);
    pdf.text(money(v, meta.lang, doc.currency), 555, y, { align: "right" });
    y += 16;
  });

  if (doc.notes) {
    pdf.setFontSize(9);
    pdf.setTextColor(110, 110, 110);
    pdf.text(`${meta.labels.notes}:`, marginX, endY + 24);
    pdf.setTextColor(40, 40, 40);
    pdf.text(pdf.splitTextToSize(doc.notes, 280), marginX, endY + 38);
  }

  return pdf;
}

export async function downloadDocPdf(doc: PrcDoc, lines: PrcLine[], meta: PdfMeta) {
  const pdf = await buildDocPdf(doc, lines, meta);
  pdf.save(`${doc.doc_number.replace(/\//g, "-")}.pdf`);
}