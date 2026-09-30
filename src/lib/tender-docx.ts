// PORTING NOTE (Batch 3 #52): disalin apa adanya dari BS New 3 — modul ini murni
// client-side (jszip + DOM), tanpa dependensi Supabase, jadi tidak perlu diubah.
import JSZip from "jszip";

export interface LetterheadProfile {
  name: string;
  legalName?: string | null;
  address?: string | null;
  taxId?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  backgroundUrl?: string | null;
  showAddress?: boolean;
  showTaxId?: boolean;
  showPhone?: boolean;
  showEmail?: boolean;
  showDivider?: boolean;
}

const XML_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const LETTERHEAD = {
  navy: "8F97A7",
  blue: "86B2CF",
  cyan: "7EC9D9",
  gold: "E8D39A",
  ink: "172033",
  muted: "9AA8BC",
};

function xmlEscape(value: string) {
  return value.replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '\"': "&quot;" })[char] ?? char);
}

function placeholders(profile: LetterheadProfile) {
  return new Map([
    ["{{nama_perusahaan}}", profile.name],
    ["{{nama_legal}}", profile.legalName || profile.name],
    ["{{alamat_perusahaan}}", profile.address || ""],
    ["{{npwp}}", profile.taxId || ""],
    ["{{telepon}}", profile.phone || ""],
    ["{{email}}", profile.email || ""],
  ]);
}

function replaceParagraphPlaceholders(xml: string, values: Map<string, string>) {
  const parser = new DOMParser();
  const document = parser.parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) return xml;
  for (const paragraph of Array.from(document.getElementsByTagNameNS(XML_NS, "p"))) {
    const textNodes = Array.from(paragraph.getElementsByTagNameNS(XML_NS, "t"));
    const original = textNodes.map((node) => node.textContent ?? "").join("");
    let replaced = original;
    for (const [token, value] of values) replaced = replaced.split(token).join(value);
    if (replaced === original || !textNodes[0]) continue;
    textNodes[0].textContent = replaced;
    textNodes.slice(1).forEach((node) => { node.textContent = ""; });
  }
  return new XMLSerializer().serializeToString(document);
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return { bytes, extension: match[1].toLowerCase() === "png" ? "png" : "jpeg" };
}

function logoDrawing() {
  return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1371600" cy="548640"/><wp:docPr id="9101" name="Company logo"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="9102" name="Company logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1371600" cy="548640"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

function backgroundDrawing() {
  return `<w:pict><v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t" path="m@4@5l@4@11@9@11@9@5xe" filled="f" stroked="f"><v:stroke joinstyle="miter"/><v:formulas><v:f eqn="if lineDrawn pixelLineWidth 0"/><v:f eqn="sum @0 1 0"/><v:f eqn="sum 0 0 @1"/><v:f eqn="prod @2 1 2"/><v:f eqn="prod @3 21600 pixelWidth"/><v:f eqn="prod @3 21600 pixelHeight"/><v:f eqn="sum @0 0 1"/><v:f eqn="prod @6 1 2"/><v:f eqn="prod @7 21600 pixelWidth"/><v:f eqn="sum @8 21600 0"/><v:f eqn="prod @7 21600 pixelHeight"/><v:f eqn="sum @10 21600 0"/></v:formulas><v:path o:extrusionok="f" gradientshapeok="t" o:connecttype="rect"/><o:lock v:ext="edit" aspectratio="t"/></v:shapetype><v:shape id="TenderLetterheadBackground" o:spid="_x0000_s9201" type="#_x0000_t75" style="position:absolute;margin-left:0;margin-top:0;width:595.3pt;height:841.9pt;z-index:-251654144;mso-position-horizontal-relative:page;mso-position-vertical-relative:page" stroked="f"><v:imagedata r:id="rIdBackground" o:title="Tender letterhead background"/></v:shape></w:pict>`;
}

function colorCell(width: number, color: string, height = 420) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${color}"/><w:tcMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:rPr><w:sz w:val="${Math.max(2, Math.round(height / 10))}"/></w:rPr></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p></w:tc>`;
}

function borderlessTable(widths: number[], row: string) {
  const tableWidth = widths.reduce((total, width) => total + width, 0);
  return `<w:tbl><w:tblPr><w:tblW w:w="${tableWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid><w:tr>${row}</w:tr></w:tbl>`;
}

function headerXml(profile: LetterheadProfile, hasLogo: boolean, hasBackground: boolean) {
  if (hasBackground) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="${XML_NS}" xmlns:r="${REL_NS}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r>${backgroundDrawing()}</w:r></w:p></w:hdr>`;
  }
  const identity = hasLogo
    ? `<w:r>${logoDrawing()}</w:r>`
    : `<w:r><w:rPr><w:b/><w:color w:val="${LETTERHEAD.navy}"/><w:sz w:val="27"/></w:rPr><w:t>${xmlEscape(profile.legalName || profile.name)}</w:t></w:r>`;
  const brandCell = `<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${identity}</w:p></w:tc>`;
  const motif = borderlessTable(
    [4500, 1450, 1100, 1000, 950],
    `${brandCell}${colorCell(1450, LETTERHEAD.cyan, 520)}${colorCell(1100, LETTERHEAD.blue, 520)}${colorCell(1000, LETTERHEAD.navy, 520)}${colorCell(950, LETTERHEAD.gold, 520)}`,
  );
  const divider = profile.showDivider === false
    ? `<w:p><w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr></w:p>`
    : `<w:p><w:pPr><w:spacing w:before="80" w:after="80"/><w:pBdr><w:bottom w:val="single" w:sz="5" w:space="1" w:color="D8B34A"/></w:pBdr></w:pPr></w:p>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="${XML_NS}" xmlns:r="${REL_NS}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">${motif}${divider}</w:hdr>`;
}

function footerXml(profile: LetterheadProfile, hasBackground: boolean) {
  if (hasBackground) return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="${XML_NS}"><w:p/></w:ftr>`;
  const details = [
    profile.showPhone !== false && profile.phone ? `T ${profile.phone}` : null,
    profile.showEmail !== false && profile.email ? `E ${profile.email}` : null,
    profile.showTaxId !== false && profile.taxId ? `NPWP ${profile.taxId}` : null,
    profile.showAddress !== false ? profile.address : null,
  ].filter(Boolean);
  const detailLines = details.length
    ? details.map((line) => `<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:rPr><w:color w:val="${LETTERHEAD.muted}"/><w:sz w:val="15"/></w:rPr><w:t>${xmlEscape(String(line))}</w:t></w:r></w:p>`).join("")
    : `<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:color w:val="${LETTERHEAD.muted}"/><w:sz w:val="15"/></w:rPr><w:t>${xmlEscape(profile.legalName || profile.name)}</w:t></w:r></w:p>`;
  const motifCell = `<w:tc><w:tcPr><w:tcW w:w="3900" w:type="dxa"/><w:vAlign w:val="bottom"/></w:tcPr>${borderlessTable([1200, 850, 1050, 800], `${colorCell(1200, LETTERHEAD.navy, 300)}${colorCell(850, LETTERHEAD.blue, 300)}${colorCell(1050, LETTERHEAD.cyan, 300)}${colorCell(800, LETTERHEAD.gold, 300)}`)}</w:tc>`;
  const emptyCell = `<w:tc><w:tcPr><w:tcW w:w="1700" w:type="dxa"/></w:tcPr><w:p/></w:tc>`;
  const detailCell = `<w:tc><w:tcPr><w:tcW w:w="3400" w:type="dxa"/><w:vAlign w:val="bottom"/></w:tcPr>${detailLines}</w:tc>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="${XML_NS}" xmlns:r="${REL_NS}">${borderlessTable([3900, 1700, 3400], `${motifCell}${emptyCell}${detailCell}`)}</w:ftr>`;
}

export async function buildLetterheadedDocx(input: Blob, profile: LetterheadProfile) {
  const zip = await JSZip.loadAsync(input);
  const documentFile = zip.file("word/document.xml");
  const relsFile = zip.file("word/_rels/document.xml.rels");
  const typesFile = zip.file("[Content_Types].xml");
  if (!documentFile || !relsFile || !typesFile) throw new Error("File Word tidak valid atau format lama .doc");

  let documentXml = replaceParagraphPlaceholders(await documentFile.async("string"), placeholders(profile));
  let relsXml = await relsFile.async("string");
  let typesXml = await typesFile.async("string");
  const relationIds = Array.from(relsXml.matchAll(/Id="rId(\d+)"/g), (match) => Number(match[1]));
  const relationNumber = Math.max(100, ...relationIds.filter(Number.isFinite)) + 1;
  const headerRelationId = `rId${relationNumber}`;
  const footerRelationId = `rId${relationNumber + 1}`;

  relsXml = relsXml.replace("</Relationships>", `<Relationship Id="${headerRelationId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="headerXperd.xml"/><Relationship Id="${footerRelationId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footerXperd.xml"/></Relationships>`);
  if (!typesXml.includes('PartName="/word/headerXperd.xml"')) {
    typesXml = typesXml.replace("</Types>", '<Override PartName="/word/headerXperd.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>');
  }
  if (!typesXml.includes('PartName="/word/footerXperd.xml"')) {
    typesXml = typesXml.replace("</Types>", '<Override PartName="/word/footerXperd.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>');
  }

  documentXml = documentXml.replace(/<w:headerReference\s+[^>]*w:type="default"[^>]*\/>/g, "");
  documentXml = documentXml.replace(/<w:footerReference\s+[^>]*w:type="default"[^>]*\/>/g, "");
  if (documentXml.includes("<w:sectPr")) {
    documentXml = documentXml.replace(/<w:sectPr([^>]*)>/g, `<w:sectPr$1><w:headerReference w:type="default" r:id="${headerRelationId}"/><w:footerReference w:type="default" r:id="${footerRelationId}"/>`);
  } else {
    documentXml = documentXml.replace("</w:body>", `<w:sectPr><w:headerReference w:type="default" r:id="${headerRelationId}"/><w:footerReference w:type="default" r:id="${footerRelationId}"/></w:sectPr></w:body>`);
  }

  const image = profile.logoUrl ? decodeDataUrl(profile.logoUrl) : null;
  const background = profile.backgroundUrl ? decodeDataUrl(profile.backgroundUrl) : null;
  zip.file("word/headerXperd.xml", headerXml(profile, Boolean(image), Boolean(background)));
  zip.file("word/footerXperd.xml", footerXml(profile, Boolean(background)));
  const headerRelationships: string[] = [];
  if (image && !background) {
    zip.file(`word/media/xperd-letterhead.${image.extension}`, image.bytes);
    headerRelationships.push(`<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/xperd-letterhead.${image.extension}"/>`);
  }
  if (background) {
    zip.file(`word/media/xperd-letterhead-background.${background.extension}`, background.bytes);
    headerRelationships.push(`<Relationship Id="rIdBackground" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/xperd-letterhead-background.${background.extension}"/>`);
  }
  if (headerRelationships.length) {
    zip.file("word/_rels/headerXperd.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${headerRelationships.join("")}</Relationships>`);
  }
  for (const media of [image, background]) {
    if (!media) continue;
    if (!typesXml.includes(`Extension="${media.extension}"`)) {
      const mime = media.extension === "png" ? "image/png" : "image/jpeg";
      typesXml = typesXml.replace("</Types>", `<Default Extension="${media.extension}" ContentType="${mime}"/></Types>`);
    }
  }

  zip.file("word/document.xml", documentXml);
  zip.file("word/_rels/document.xml.rels", relsXml);
  zip.file("[Content_Types].xml", typesXml);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}