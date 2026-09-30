/**
 * Shared spreadsheet / PDF exporters for tabular reports.
 * Keeps report screens free of library-specific code.
 *
 * Diporting dari BS New 3 (#43/#47) — murni client-side, memakai `xlsx`,
 * `jspdf`, dan `jspdf-autotable` yang sudah ada di Old.
 */

export type Cell = string | number | null | undefined;

export interface TableExport {
  /** file name without extension */
  filename: string;
  title: string;
  subtitle?: string;
  headers: string[];
  rows: Cell[][];
  /** optional summary lines printed above the table */
  summary?: [string, string][];
  /** numeric column indexes rendered right aligned */
  numericColumns?: number[];
  orientation?: "portrait" | "landscape";
}

export async function exportTableXlsx(input: TableExport) {
  const XLSX = await import("xlsx");
  const aoa: Cell[][] = [];
  aoa.push([input.title]);
  if (input.subtitle) aoa.push([input.subtitle]);
  for (const [k, v] of input.summary ?? []) aoa.push([k, v]);
  aoa.push([]);
  aoa.push(input.headers);
  for (const r of input.rows) aoa.push(r);

  const sheet = XLSX.utils.aoa_to_sheet(aoa as unknown[][]);
  sheet["!cols"] = input.headers.map((h, i) => ({
    wch: Math.min(42, Math.max(12, h.length + 2, ...input.rows.map((r) => String(r[i] ?? "").length + 2))),
  }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Report");
  XLSX.writeFile(book, `${input.filename}.xlsx`);
}

export async function exportTablePdf(input: TableExport) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: input.orientation ?? "portrait" });
  const marginX = 36;

  pdf.setFontSize(15);
  pdf.setTextColor(10, 26, 53);
  pdf.text(input.title, marginX, 46);

  let y = 62;
  if (input.subtitle) {
    pdf.setFontSize(10);
    pdf.setTextColor(120, 120, 120);
    pdf.text(input.subtitle, marginX, y);
    y += 16;
  }

  pdf.setFontSize(9.5);
  for (const [k, v] of input.summary ?? []) {
    pdf.setTextColor(125, 125, 125);
    pdf.text(`${k}:`, marginX, y);
    pdf.setTextColor(30, 30, 30);
    pdf.text(String(v), marginX + 130, y);
    y += 14;
  }

  const numeric = new Set(input.numericColumns ?? []);
  const render = (c: Cell, col: number) => {
    if (c === null || c === undefined || c === "") return "";
    if (typeof c === "number" && numeric.has(col)) {
      return c.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
    return String(c);
  };
  autoTable(pdf, {
    startY: y + 8,
    head: [input.headers],
    body: input.rows.map((r) => r.map((c, i) => render(c, i))),
    styles: { fontSize: 8, cellPadding: 4, textColor: [35, 35, 35] },
    headStyles: { fillColor: [10, 26, 53], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 247, 250] },
    columnStyles: Object.fromEntries(
      input.headers.map((_, i) => [i, { halign: numeric.has(i) ? "right" : "left" }]),
    ) as Record<number, { halign: "left" | "right" }>,
    margin: { left: marginX, right: marginX },
  });

  // Footer: print timestamp on the left, page numbering on the right.
  const stamp = new Date().toLocaleString("id-ID");
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    pdf.setPage(p);
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    pdf.setFontSize(7.5);
    pdf.setTextColor(140, 140, 140);
    pdf.text(`Dicetak / Generated: ${stamp}`, marginX, h - 18);
    pdf.text(`Hal. ${p} / ${pages}`, w - marginX, h - 18, { align: "right" });
  }

  pdf.save(`${input.filename}.pdf`);
}
