/**
 * Formal financial-statement renderer (print, PDF, Excel).
 *
 * Produces statements that follow Indonesian accounting presentation practice:
 * entity letterhead, formal statement title, explicit period wording, currency
 * note, right aligned figures, double-ruled totals and an authorisation block.
 * Balance sheets are rendered "skontro" (assets on the left, liabilities and
 * equity on the right) by default.
 */

export interface StmtEntity {
  name: string;
  legalName?: string | null;
  address?: string | null;
  taxId?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  currency?: string | null;
}

export type StmtRowKind = "item" | "group" | "subtotal" | "total" | "blank";

export interface StmtRow {
  code?: string | null;
  label: string;
  /** one value per numeric column; single column statements pass one value */
  values?: (number | string | null)[];
  kind?: StmtRowKind;
  indent?: number;
}

export interface StmtSection {
  title?: string;
  rows: StmtRow[];
}

export interface StatementDoc {
  filename: string;
  lang: string;
  entity: StmtEntity;
  /** formal statement title, e.g. "LAPORAN POSISI KEUANGAN (NERACA)" */
  title: string;
  /** "Per 30 September 2026" or "Untuk periode yang berakhir 30 September 2026" */
  periodLabel: string;
  layout: "skontro" | "stafel";
  /** numeric column headers for stafel layouts */
  columns?: string[];
  sections?: StmtSection[];
  left?: StmtSection;
  right?: StmtSection;
  note?: string;
  orientation?: "portrait" | "landscape";
  signatures?: { left: string; right: string };
}

/* --------------------------------- helpers -------------------------------- */

function esc(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 2026-09-30 -> "30 September 2026" */
export function longDate(iso: string, lang: string) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  if (!y || !m || !d) return iso;
  const months = lang === "id" ? MONTHS_ID : MONTHS_EN;
  return lang === "id" ? `${d} ${months[m - 1]} ${y}` : `${months[m - 1]} ${d}, ${y}`;
}

/** "Per 30 September 2026" — balance-sheet style wording. */
export function asOfLabel(iso: string, lang: string) {
  return lang === "id" ? `Per ${longDate(iso, lang)}` : `As of ${longDate(iso, lang)}`;
}

/** "Untuk periode 1 September 2026 s.d. 30 September 2026" */
export function periodRangeLabel(from: string, to: string, lang: string) {
  return lang === "id"
    ? `Untuk periode yang berakhir pada ${longDate(to, lang)} (${longDate(from, lang)} s.d. ${longDate(to, lang)})`
    : `For the period ended ${longDate(to, lang)} (${longDate(from, lang)} to ${longDate(to, lang)})`;
}

export function currencyNote(lang: string, currency?: string | null) {
  const cur = currency || "IDR";
  return lang === "id"
    ? `(Dinyatakan dalam ${cur === "IDR" ? "Rupiah" : cur}, kecuali dinyatakan lain)`
    : `(Expressed in ${cur}, unless otherwise stated)`;
}

/** Accounting figure: thousands separated, negatives in parentheses. */
export function acctNumber(v: number | string | null | undefined, lang: string) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "string") return v;
  const n = Number(v) || 0;
  const s = Math.abs(n).toLocaleString(lang === "id" ? "id-ID" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `(${s})` : s;
}

/* ---------------------------------- html ---------------------------------- */

const INK = "#0a1a35";

function css(landscape: boolean) {
  const w = landscape ? 1123 : 794;
  const h = landscape ? 794 : 1123;
  return `
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#1f2937;font-family:"Times New Roman",Georgia,serif;font-size:12px}
.sheet{width:${w}px;min-height:${h}px;padding:46px 52px 60px;margin:0 auto;background:#fff;position:relative}
.lh{display:flex;align-items:flex-start;gap:16px;border-bottom:2px solid ${INK};padding-bottom:10px}
.lh img{max-height:52px;max-width:150px;object-fit:contain}
.lh .ent{flex:1;text-align:center}
.ent .nm{font-size:16px;font-weight:700;letter-spacing:.04em;color:${INK};text-transform:uppercase}
.ent .ad{font-size:10.5px;color:#4b5563;margin-top:2px;line-height:1.45}
.ttl{text-align:center;margin-top:16px}
.ttl h1{margin:0;font-size:14.5px;font-weight:700;letter-spacing:.08em;color:${INK};text-transform:uppercase}
.ttl .pr{font-size:11.5px;margin-top:3px;color:#111827}
.ttl .cu{font-size:10px;margin-top:2px;color:#6b7280;font-style:italic}
table{width:100%;border-collapse:collapse}
th{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:${INK};padding:7px 6px;border-top:1.4px solid ${INK};border-bottom:1.4px solid ${INK};text-align:left}
th.r{text-align:right}
td{padding:4.5px 6px;font-size:11.5px;vertical-align:top}
td.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.code{color:#6b7280;font-size:10.5px;width:76px;white-space:nowrap}
tr.group td{font-weight:700;color:${INK};padding-top:10px;text-transform:uppercase;font-size:11px;letter-spacing:.03em}
tr.subtotal td{font-weight:600;border-top:1px solid #9ca3af}
tr.total td{font-weight:700;color:${INK};border-top:1.2px solid ${INK};border-bottom:3px double ${INK};padding-top:6px;padding-bottom:6px}
.sk{display:flex;gap:26px;margin-top:14px;align-items:stretch}
.sk > div{flex:1 1 0;min-width:0}
.sk h2{margin:0 0 4px;font-size:11.5px;font-weight:700;color:${INK};letter-spacing:.06em;text-transform:uppercase;border-bottom:1.4px solid ${INK};padding-bottom:5px}
.note{margin-top:16px;font-size:10.5px;color:#4b5563;line-height:1.5}
.sig{display:flex;justify-content:space-between;gap:40px;margin-top:38px;page-break-inside:avoid}
.sig div{flex:0 0 220px;text-align:center;font-size:11px}
.sig .ln{margin-top:56px;border-top:1px solid #4b5563;padding-top:4px;color:#4b5563}
.ft{margin-top:26px;border-top:1px solid #d1d5db;padding-top:6px;display:flex;justify-content:space-between;font-size:9.5px;color:#6b7280}
@page{size:${landscape ? "A4 landscape" : "A4 portrait"};margin:10mm}
@media print{body{background:#fff}.sheet{width:auto;min-height:auto;padding:0;box-shadow:none}}
`;
}

function letterhead(e: StmtEntity) {
  const lines = [e.address, [e.phone, e.email].filter(Boolean).join(" · "), e.taxId ? `NPWP: ${e.taxId}` : ""]
    .filter(Boolean)
    .map((l) => esc(l))
    .join("<br/>");
  return `<div class="lh">
    ${e.logoUrl ? `<img src="${esc(e.logoUrl)}" alt=""/>` : `<div style="width:0"></div>`}
    <div class="ent">
      <div class="nm">${esc(e.legalName || e.name)}</div>
      ${lines ? `<div class="ad">${lines}</div>` : ""}
    </div>
    ${e.logoUrl ? `<div style="width:150px"></div>` : `<div style="width:0"></div>`}
  </div>`;
}

function rowHtml(r: StmtRow, cols: number, lang: string, withCode: boolean) {
  const kind = r.kind ?? "item";
  const pad = (r.indent ?? 0) * 14;
  if (kind === "blank") return `<tr><td colspan="${cols + (withCode ? 2 : 1)}">&nbsp;</td></tr>`;
  const values = r.values ?? [];
  const cells = Array.from({ length: cols }).map((_, i) => {
    const v = values[i];
    return `<td class="r">${kind === "group" && (v === null || v === undefined) ? "" : esc(acctNumber(v, lang))}</td>`;
  }).join("");
  return `<tr class="${kind}">
    ${withCode ? `<td class="code">${esc(r.code ?? "")}</td>` : ""}
    <td style="padding-left:${6 + pad}px">${esc(r.label)}</td>
    ${cells}
  </tr>`;
}

function sectionTable(section: StmtSection, columns: string[], lang: string, withCode: boolean) {
  const head = `<thead><tr>
    ${withCode ? `<th style="width:62px">${lang === "id" ? "Kode" : "Code"}</th>` : ""}
    <th>${lang === "id" ? "Uraian" : "Description"}</th>
    ${columns.map((c) => `<th class="r">${esc(c)}</th>`).join("")}
  </tr></thead>`;
  const body = section.rows.map((r) => rowHtml(r, columns.length, lang, withCode)).join("");
  return `${section.title ? `<h2>${esc(section.title)}</h2>` : ""}<table>${head}<tbody>${body}</tbody></table>`;
}

export function buildStatementHtml(doc: StatementDoc) {
  const lang = doc.lang;
  const landscape = doc.orientation === "landscape";
  const columns = doc.columns ?? [lang === "id" ? "Jumlah" : "Amount"];
  const sig = doc.signatures ?? {
    left: lang === "id" ? "Dibuat oleh," : "Prepared by,",
    right: lang === "id" ? "Disetujui oleh," : "Approved by,",
  };

  let bodyHtml = "";
  if (doc.layout === "skontro" && doc.left && doc.right) {
    bodyHtml = `<div class="sk">
      <div>${sectionTable(doc.left, [lang === "id" ? "Jumlah" : "Amount"], lang, true)}</div>
      <div>${sectionTable(doc.right, [lang === "id" ? "Jumlah" : "Amount"], lang, true)}</div>
    </div>`;
  } else {
    bodyHtml = (doc.sections ?? [])
      .map((s) => `<div style="margin-top:14px">${sectionTable(s, columns, lang, true)}</div>`)
      .join("");
  }

  const stamp = new Date().toLocaleString(lang === "id" ? "id-ID" : "en-US");
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"/>
  <title>${esc(doc.title)}</title><style>${css(landscape)}</style></head><body>
  <div class="sheet">
    ${letterhead(doc.entity)}
    <div class="ttl">
      <h1>${esc(doc.title)}</h1>
      <div class="pr">${esc(doc.periodLabel)}</div>
      <div class="cu">${esc(currencyNote(lang, doc.entity.currency))}</div>
    </div>
    ${bodyHtml}
    ${doc.note ? `<div class="note">${esc(doc.note)}</div>` : ""}
    <div class="sig">
      <div>${esc(sig.left)}<div class="ln">(${lang === "id" ? "Bagian Akuntansi" : "Accounting"})</div></div>
      <div>${esc(sig.right)}<div class="ln">(${lang === "id" ? "Direktur / Pimpinan" : "Director"})</div></div>
    </div>
    <div class="ft">
      <span>${esc(doc.entity.legalName || doc.entity.name)}</span>
      <span>${lang === "id" ? "Dicetak" : "Printed"}: ${esc(stamp)}</span>
    </div>
  </div></body></html>`;
}

/* --------------------------------- outputs -------------------------------- */

/** Print only the statement sheet in an isolated frame (no app stylesheet). */
export function printStatement(doc: StatementDoc) {
  const html = buildStatementHtml(doc);
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  const run = () => {
    win.focus();
    win.print();
    window.setTimeout(() => frame.remove(), 1000);
  };
  if (win.document.readyState === "complete") window.setTimeout(run, 250);
  else frame.onload = () => window.setTimeout(run, 250);
}

/** Same sheet rendered to a paginated A4 PDF. */
export async function downloadStatementPdf(doc: StatementDoc) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const landscape = doc.orientation === "landscape";
  const pageW = landscape ? 1123 : 794;
  const pageH = landscape ? 794 : 1123;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${pageW + 40}px;height:${pageH + 200}px;border:0;background:#fff;`;
  document.body.appendChild(frame);
  try {
    const fdoc = frame.contentDocument;
    if (!fdoc) throw new Error("renderer unavailable");
    fdoc.open();
    fdoc.write(buildStatementHtml(doc));
    fdoc.close();
    await new Promise<void>((resolve) => {
      if (fdoc.readyState === "complete") resolve();
      else frame.addEventListener("load", () => resolve(), { once: true });
      window.setTimeout(resolve, 1500);
    });
    const sheet = fdoc.querySelector(".sheet") as HTMLElement | null;
    if (!sheet) throw new Error("sheet unavailable");
    const canvas = await html2canvas(sheet, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: pageW,
      width: pageW,
    });
    const imgH = (canvas.height * pageW) / canvas.width;
    const pdf = new jsPDF({
      unit: "px",
      format: [pageW, pageH],
      orientation: landscape ? "landscape" : "portrait",
    });
    const data = canvas.toDataURL("image/jpeg", 0.98);
    let offset = 0;
    while (offset < imgH - 1) {
      if (offset > 0) pdf.addPage([pageW, pageH], landscape ? "landscape" : "portrait");
      pdf.addImage(data, "JPEG", 0, -offset, pageW, imgH);
      offset += pageH;
    }
    pdf.save(`${doc.filename}.pdf`);
  } finally {
    frame.remove();
  }
}

/** Workbook keeps raw numbers so the figures stay analysable. */
export async function exportStatementXlsx(doc: StatementDoc) {
  const XLSX = await import("xlsx");
  const lang = doc.lang;
  const aoa: (string | number | null)[][] = [];
  aoa.push([doc.entity.legalName || doc.entity.name]);
  if (doc.entity.address) aoa.push([doc.entity.address]);
  aoa.push([doc.title]);
  aoa.push([doc.periodLabel]);
  aoa.push([currencyNote(lang, doc.entity.currency)]);
  aoa.push([]);

  if (doc.layout === "skontro" && doc.left && doc.right) {
    const amount = lang === "id" ? "Jumlah" : "Amount";
    aoa.push([
      doc.left.title ?? "", "", amount,
      doc.right.title ?? "", "", amount,
    ]);
    const n = Math.max(doc.left.rows.length, doc.right.rows.length);
    for (let i = 0; i < n; i += 1) {
      const l = doc.left.rows[i];
      const r = doc.right.rows[i];
      aoa.push([
        l?.code ?? "", l?.label ?? "", (l?.values?.[0] as number) ?? null,
        r?.code ?? "", r?.label ?? "", (r?.values?.[0] as number) ?? null,
      ]);
    }
    aoa.push([]);
  } else {
    const columns = doc.columns ?? [lang === "id" ? "Jumlah" : "Amount"];
    for (const s of doc.sections ?? []) {
      if (s.title) aoa.push([s.title]);
      aoa.push([lang === "id" ? "Kode" : "Code", lang === "id" ? "Uraian" : "Description", ...columns]);
      for (const r of s.rows) {
        if (r.kind === "blank") { aoa.push([]); continue; }
        aoa.push([r.code ?? "", r.label, ...(r.values ?? []).map((v) => (typeof v === "number" ? v : (v ?? null)))]);
      }
      aoa.push([]);
    }
  }
  if (doc.note) aoa.push([doc.note]);

  const sheet = XLSX.utils.aoa_to_sheet(aoa as unknown[][]);
  sheet["!cols"] = [{ wch: 12 }, { wch: 44 }, { wch: 20 }, { wch: 12 }, { wch: 44 }, { wch: 20 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Statement");
  XLSX.writeFile(book, `${doc.filename}.xlsx`);
}
