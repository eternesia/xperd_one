export type ProductionPdfSection = { title: string; headers: string[]; rows: (string | number | null | undefined)[][] };
export async function productionPdf(filename: string, title: string, tenant: { name: string; legal_name?: string | null; address?: string | null; phone?: string | null; email?: string | null }, sections: ProductionPdfSection[]) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  pdf.setFontSize(16); pdf.text(tenant.legal_name || tenant.name, 40, 44);
  pdf.setFontSize(9);
  const contact = [tenant.address, tenant.phone, tenant.email].filter(Boolean).join(' | ');
  const contactLines = pdf.splitTextToSize(contact, 510);
  pdf.text(contactLines, 40, 60);
  let y = 76 + contactLines.length * 10;
  pdf.setFontSize(12); pdf.text(title, 40, y); y += 22;
  for (const section of sections) {
    if (y > 730) { pdf.addPage(); y = 40; }
    pdf.setFontSize(10); pdf.text(section.title, 40, y);
    autoTable(pdf, { startY: y + 8, head: [section.headers], body: section.rows.map((r) => r.map((v) => v == null ? '-' : String(v))),
      styles: { fontSize: 8, cellPadding: 4 }, theme: 'grid', margin: { left: 40, right: 40 } });
    y = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 24;
  }
  return { pdf, filename: filename.replace(/[^a-zA-Z0-9_-]/g, '-') };
}

export async function saveProductionPdf(filename: string, title: string, tenant: Parameters<typeof productionPdf>[2], sections: ProductionPdfSection[]) {
  const result = await productionPdf(filename, title, tenant, sections);
  result.pdf.save(`${result.filename}.pdf`);
}