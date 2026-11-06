export type ProductionPdfCell = string | number | null | undefined;
export type ProductionPdfSection = {
  title: string;
  headers: string[];
  rows: ProductionPdfCell[][];
  /** Indeks kolom yang rata kanan (angka / rupiah). Jika kosong, kolom bernilai angka dideteksi otomatis. */
  right?: number[];
  /** Baris total di bawah tabel (sudah terformat). */
  foot?: ProductionPdfCell[];
};

const NUMERIC = /^-?(Rp\s?)?[\d.,]+(\s?%)?$/;

export async function productionPdf(
  filename: string,
  title: string,
  tenant: { name: string; legal_name?: string | null; address?: string | null; phone?: string | null; email?: string | null },
  sections: ProductionPdfSection[],
) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  pdf.setFontSize(16); pdf.setFont('helvetica', 'bold'); pdf.text(tenant.legal_name || tenant.name, 40, 44);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(90);
  const contact = [tenant.address, tenant.phone, tenant.email].filter(Boolean).join(' | ');
  const contactLines = pdf.splitTextToSize(contact, W - 80);
  pdf.text(contactLines, 40, 60);
  let y = 72 + contactLines.length * 10;
  pdf.setDrawColor(200); pdf.line(40, y, W - 40, y); y += 20;
  pdf.setTextColor(20); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.text(title, 40, y);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(110);
  pdf.text(`Dicetak ${new Date().toLocaleString('id-ID')}`, W - 40, y, { align: 'right' });
  pdf.setTextColor(20); y += 20;
  for (const section of sections) {
    if (y > 720) { pdf.addPage(); y = 40; }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text(section.title, 40, y);
    const body = section.rows.map((r) => r.map((v) => (v == null || v === '' ? '-' : String(v))));
    const right = new Set(
      section.right ?? section.headers.map((_, i) => i).filter((i) => body.length > 0 && body.every((r) => r[i] === '-' || NUMERIC.test(r[i]))),
    );
    const columnStyles: Record<number, { halign: 'right' | 'left' }> = {};
    section.headers.forEach((_, i) => { columnStyles[i] = { halign: right.has(i) ? 'right' : 'left' }; });
    autoTable(pdf, {
      startY: y + 6,
      head: [section.headers.map((h, i) => ({ content: h, styles: { halign: right.has(i) ? 'right' : 'left' } }))],
      body,
      foot: section.foot ? [section.foot.map((v, i) => ({ content: v == null ? '' : String(v), styles: { halign: right.has(i) ? 'right' : 'left' } }))] : undefined,
      styles: { fontSize: 8, cellPadding: 4, lineColor: [220, 220, 220], lineWidth: 0.3, overflow: 'linebreak' },
      headStyles: { fillColor: [17, 40, 77], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 249, 251] },
      columnStyles,
      theme: 'grid',
      margin: { left: 40, right: 40 },
    });
    y = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 22;
  }
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(120);
    pdf.text(`Halaman ${i} / ${pages}`, W - 40, pdf.internal.pageSize.getHeight() - 24, { align: 'right' });
  }
  return { pdf, filename: filename.replace(/[^a-zA-Z0-9_-]/g, '-') };
}

export async function saveProductionPdf(filename: string, title: string, tenant: Parameters<typeof productionPdf>[2], sections: ProductionPdfSection[]) {
  const result = await productionPdf(filename, title, tenant, sections);
  result.pdf.save(`${result.filename}.pdf`);
}
