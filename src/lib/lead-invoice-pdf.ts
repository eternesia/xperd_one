export type PublicInvoice = {
  number: string;
  issueDate: string;
  dueDate: string | null;
  status: string;
  customer: { name: string; company: string | null; phone: string | null; email: string | null };
  items: { description: string; qty: number; price: number }[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string | null;
  seller: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    bank: string | null;
    footer: string | null;
    logoUrl: string | null;
  };
};
export const idr = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(v || 0));
export const INVOICE_STATUS: Record<string, string> = {
  unpaid: "BELUM DIBAYAR",
  paid: "LUNAS",
  cancelled: "DIBATALKAN",
};

export async function downloadLeadInvoicePdf(inv: PublicInvoice) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const w = pdf.internal.pageSize.getWidth();
  const x = 48;
  let y = 56;
  if (inv.seller.logoUrl?.startsWith("data:image/")) {
    try {
      pdf.addImage(inv.seller.logoUrl, x, 36, 44, 44, undefined, "FAST");
      y = 56;
    } catch {
      /* logo tidak terbaca: lewati */
    }
  }
  const lx = inv.seller.logoUrl ? x + 56 : x;
  pdf.setFontSize(16);
  pdf.setTextColor(20, 20, 30);
  pdf.text(inv.seller.name, lx, y);
  pdf.setFontSize(9);
  pdf.setTextColor(110, 110, 120);
  const contact = [
    inv.seller.address,
    [inv.seller.phone, inv.seller.email].filter(Boolean).join(" · "),
  ]
    .filter(Boolean)
    .join("\n");
  if (contact) pdf.text(pdf.splitTextToSize(contact, 260), lx, y + 14);
  pdf.setFontSize(22);
  pdf.setTextColor(20, 20, 30);
  pdf.text("INVOICE", w - x, y, { align: "right" });
  pdf.setFontSize(10);
  pdf.setTextColor(110, 110, 120);
  pdf.text(inv.number, w - x, y + 16, { align: "right" });
  pdf.text(`Tanggal: ${inv.issueDate}`, w - x, y + 30, { align: "right" });
  if (inv.dueDate) pdf.text(`Jatuh tempo: ${inv.dueDate}`, w - x, y + 44, { align: "right" });
  const paid = inv.status === "paid";
  pdf.setFontSize(11);
  pdf.setTextColor(paid ? 22 : 200, paid ? 150 : 90, paid ? 80 : 30);
  pdf.text(INVOICE_STATUS[inv.status] ?? inv.status, w - x, y + 62, { align: "right" });

  pdf.setFontSize(9);
  pdf.setTextColor(110, 110, 120);
  pdf.text("Ditagihkan kepada", x, 140);
  pdf.setFontSize(11);
  pdf.setTextColor(20, 20, 30);
  pdf.text(
    [inv.customer.name, inv.customer.company, inv.customer.phone, inv.customer.email].filter(
      Boolean,
    ) as string[],
    x,
    156,
  );

  autoTable(pdf, {
    startY: 220,
    head: [["Deskripsi", "Qty", "Harga", "Jumlah"]],
    body: inv.items.map((i) => [i.description, String(i.qty), idr(i.price), idr(i.qty * i.price)]),
    headStyles: { fillColor: [29, 78, 216] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    margin: { left: x, right: x },
  });
  // @ts-expect-error lastAutoTable ditambahkan plugin
  let ty: number = pdf.lastAutoTable.finalY + 20;
  pdf.setFontSize(10);
  pdf.setTextColor(20, 20, 30);
  const row = (l: string, v: string, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.text(l, w - x - 150, ty);
    pdf.text(v, w - x, ty, { align: "right" });
    ty += 16;
  };
  row("Subtotal", idr(inv.subtotal));
  if (inv.taxAmount > 0) row(`Pajak ${inv.taxRate}%`, idr(inv.taxAmount));
  row("Total", idr(inv.total), true);
  pdf.setFont("helvetica", "normal");
  ty += 10;
  const blocks = [
    inv.seller.bank ? `Pembayaran:\n${inv.seller.bank}` : "",
    inv.notes ? `Catatan:\n${inv.notes}` : "",
    inv.seller.footer ?? "",
  ].filter(Boolean);
  pdf.setFontSize(9);
  pdf.setTextColor(90, 90, 100);
  for (const b of blocks) {
    const lines = pdf.splitTextToSize(b, w - x * 2) as string[];
    pdf.text(lines, x, ty);
    ty += lines.length * 12 + 8;
  }
  pdf.save(`${inv.number}.pdf`);
}
