import type { PrcDoc, PrcLine } from "@/lib/procurement";

export type DocTemplate = "classic" | "modern" | "minimal";

export const DOC_TEMPLATES: { id: DocTemplate; en: string; id_: string; hint_en: string; hint_id: string }[] = [
  {
    id: "classic",
    en: "Classic Corporate",
    id_: "Klasik Korporat",
    hint_en: "Clean grid, meta box on the right, grey table header.",
    hint_id: "Rapi, kotak informasi di kanan, header tabel abu-abu.",
  },
  {
    id: "modern",
    en: "Modern Accent",
    id_: "Modern Aksen",
    hint_en: "Dark company block, coloured table band, signature area.",
    hint_id: "Blok perusahaan gelap, pita tabel berwarna, area tanda tangan.",
  },
  {
    id: "minimal",
    en: "Minimal Executive",
    id_: "Minimal Eksekutif",
    hint_en: "Typographic, wide spacing, hairline rules.",
    hint_id: "Tipografis, spasi lega, garis tipis.",
  },
];

export interface DocCompany {
  name: string;
  legalName?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  bankInfo?: string | null;
  footerNote?: string | null;
}

export interface DocPrintMeta {
  title: string;
  lang: string;
  template: DocTemplate;
  company: DocCompany;
  labels: Record<string, string>;
  statusLabel: string;
  /** Delivery orders print without prices/tax/totals (BS parity). */
  hideAmounts?: boolean;
  /** Bank account chosen on the document — shown instead of the company bank text. */
  paymentAccount?: string | null;
}

function esc(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function nl2br(v: string) {
  return esc(v).replace(/\n/g, "<br/>");
}

function money(v: number, lang: string) {
  return new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v ?? 0));
}

function num(v: number, lang: string) {
  return new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(v ?? 0));
}

const PALETTE: Record<DocTemplate, { accent: string; dark: string; soft: string }> = {
  classic: { accent: "#0a1a35", dark: "#0a1a35", soft: "#f1f3f7" },
  modern: { accent: "#1a8fe3", dark: "#22262b", soft: "#eef4f9" },
  minimal: { accent: "#c8a44b", dark: "#0a1a35", soft: "#faf8f3" },
};

function baseCss(t: DocTemplate, scope = "") {
  const p = PALETTE[t];
  const s = scope ? `${scope} ` : "";
  const rules = [
    `${s}*{box-sizing:border-box;}`,
    scope
      ? `${scope}{margin:0;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:#1f2937;font-size:12px;background:#fff;}`
      : `body{margin:0;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:#1f2937;font-size:12px;background:#fff;}`,
    `${s}.sheet{width:794px;min-height:1123px;padding:44px 48px;margin:0 auto;background:#fff;position:relative;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:#1f2937;font-size:12px;}`,
    `${s}h1,${s}h2,${s}h3{margin:0;}`,
    `${s}table{width:100%;border-collapse:collapse;}`,
    `${s}.muted{color:#6b7280;}`,
    `${s}.right{text-align:right;}`,
    `${s}.center{text-align:center;}`,
    `${s}.accent{color:${p.accent};}`,
    `${s}.items th{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;padding:10px 8px;}`,
    `${s}.items td{padding:9px 8px;vertical-align:top;}`,
    `${s}.totals td{padding:5px 8px;}`,
    `${s}.status{display:inline-block;padding:6px 16px;border-radius:999px;font-weight:700;font-size:11px;letter-spacing:.08em;text-transform:uppercase;}`,
    `${s}.notes{margin-top:26px;font-size:11px;color:#4b5563;white-space:pre-line;}`,
    scope ? "" : "@page{size:A4;margin:0;}",
  ];
  return rules.join("\n");
}

function lineRows(lines: PrcLine[], lang: string, labels: Record<string, string>, hideAmounts = false) {
  if (!lines.length)
    return `<tr><td colspan="${hideAmounts ? 3 : 6}" class="center muted" style="padding:26px">${esc(labels.noLines ?? "-")}</td></tr>`;
  return lines
    .map(
      (l, i) => `<tr>
      <td class="muted">${i + 1}</td>
      <td><strong>${esc(l.item_code ?? "-")}</strong>${l.description ? `<div class="muted" style="margin-top:3px">${esc(l.description)}</div>` : ""}</td>
      <td class="right">${num(l.qty, lang)}<div class="muted" style="font-size:10px">${esc(l.uom_code ?? "")}</div></td>
       ${hideAmounts ? "" : `<td class="right">${money(l.unit_price, lang)}</td>
       <td class="right">${num(l.tax_rate ?? 0, lang)}%</td>
       <td class="right"><strong>${money(l.line_total, lang)}</strong></td>`}
    </tr>`,
    )
    .join("");
}

function totalsRows(doc: PrcDoc, lang: string, labels: Record<string, string>, accent: string) {
  return `
  <tr><td class="right muted">${esc(labels.subtotal)}</td><td class="right" style="width:140px">${money(doc.subtotal, lang)}</td></tr>
  <tr><td class="right muted">${esc(labels.discount)}</td><td class="right">${money(doc.discount_amount, lang)}</td></tr>
  <tr><td class="right muted">${esc(labels.tax)}</td><td class="right">${money(doc.tax_amount, lang)}</td></tr>
  <tr><td class="right" style="font-weight:700;color:${accent};border-top:1px solid #d8dce4;padding-top:9px">${esc(labels.total)} (${esc(doc.currency)})</td>
      <td class="right" style="font-weight:700;color:${accent};border-top:1px solid #d8dce4;padding-top:9px">${money(doc.total, lang)}</td></tr>`;
}

function companyBlock(c: DocCompany) {
  return [c.legalName || c.name, c.address, c.phone, c.email, c.taxId ? `NPWP ${c.taxId}` : ""]
    .filter(Boolean)
    .map((v) => esc(v))
    .join("<br/>");
}

function classicBody(doc: PrcDoc, lines: PrcLine[], m: DocPrintMeta) {
  const p = PALETTE.classic;
  const L = m.labels;
  return `<div class="sheet">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:20px;font-weight:700;color:${p.dark}">${esc(m.company.name)}</div>
        <div class="muted" style="margin-top:8px;line-height:1.6">${companyBlock(m.company)}</div>
      </div>
      <div style="text-align:right">
        <h1 style="font-size:26px;letter-spacing:.06em;color:${p.dark}">${esc(m.title).toUpperCase()}</h1>
        <table style="margin-top:14px;border:1px solid #d8dce4;width:270px">
          <tr><td style="background:${p.soft};padding:7px 10px;font-weight:700">${esc(L.number)}</td><td style="padding:7px 10px;font-weight:700">${esc(doc.doc_number)}</td></tr>
          <tr><td style="background:${p.soft};padding:7px 10px;font-weight:700;border-top:1px solid #d8dce4">${esc(L.date)}</td><td style="padding:7px 10px;border-top:1px solid #d8dce4">${esc(doc.doc_date)}</td></tr>
          <tr><td style="background:${p.soft};padding:7px 10px;font-weight:700;border-top:1px solid #d8dce4">${esc(L.dueDate)}</td><td style="padding:7px 10px;border-top:1px solid #d8dce4">${esc(doc.due_date ?? "-")}</td></tr>
        </table>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;margin-top:34px">
      <div>
        <div class="muted">${esc(L.billedTo)}</div>
        <div style="margin-top:5px;font-weight:700;font-size:14px">${esc(doc.supplier_name || doc.supplier_code || "-")}</div>
        ${doc.reference ? `<div class="muted" style="margin-top:4px">${esc(L.reference)}: ${esc(doc.reference)}</div>` : ""}
        ${doc.warehouse_code ? `<div class="muted">${esc(L.warehouse)}: ${esc(doc.warehouse_code)}</div>` : ""}
      </div>
      <div style="text-align:right">
        <span class="status" style="border:1.5px solid ${p.dark};color:${p.dark}">${esc(m.statusLabel)}</span>
      </div>
    </div>

    <table class="items" style="margin-top:26px;border:1px solid #d8dce4">
      <thead><tr style="background:${p.soft};color:${p.dark}">
        <th class="right" style="width:28px">#</th><th style="text-align:left">${esc(L.description)}</th>
        <th class="right">${esc(L.qty)}</th>${m.hideAmounts ? "" : `<th class="right">${esc(L.price)}</th>
         <th class="right">${esc(L.tax)}</th><th class="right">${esc(L.lineTotal)}</th>`}
      </tr></thead>
       <tbody>${lineRows(lines, m.lang, L, m.hideAmounts)}</tbody>
    </table>

    <div style="display:flex;justify-content:space-between;margin-top:20px;gap:40px">
      <div style="flex:1">
        ${m.paymentAccount ? `<div><div style="font-weight:700">${esc(L.bank)}</div><div class="muted" style="margin-top:4px">${esc(m.paymentAccount)}</div></div>` : ""}
        ${doc.notes ? `<div class="notes"><strong>${esc(L.notes)}</strong><br/>${nl2br(doc.notes)}</div>` : ""}
      </div>
       ${m.hideAmounts ? "" : `<table class="totals" style="width:320px">${totalsRows(doc, m.lang, L, p.dark)}</table>`}
    </div>

    <div style="position:absolute;left:48px;right:48px;bottom:40px;border-top:1px solid #e5e7eb;padding-top:10px" class="muted">
      ${esc(m.company.footerNote || L.thanks)}
    </div>
  </div>`;
}

function modernBody(doc: PrcDoc, lines: PrcLine[], m: DocPrintMeta) {
  const p = PALETTE.modern;
  const L = m.labels;
  return `<div class="sheet" style="background:#fbfcfd">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div style="background:${p.dark};color:#fff;padding:18px 26px;border-radius:4px">
        <div style="font-size:20px;font-weight:800;letter-spacing:.02em">${esc(m.company.name)}</div>
        <div style="font-size:10px;letter-spacing:.28em;color:${p.accent};margin-top:4px">${esc(m.title).toUpperCase()}</div>
      </div>
      <div style="text-align:right">
        ${m.hideAmounts ? "" : `<div style="color:${p.accent};font-weight:700;font-size:14px">${esc(L.total)}</div>
        <div style="font-size:26px;font-weight:800;color:${p.dark}">${esc(doc.currency)} ${money(doc.total, m.lang)}</div>`}
        <div class="muted" style="margin-top:6px">${esc(L.number)}: <strong>${esc(doc.doc_number)}</strong></div>
        <div class="muted">${esc(L.date)}: ${esc(doc.doc_date)}${doc.due_date ? ` · ${esc(L.dueDate)}: ${esc(doc.due_date)}` : ""}</div>
        <div style="margin-top:8px"><span class="status" style="background:${p.accent};color:#fff">${esc(m.statusLabel)}</span></div>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;margin-top:32px;gap:40px">
      <div style="flex:1">
        <div style="color:${p.accent};font-weight:700;font-size:11px;letter-spacing:.1em">${esc(L.billedTo).toUpperCase()}</div>
        <div style="margin-top:6px;font-size:15px;font-weight:700">${esc(doc.supplier_name || doc.supplier_code || "-")}</div>
        ${doc.reference ? `<div class="muted" style="margin-top:3px">${esc(L.reference)}: ${esc(doc.reference)}</div>` : ""}
      </div>
      <div style="flex:1;text-align:right">
        <div style="color:${p.accent};font-weight:700;font-size:11px;letter-spacing:.1em">${esc(L.from).toUpperCase()}</div>
        <div class="muted" style="margin-top:6px;line-height:1.6">${companyBlock(m.company)}</div>
      </div>
    </div>

    <table class="items" style="margin-top:28px">
      <thead><tr style="background:${p.accent};color:#fff">
        <th class="right" style="width:28px">#</th><th style="text-align:left">${esc(L.description)}</th>
         <th class="right">${esc(L.qty)}</th>${m.hideAmounts ? "" : `<th class="right">${esc(L.price)}</th>
         <th class="right">${esc(L.tax)}</th><th class="right">${esc(L.lineTotal)}</th>`}
      </tr></thead>
       <tbody>${lines.length ? lineRows(lines, m.lang, L, m.hideAmounts).replace(/<tr>/g, '<tr style="border-bottom:1px solid #e3e9ef">') : lineRows(lines, m.lang, L, m.hideAmounts)}</tbody>
    </table>

    ${m.hideAmounts ? "" : `<div style="display:flex;justify-content:flex-end;margin-top:14px">
      <table class="totals" style="width:330px;background:${p.soft};border-radius:4px">${totalsRows(doc, m.lang, L, p.dark)}</table>
    </div>`}

    <div style="display:flex;justify-content:space-between;margin-top:34px;gap:40px">
      <div style="flex:1">
        ${m.paymentAccount ? `<div><div style="font-weight:700;color:${p.dark}">${esc(L.bank)}</div><div class="muted" style="margin-top:4px">${esc(m.paymentAccount)}</div></div>` : ""}
        ${doc.notes ? `<div class="notes"><strong>${esc(L.notes)}</strong><br/>${nl2br(doc.notes)}</div>` : ""}
      </div>
      <div style="width:220px;text-align:center">
        <div style="height:56px"></div>
        <div style="border-top:1px solid #9aa4b2;padding-top:6px" class="muted">${esc(L.signature)}</div>
      </div>
    </div>

    <div style="position:absolute;left:0;right:0;bottom:0;background:${p.dark};color:#fff;padding:12px 48px;font-size:11px;display:flex;justify-content:space-between">
      <span>${esc(m.company.footerNote || L.thanks)}</span><span>${esc(doc.doc_number)}</span>
    </div>
  </div>`;
}

function minimalBody(doc: PrcDoc, lines: PrcLine[], m: DocPrintMeta) {
  const p = PALETTE.minimal;
  const L = m.labels;
  const info = (k: string, v: string) =>
    `<div style="margin-bottom:10px"><div class="muted" style="font-size:10px;letter-spacing:.14em;text-transform:uppercase">${esc(k)}</div><div style="margin-top:2px;font-weight:600">${esc(v)}</div></div>`;
  return `<div class="sheet">
    <div style="border-bottom:2px solid ${p.accent};padding-bottom:18px">
      <div style="font-size:10px;letter-spacing:.34em;color:${p.accent};font-weight:700">${esc(m.title).toUpperCase()}</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px">
        <h1 style="font-size:30px;font-weight:300;letter-spacing:.02em;color:${p.dark}">${esc(doc.doc_number)}</h1>
        <div style="text-align:right">
          <div style="font-size:16px;font-weight:600;color:${p.dark}">${esc(m.company.name)}</div>
          <div class="muted" style="margin-top:4px;line-height:1.6">${companyBlock(m.company)}</div>
        </div>
      </div>
    </div>

    <div style="display:flex;gap:48px;margin-top:26px">
      <div style="flex:1">${info(L.billedTo, doc.supplier_name || doc.supplier_code || "-")}${doc.reference ? info(L.reference, doc.reference) : ""}</div>
      <div style="width:180px">${info(L.date, doc.doc_date)}${info(L.dueDate, doc.due_date ?? "-")}</div>
      <div style="width:150px">${info(L.status, m.statusLabel)}${doc.warehouse_code ? info(L.warehouse, doc.warehouse_code) : ""}</div>
    </div>

    <table class="items" style="margin-top:22px">
      <thead><tr style="border-bottom:1px solid ${p.dark};color:${p.dark}">
        <th class="right" style="width:28px">#</th><th style="text-align:left">${esc(L.description)}</th>
         <th class="right">${esc(L.qty)}</th>${m.hideAmounts ? "" : `<th class="right">${esc(L.price)}</th>
         <th class="right">${esc(L.tax)}</th><th class="right">${esc(L.lineTotal)}</th>`}
      </tr></thead>
       <tbody>${lineRows(lines, m.lang, L, m.hideAmounts).replace(/<tr>/g, '<tr style="border-bottom:1px solid #ece8de">')}</tbody>
    </table>

     ${m.hideAmounts ? "" : `<div style="display:flex;justify-content:flex-end;margin-top:16px">
      <table class="totals" style="width:320px">${totalsRows(doc, m.lang, L, p.dark)}</table>
     </div>`}

    <div style="margin-top:30px;background:${p.soft};border-left:3px solid ${p.accent};padding:14px 18px">
      ${m.paymentAccount ? `<div style="font-weight:600">${esc(L.bank)}</div><div class="muted" style="margin-top:3px">${esc(m.paymentAccount)}</div>` : ""}
      ${doc.notes ? `<div style="margin-top:10px"><strong>${esc(L.notes)}</strong><div class="muted" style="margin-top:3px;white-space:pre-line">${nl2br(doc.notes)}</div></div>` : ""}
    </div>

    <div style="position:absolute;left:48px;right:48px;bottom:40px;text-align:center" class="muted">
      ${esc(m.company.footerNote || L.thanks)}
    </div>
  </div>`;
}

export function buildDocHtml(doc: PrcDoc, lines: PrcLine[], meta: DocPrintMeta) {
  const body =
    meta.template === "modern"
      ? modernBody(doc, lines, meta)
      : meta.template === "minimal"
        ? minimalBody(doc, lines, meta)
        : classicBody(doc, lines, meta);
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(doc.doc_number)}</title><style>${baseCss(meta.template)}</style></head><body>${body}</body></html>`;
}

/** Print only the document content in an isolated iframe (no app CSS). */
export function printDocHtml(doc: PrcDoc, lines: PrcLine[], meta: DocPrintMeta) {
  const html = buildDocHtml(doc, lines, meta);
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
  if (win.document.readyState === "complete") window.setTimeout(run, 200);
  else frame.onload = () => window.setTimeout(run, 200);
}

/** Render the same isolated HTML to a downloadable PDF. */
export async function downloadDocHtmlPdf(doc: PrcDoc, lines: PrcLine[], meta: DocPrintMeta) {
  const html = buildDocHtml(doc, lines, meta);

  // Render inside an isolated iframe so the app's stylesheet (which uses modern
  // colour functions html2canvas cannot parse) never reaches the canvas renderer.
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:820px;height:1200px;border:0;background:#fff;";
  document.body.appendChild(frame);

  try {
    const fdoc = frame.contentDocument;
    if (!fdoc) throw new Error("Could not prepare the PDF renderer");
    fdoc.open();
    fdoc.write(html);
    fdoc.close();

    await new Promise<void>((resolve) => {
      if (fdoc.readyState === "complete") resolve();
      else frame.addEventListener("load", () => resolve(), { once: true });
      window.setTimeout(resolve, 1500);
    });

    const sheet = fdoc.querySelector(".sheet") as HTMLElement | null;
    if (!sheet) throw new Error("Document content is not ready");

    // html2pdf re-hosts the source element inside the *main* document, whose
    // Tailwind v4 stylesheet uses oklch()/color() html2canvas cannot parse.
    // Instead render straight from the isolated iframe (hex-only CSS) by calling
    // html2canvas on the element: it clones element.ownerDocument, i.e. the iframe.
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    const canvas = await html2canvas(sheet, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: 794,
      width: 794,
    });
    // Multi-page: slice the rendered canvas into A4-sized steps instead of
    // squeezing a long document onto a single page.
    const pageW = 794;
    const pageH = 1123;
    const imgH = (canvas.height * pageW) / canvas.width;
    const pdf = new jsPDF({ unit: "px", format: [pageW, pageH], orientation: "portrait" });
    const img = canvas.toDataURL("image/jpeg", 0.98);
    let offset = 0;
    while (offset < imgH - 1) {
      if (offset > 0) pdf.addPage([pageW, pageH], "portrait");
      pdf.addImage(img, "JPEG", 0, -offset, pageW, imgH);
      offset += pageH;
    }
    pdf.save(`${doc.doc_number.replace(/[/\\]/g, "-")}.pdf`);
  } finally {
    frame.remove();
  }
}