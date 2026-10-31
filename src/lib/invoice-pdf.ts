export type InvoicePdfInput = {
  invoice_number: string;
  issue_date: string;
  due_date?: string | null;
  paid_at?: string | null;
  status: string;
  product?: string | null;
  notes?: string | null;
  subtotal?: number | null;
  tax_amount?: number | null;
  total: number;
  payment_method?: string | null;
};

const idr = (v: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(v || 0));
const STATUS: Record<string, string> = { paid: "LUNAS", unpaid: "BELUM DIBAYAR", pending: "MENUNGGU", overdue: "JATUH TEMPO", cancelled: "DIBATALKAN", draft: "DRAFT" };

/** Builds and downloads a branded A4 invoice PDF as proof of transaction. */
export async function downloadInvoicePdf(inv: InvoicePdfInput, customer: { name: string; email?: string | null }, brand = "Qalling") {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const w = pdf.internal.pageSize.getWidth();
  const x = 48;

  pdf.setFillColor(29, 78, 216);
  pdf.rect(0, 0, w, 6, "F");
  pdf.setFontSize(20);
  pdf.setTextColor(29, 78, 216);
  pdf.text(brand, x, 56);
  pdf.setFontSize(22);
  pdf.setTextColor(20, 20, 30);
  pdf.text("INVOICE", w - x, 56, { align: "right" });
  pdf.setFontSize(10);
  pdf.setTextColor(110, 110, 120);
  pdf.text(inv.invoice_number, w - x, 72, { align: "right" });

  const paid = inv.status === "paid";
  pdf.setFontSize(11);
  pdf.setTextColor(paid ? 22 : 200, paid ? 150 : 90, paid ? 80 : 30);
  pdf.text(STATUS[inv.status] ?? inv.status.toUpperCase(), w - x, 90, { align: "right" });

  pdf.setFontSize(9);
  pdf.setTextColor(120, 120, 130);
  pdf.text("DITAGIHKAN KEPADA", x, 120);
  pdf.setFontSize(11);
  pdf.setTextColor(20, 20, 30);
  pdf.text(customer.name, x, 136);
  if (customer.email) { pdf.setFontSize(10); pdf.text(customer.email, x, 151); }

  const meta: [string, string][] = [
    ["Tanggal terbit", inv.issue_date],
    ["Jatuh tempo", inv.due_date ?? "-"],
    ["Dibayar", inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("id-ID") : "-"],
    ["Metode", inv.payment_method ?? "-"],
  ];
  let y = 120;
  pdf.setFontSize(9.5);
  meta.forEach(([k, v]) => {
    pdf.setTextColor(120, 120, 130); pdf.text(k, w - 220, y);
    pdf.setTextColor(20, 20, 30); pdf.text(String(v), w - x, y, { align: "right" });
    y += 15;
  });

  const subtotal = Number(inv.subtotal ?? inv.total);
  autoTable(pdf, {
    startY: 190,
    margin: { left: x, right: x },
    head: [["Deskripsi", "Jumlah"]],
    body: [[inv.notes || inv.product || "Layanan", idr(subtotal)]],
    headStyles: { fillColor: [29, 78, 216], textColor: 255 },
    columnStyles: { 1: { halign: "right", cellWidth: 140 } },
    styles: { fontSize: 10, cellPadding: 8 },
  });
  let ty = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 240) + 24;
  const rows: [string, number][] = [["Subtotal", subtotal], ["Pajak", Number(inv.tax_amount ?? 0)], ["Total", Number(inv.total)]];
  rows.forEach(([k, v], i) => {
    const last = i === rows.length - 1;
    pdf.setFontSize(last ? 12 : 10);
    pdf.setTextColor(last ? 20 : 110, last ? 20 : 110, last ? 30 : 120);
    pdf.text(k, w - 220, ty);
    pdf.text(idr(v), w - x, ty, { align: "right" });
    ty += last ? 0 : 18;
  });

  const h = pdf.internal.pageSize.getHeight();
  pdf.setFontSize(8.5);
  pdf.setTextColor(140, 140, 150);
  pdf.text("Dokumen ini dibuat otomatis dan sah sebagai bukti transaksi.", x, h - 40);
  pdf.text(`Dicetak ${new Date().toLocaleString("id-ID")}`, w - x, h - 40, { align: "right" });
  pdf.save(`${inv.invoice_number.replace(/[/\\]/g, "-")}.pdf`);
}
