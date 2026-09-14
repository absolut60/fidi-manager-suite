import { PDFDocument, StandardFonts, rgb, PDFPage } from "pdf-lib";
import { LOGO_MADE_BASE64 } from "./logo-made-base64";
import { INFORMATIVA_FULL } from "./consensi-testi";

export interface SchedaPdfInput {
  tipo: "nuovo" | "aggiornamento";
  ragioneSociale: string;
  dichiaranteNome?: string;
  dichiaranteCognome?: string;
  luogoNascita?: string;
  dataNascita?: string;
  codiceFiscaleDich?: string;
  partitaIva?: string;
  residenza?: string;
  emailDich?: string;
  cellulareDich?: string;
  consensoProfilazione: boolean | string;
  consensoMarketingMedia: boolean | string;
  consensoMarketingDiretto: boolean | string;
  dataFirma: string | Date;
  firmaPngDataUrl?: string;
  ipRaccolta?: string;
  dataOraRaccolta?: string;
  /** Default true: stampa anche il blocco consenso "media". Il QR non lo raccoglie → passare false. */
  mostraConsensoMedia?: boolean;
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    return s === "si" || s === "sì" || s === "true" || s === "yes";
  }
  return false;
}

function fmtFirma(v: string | Date): string {
  if (v instanceof Date) {
    const d = String(v.getDate()).padStart(2, "0");
    const m = String(v.getMonth() + 1).padStart(2, "0");
    return `${d}/${m}/${v.getFullYear()}`;
  }
  return v;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const ML = 36;
const MR = 36;
const MT = 30;
const MB = 52;
const CW = PAGE_W - ML - MR;
const GRAY = rgb(0.33, 0.33, 0.33);
const LGRAY = rgb(0.8, 0.8, 0.8);
const BGRAY = rgb(0.96, 0.96, 0.96);
const BLACK = rgb(0, 0, 0);
const NAVY = rgb(0.05, 0.12, 0.24);

export async function generaSchedaCliente(input: SchedaPdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Logo
  const logoBytes = Uint8Array.from(atob(LOGO_MADE_BASE64), (c) => c.charCodeAt(0));
  const logoImg = await pdfDoc.embedPng(logoBytes);
  const logoDims = logoImg.scale(1);
  const LOGO_W = 113;
  const LOGO_H = (LOGO_W * logoDims.height) / logoDims.width;

  function wrapText(text: string, maxWidth: number, fontSize: number, f: typeof font): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? current + " " + word : word;
      const w = f.widthOfTextAtSize(test, fontSize);
      if (w > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function drawWrapped(
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    maxW: number,
    size: number,
    f: typeof font,
    color = BLACK,
    lineHeightMul = 1.4,
  ): number {
    const lines = wrapText(text, maxW, size, f);
    const lineH = size * lineHeightMul;
    lines.forEach((line, i) => {
      page.drawText(line, { x, y: y - i * lineH, size, font: f, color });
    });
    return lines.length * lineH;
  }

  function drawHeader(page: PDFPage) {
    const lx = (PAGE_W - LOGO_W) / 2;
    const ly = PAGE_H - MT - LOGO_H;
    page.drawImage(logoImg, { x: lx, y: ly, width: LOGO_W, height: LOGO_H });
    page.drawLine({
      start: { x: ML, y: ly - 6 },
      end: { x: PAGE_W - MR, y: ly - 6 },
      thickness: 0.4,
      color: LGRAY,
    });
  }

  function drawFooter(page: PDFPage, pageNum: number, total: number) {
    const fy = MB;
    page.drawLine({
      start: { x: ML, y: fy + 40 },
      end: { x: PAGE_W - MR, y: fy + 40 },
      thickness: 0.4,
      color: LGRAY,
    });
    const flw = LOGO_W * 0.35;
    const flh = (flw * logoDims.height) / logoDims.width;
    page.drawImage(logoImg, { x: ML, y: fy + 6, width: flw, height: flh });
    const fx = ML + flw + 8;
    page.drawText("MADE DISTRIBUZIONE S.P.A.", { x: fx, y: fy + 26, size: 6.5, font: bold, color: BLACK });
    page.drawText("Sede Amministrativa: Via G. di Vittorio 3 - 20010 CASOREZZO (MI)", {
      x: fx,
      y: fy + 18,
      size: 5.8,
      font,
      color: GRAY,
    });
    page.drawText("C.F. 10126430965  |  REA Milano MI 2507310  |  Capitale Sociale Euro 1.572.000 i.v.", {
      x: fx,
      y: fy + 10,
      size: 5.8,
      font,
      color: GRAY,
    });
    page.drawText("REV.06 NOV-2025", {
      x: PAGE_W - MR - bold.widthOfTextAtSize("REV.06 NOV-2025", 6.5),
      y: fy + 18,
      size: 6.5,
      font: bold,
      color: BLACK,
    });
    const pag = `Pag. ${pageNum} di ${total}`;
    page.drawText(pag, {
      x: PAGE_W - MR - bold.widthOfTextAtSize(pag, 6.5),
      y: fy + 10,
      size: 6.5,
      font: bold,
      color: BLACK,
    });
  }

  // ── PAGINA 1 ──────────────────────────────────────────
  const page1 = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawHeader(page1);
  drawFooter(page1, 1, 2);

  const headerBottom = PAGE_H - MT - LOGO_H - 11;
  let y = headerBottom - 8;
  const minY = MB + 50;

  const titleText =
    "INFORMATIVA RESA AI SENSI DEGLI ARTT. 13-14 DEL GDPR (GENERAL DATA PROTECTION REGULATION) 2016/679";
  const titleH = drawWrapped(page1, titleText, ML, y, CW, 8.5, bold, NAVY);
  y -= titleH + 8;

  const informativeLines = INFORMATIVA_FULL.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const introText = informativeLines[0] ?? "";
  const introH = drawWrapped(page1, introText, ML, y, CW, 6.5, font, BLACK, 1.17);
  y -= introH + 10;

  const half = (CW - 16) / 2;
  const colXL = ML;
  const colXR = ML + half + 16;
  const colY = y;
  page1.drawLine({
    start: { x: ML + half + 8, y: colY },
    end: { x: ML + half + 8, y: minY },
    thickness: 0.3,
    color: LGRAY,
  });

  function drawCol(
    page: PDFPage,
    items: Array<{ text: string; isBold?: boolean; indent?: number }>,
    x: number,
    startY: number,
    w: number,
    stopY: number,
  ): number {
    let cy = startY;
    for (const item of items) {
      const f = item.isBold ? bold : font;
      const ix = x + (item.indent || 0);
      const iw = w - (item.indent || 0);
      const h = drawWrapped(page, item.text, ix, cy, iw, 6.5, f, BLACK, 1.17);
      cy -= h + 1.3;
      if (cy < stopY) break;
    }
    return cy;
  }

  const sectionHeadings = new Set([
    "TIPI DI DATI",
    "TIPI E FINALITA' DI TRATTAMENTO",
    "CATEGORIE DI SOGGETTI AI QUALI I DATI POSSONO ESSERE COMUNICATI",
    "MODALITA' DI TRATTAMENTO",
    "TERMINE DI CONSERVAZIONE DEI DATI",
    "CONSENSO DELL'INTERESSATO",
    "DIRITTI DELL'INTERESSATO",
    "DATI DEL TITOLARE E CONTATTI",
  ]);
  const toColumnItem = (text: string) => ({
    text,
    isBold: sectionHeadings.has(text),
    indent: /^[ivx]+\.\s/i.test(text) || /^[a-c]\)\s/.test(text) ? 10 : /^[A-G]\.\s/.test(text) ? 8 : 0,
  });
  const bodyLines = informativeLines.slice(1);
  const rightColumnStart = bodyLines.indexOf("CATEGORIE DI SOGGETTI AI QUALI I DATI POSSONO ESSERE COMUNICATI");
  const colLItems = bodyLines.slice(0, rightColumnStart).map(toColumnItem);
  const colRItems = bodyLines.slice(rightColumnStart).map(toColumnItem);

  drawCol(page1, colLItems, colXL, colY, half, minY);
  drawCol(page1, colRItems, colXR, colY, half, minY);

  // ── PAGINA 2 ──────────────────────────────────────────
  const page2 = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawHeader(page2);
  drawFooter(page2, 2, 2);

  let y2 = headerBottom - 8;

  const t2 = "FORMULAZIONE DEL CONSENSO";
  const t2w = bold.widthOfTextAtSize(t2, 10);
  page2.drawText(t2, { x: (PAGE_W - t2w) / 2, y: y2, size: 10, font: bold, color: BLACK });
  y2 -= 20;

  page2.drawText("Il sottoscritto,", { x: ML, y: y2, size: 8, font, color: BLACK });
  y2 -= 16;

  const rowH = 21;
  const lblW = 108;
  const tableRows: Array<[string, string]> = [
    ["Nome", input.dichiaranteNome || ""],
    ["Cognome", input.dichiaranteCognome || ""],
    ["Societa'", input.ragioneSociale],
    ["Luogo e data di nascita", `${input.luogoNascita || ""} ${input.dataNascita || ""}`],
    ["Codice fiscale", input.codiceFiscaleDich || ""],
    ["P.IVA", input.partitaIva || ""],
    ["Residenza", input.residenza || ""],
    ["Email", input.emailDich || ""],
    ["Cell.", input.cellulareDich || ""],
  ];

  page2.drawRectangle({
    x: ML,
    y: y2 - rowH * tableRows.length,
    width: CW,
    height: rowH * tableRows.length,
    borderColor: LGRAY,
    borderWidth: 0.5,
    color: rgb(1, 1, 1),
  });

  tableRows.forEach(([lbl, val], i) => {
    const ry = y2 - (i + 1) * rowH;
    page2.drawRectangle({ x: ML, y: ry, width: lblW, height: rowH, color: BGRAY, borderWidth: 0 });
    page2.drawLine({ start: { x: ML, y: ry }, end: { x: ML + CW, y: ry }, thickness: 0.3, color: LGRAY });
    page2.drawLine({
      start: { x: ML + lblW, y: ry },
      end: { x: ML + lblW, y: ry + rowH },
      thickness: 0.3,
      color: LGRAY,
    });
    const lw = font.widthOfTextAtSize(lbl, 8);
    page2.drawText(lbl, { x: ML + (lblW - lw) / 2, y: ry + rowH / 2 - 4, size: 8, font, color: BLACK });
    page2.drawText((val || "").slice(0, 65), {
      x: ML + lblW + 4,
      y: ry + rowH / 2 - 4,
      size: 8,
      font,
      color: BLACK,
    });
  });

  y2 -= rowH * tableRows.length + 14;

  const introConsText =
    "avendo letto l'informativa fornita dal titolare del trattamento ai sensi dell'art. 13 GDPR sul trattamento e sulla comunicazione dei dati personali (comuni, sensibili) da questo effettuati, con la finalita' connesse all'adempimento del rapporto contrattuale e ai connessi adempimenti di legge, essendo consapevole che in mancanza di consenso ai predetti trattamenti il titolare non potra' - da un lato - assolvere gli obblighi di legge e quindi costituire o proseguire il rapporto contrattuale e - dall'altro - di svolgere la propria attivita' tipica,";
  const introConsH = drawWrapped(page2, introConsText, ML, y2, CW, 8, font);
  y2 -= introConsH + 10;

  function drawConsentBlock(page: PDFPage, yPos: number, text: string, dato: boolean): number {
    const h = drawWrapped(page, text, ML, yPos, CW, 8, font);
    yPos -= h + 6;
    const cx = PAGE_W / 2 - 56;
    const si = dato ? "[X]" : "[ ]";
    const no = dato ? "[ ]" : "[X]";
    page.drawText(`${si}  fornisce il consenso`, { x: cx, y: yPos, size: 8, font, color: BLACK });
    yPos -= 14;
    page.drawText(`${no}  nega il consenso`, { x: cx, y: yPos, size: 8, font, color: BLACK });
    yPos -= 14;
    return yPos;
  }

  y2 = drawConsentBlock(
    page2,
    y2,
    "al trattamento, ivi compresa la comunicazione ai soggetti di cui al punto 9 e la cessione al di fuori dell'Unione Europea, dei dati personali, ivi compresi quelli sensibili di cui all'art. 9 GDPR e le immagini dell'interessato per le finalita' di analisi anche con strumenti tecnologici automatizzati (profilazione) al fine di consentire al titolare di poter gestire un consolidato nazionale in tempo reale e al fine di poter analizzare i dati caricati sul software per poter indirizzare al meglio le strategie commerciali del network.",
    toBool(input.consensoProfilazione),
  );
  if (input.mostraConsensoMedia !== false) {
    page2.drawText("Inoltre,", { x: ML, y: y2, size: 8, font, color: BLACK });
    y2 -= 12;

    y2 = drawConsentBlock(
      page2,
      y2,
      "al trattamento, ivi compresa la comunicazione ai soggetti di cui al punto 9 e la cessione al di fuori dell'Unione Europea, dei dati personali, ivi compresi quelli sensibili di cui all'art. 9 GDPR e le immagini dell'interessato per le finalita' di inserimento di dati, fotografie, articoli e riprese audiovisive nel proprio sito internet e nelle proprie pubblicazioni, social network, per la pubblicazione di fotografie e/o riprese audiovisive, corsi on line, pubblicazioni, brochure, presentazioni, cataloghi per fini didattici, pubblicitari e di marketing",
      toBool(input.consensoMarketingMedia),
    );
  }
  page2.drawText("Inoltre,", { x: ML, y: y2, size: 8, font, color: BLACK });
  y2 -= 12;

  y2 = drawConsentBlock(
    page2,
    y2,
    "al trattamento, ivi compresa la comunicazione ai soggetti di cui al punto 9 e la cessione al di fuori dell'Unione Europea, dei dati personali, ivi compresi quelli sensibili di cui all'art. 9 GDPR e le immagini dell'interessato per le finalita' di invio di informative per finalita' pubblicitarie e di marketing, anche via e-mail, sms, whatsapp.",
    toBool(input.consensoMarketingDiretto),
  );

  const firmaY = MB + 108;
  page2.drawText(`Li ${fmtFirma(input.dataFirma)} _______________`, { x: ML, y: firmaY, size: 8, font, color: BLACK });
  const firmaX = ML + CW * 0.55;

  if (input.firmaPngDataUrl) {
    page2.drawLine({
      start: { x: firmaX, y: firmaY },
      end: { x: PAGE_W - MR, y: firmaY },
      thickness: 0.5,
      color: BLACK,
    });
    const firmaLbl = "Firma";
    const firmaLblW = font.widthOfTextAtSize(firmaLbl, 8);
    page2.drawText(firmaLbl, {
      x: firmaX + (PAGE_W - MR - firmaX - firmaLblW) / 2,
      y: firmaY - 14,
      size: 8,
      font,
      color: BLACK,
    });

    try {
      const pngBytes = Uint8Array.from(atob(input.firmaPngDataUrl.split(",")[1]), (c) => c.charCodeAt(0));
      const firmaImg = await pdfDoc.embedPng(pngBytes);
      const firmaDims = firmaImg.scale(1);
      const firmaImgH = 50;
      const firmaImgW = (firmaImgH * firmaDims.width) / firmaDims.height;
      page2.drawImage(firmaImg, { x: firmaX + 14, y: firmaY + 4, width: firmaImgW, height: firmaImgH });
    } catch (e) {
      console.warn("Firma PNG non incorporata:", e);
    }
  } else {
    // Modalità FLAG: nessuna firma grafica, si stampa la prova telematica
    page2.drawText("Modalità di raccolta:", { x: firmaX, y: firmaY + 26, size: 8, font: bold, color: BLACK });
    page2.drawText(
      "Consenso prestato tramite conferma telematica (flag di",
      { x: firmaX, y: firmaY + 14, size: 8, font, color: BLACK },
    );
    page2.drawText(
      "accettazione) — nessuna firma grafica apposta.",
      { x: firmaX, y: firmaY + 4, size: 8, font, color: BLACK },
    );
    if (input.ipRaccolta || input.dataOraRaccolta) {
      const parti: string[] = [];
      if (input.ipRaccolta) parti.push(`Indirizzo IP: ${input.ipRaccolta}`);
      if (input.dataOraRaccolta) parti.push(`Data e ora: ${input.dataOraRaccolta}`);
      page2.drawText(parti.join(" — "), { x: firmaX, y: firmaY - 8, size: 7, font, color: BLACK });
    }
  }


  return pdfDoc.save();
}
