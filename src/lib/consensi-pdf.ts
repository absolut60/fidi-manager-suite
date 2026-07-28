import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { INFORMATIVA_FULL, CONSENSO_TESTI, CONSENSO_LABEL, type TipoConsenso } from "./consensi-testi";

export type ConsensiPdfInput = {
  ragioneSociale: string;
  partitaIva?: string | null;
  codiceFiscale?: string | null;
  indirizzo?: string | null;
  citta?: string | null;
  firmatarioNome: string;
  firmatarioEmail?: string | null;
  consensi: Record<TipoConsenso, boolean>;
  firmaPngDataUrl: string;
  dataFirma: Date;
  ipAddress?: string | null;
};

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) out.push(cur);
      cur = w;
    } else {
      cur = (cur ? cur + " " : "") + w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function sanitize(text: string): string {
  // pdf-lib StandardFonts (WinAnsi) non supporta caratteri unicode moderni.
  return text
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E\n]/g, "");
}

export async function generaPdfConsensiMarketing(input: ConsensiPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageW = 595;
  const pageH = 842;
  const margin = 50;
  const bottom = 60;
  const lineH = 12;

  let page = pdf.addPage([pageW, pageH]);
  let y = pageH - margin;

  const ensureSpace = (needed: number) => {
    if (y - needed < bottom) {
      page = pdf.addPage([pageW, pageH]);
      y = pageH - margin;
    }
  };

  const drawLine = (text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
    const size = opts.size ?? 9;
    const f = opts.bold ? fontBold : font;
    const color = opts.color ? rgb(...opts.color) : rgb(0.1, 0.1, 0.1);
    ensureSpace(size + 4);
    page.drawText(sanitize(text), { x: margin, y, size, font: f, color });
    y -= size + 3;
  };

  const drawParagraph = (text: string, opts: { size?: number; maxChars?: number } = {}) => {
    const size = opts.size ?? 9;
    const maxChars = opts.maxChars ?? 95;
    for (const raw of text.split("\n")) {
      if (!raw.trim()) { y -= 4; continue; }
      for (const line of wrap(sanitize(raw), maxChars)) {
        ensureSpace(size + 2);
        page.drawText(line, { x: margin, y, size, font, color: rgb(0.15, 0.15, 0.15) });
        y -= lineH;
      }
    }
  };

  // Titolo
  page.drawText("CONSENSI PRIVACY - MARKETING E PROFILAZIONE", {
    x: margin, y, size: 14, font: fontBold, color: rgb(0.05, 0.05, 0.2),
  });
  y -= 22;
  page.drawText("Reg. UE 2016/679 (GDPR)", { x: margin, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
  y -= 20;

  // Titolare / cliente
  drawLine("Cliente / soggetto interessato", { size: 10, bold: true });
  const fallback = (v: string | null | undefined) => {
    const s = v == null ? "" : String(v).trim();
    return s.length > 0 ? s : "-";
  };
  const rows: Array<[string, string]> = [
    ["Ragione sociale", fallback(input.ragioneSociale)],
    ["Partita IVA", fallback(input.partitaIva)],
    ["Codice Fiscale", fallback(input.codiceFiscale)],
    ["Indirizzo", [input.indirizzo, input.citta].filter(Boolean).join(", ") || "-"],
  ];
  for (const [k, v] of rows) {
    ensureSpace(14);
    page.drawText(sanitize(`${k}:`), { x: margin, y, size: 9, font: fontBold });
    page.drawText(sanitize(v), { x: margin + 100, y, size: 9, font });
    y -= 12;
  }
  y -= 4;
  drawLine("Firmatario", { size: 10, bold: true });
  ensureSpace(14);
  page.drawText("Nome dichiarato:", { x: margin, y, size: 9, font: fontBold });
  page.drawText(sanitize(input.firmatarioNome), { x: margin + 100, y, size: 9, font });
  y -= 12;
  if (input.firmatarioEmail) {
    ensureSpace(14);
    page.drawText("Email:", { x: margin, y, size: 9, font: fontBold });
    page.drawText(sanitize(input.firmatarioEmail), { x: margin + 100, y, size: 9, font });
    y -= 12;
  }
  y -= 10;

  // Informativa
  drawLine("Informativa", { size: 11, bold: true });
  drawParagraph(INFORMATIVA_FULL);
  y -= 6;

  // Consensi
  drawLine("Consensi", { size: 11, bold: true });
  const order: TipoConsenso[] = ["profilazione", "marketing_media", "marketing_diretto"];
  const testoMap: Record<TipoConsenso, string> = {
    profilazione: CONSENSO_TESTI.profilazione,
    marketing_media: CONSENSO_TESTI.media,
    marketing_diretto: CONSENSO_TESTI.diretto,
  };
  for (const k of order) {
    const val = input.consensi[k];
    drawLine(`${CONSENSO_LABEL[k]}:  ${val ? "[X] FORNISCE il consenso" : "[X] NEGA il consenso"}`, { size: 10, bold: true });
    drawParagraph(testoMap[k], { size: 8, maxChars: 105 });
    y -= 4;
  }

  // Firma
  y -= 10;
  ensureSpace(90);
  drawLine("Firma del sottoscritto:", { size: 10, bold: true });
  const sigBoxX = margin;
  const sigBoxW = 280;
  const sigMaxH = 60;
  const pngBytes = await fetch(input.firmaPngDataUrl).then((r) => r.arrayBuffer());
  const pngImage = await pdf.embedPng(pngBytes);
  const scale = Math.min(sigBoxW / pngImage.width, sigMaxH / pngImage.height, 0.5);
  const sigW = pngImage.width * scale;
  const sigH = pngImage.height * scale;
  const lineY = y - sigH - 4;
  page.drawImage(pngImage, { x: sigBoxX, y: lineY + 2, width: sigW, height: sigH });
  page.drawLine({
    start: { x: sigBoxX, y: lineY }, end: { x: sigBoxX + sigBoxW, y: lineY },
    thickness: 0.5, color: rgb(0.5, 0.5, 0.5),
  });
  y = lineY - 16;
  drawLine(`Data e ora: ${input.dataFirma.toLocaleString("it-IT")}`, { size: 9 });
  if (input.ipAddress) drawLine(`IP di provenienza: ${input.ipAddress}`, { size: 8, color: [0.4, 0.4, 0.4] });

  // Footer
  page.drawText(
    sanitize(`Documento generato elettronicamente - ${input.ragioneSociale}`),
    { x: margin, y: 30, size: 7, font, color: rgb(0.6, 0.6, 0.6) },
  );

  return pdf.save();
}
