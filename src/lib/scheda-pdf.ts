import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { LOGO_MADE_BASE64 } from "./logo-made-base64";

export interface SchedaPdfInput {
  tipo: "nuovo" | "aggiornamento";
  ragioneSociale: string;
  dichiaranteNome: string;
  dichiaranteCognome: string;
  luogoNascita?: string | null;
  dataNascita?: string | null;
  codiceFiscaleDich?: string | null;
  partitaIva?: string | null;
  residenza?: string | null;
  emailDich?: string | null;
  cellulareDich?: string | null;
  consensoProfilazione: boolean | string | null;
  consensoMarketingMedia: boolean | string | null;
  consensoMarketingDiretto: boolean | string | null;
  dataFirma: string | Date;
  firmaPngDataUrl?: string | null;
  // Campi legacy accettati per compatibilita' (mappati internamente):
  dichiaranteLuogoNascita?: string | null;
  dichiaranteDataNascita?: string | null;
  dichiaranteCodiceFiscale?: string | null;
  dichiaranteResidenza?: string | null;
  dichiaranteEmail?: string | null;
  dichiaranteCell?: string | null;
  dichiaranteSocieta?: string | null;
  [extra: string]: unknown;
}

// ---------- costanti pagina ----------
const PAGE_W = 595;
const PAGE_H = 842;
const ML = 42;
const MR = 42;
const MT = 34;
const MB = 56;
const CW = PAGE_W - ML - MR; // 511
const COL_W = (CW - 5) / 2;
const COL_L_X = ML;
const COL_R_X = ML + COL_W + 5;

// ---------- helpers testo (ASCII only) ----------
function ascii(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2022]/g, "-")
    .replace(/[\u00A0]/g, " ")
    .replace(/[^\x20-\x7E\n]/g, "");
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paragraphs = text.split("\n");
  const out: string[] = [];
  for (const para of paragraphs) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    const words = para.split(/\s+/);
    let line = "";
    for (const w of words) {
      const candidate = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) out.push(line);
        // parola troppo lunga: spezza brutalmente
        if (font.widthOfTextAtSize(w, size) > maxWidth) {
          let chunk = "";
          for (const ch of w) {
            if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
              out.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          line = chunk;
        } else {
          line = w;
        }
      }
    }
    if (line) out.push(line);
  }
  return out;
}

type DrawOpts = {
  font?: PDFFont;
  bold?: boolean;
  color?: ReturnType<typeof rgb>;
  lineGap?: number;
};

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  maxWidth: number,
  font: PDFFont,
  boldFont: PDFFont,
  opts: { bold?: boolean; color?: ReturnType<typeof rgb>; lineGap?: number; align?: "left" | "center" } = {},
): number {
  const useFont = opts.bold ? boldFont : font;
  const color = opts.color ?? rgb(0, 0, 0);
  const lineGap = opts.lineGap ?? 2;
  const lines = wrapLines(ascii(text), useFont, size, maxWidth);
  let cy = y;
  for (const ln of lines) {
    let cx = x;
    if (opts.align === "center") {
      const w = useFont.widthOfTextAtSize(ln, size);
      cx = x + (maxWidth - w) / 2;
    }
    page.drawText(ln, { x: cx, y: cy, size, font: useFont, color });
    cy -= size + lineGap;
  }
  return y - cy; // altezza occupata
}

function drawSectionTitle(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  boldFont: PDFFont,
): number {
  return drawText(page, text, x, y, size, width, boldFont, boldFont, {
    bold: true,
    align: "center",
  });
}

// ---------- header / footer ----------
async function drawHeader(page: PDFPage, logoImg: { width: number; height: number } & any) {
  const logoW = 142;
  const logoH = 43;
  const x = (PAGE_W - logoW) / 2;
  const y = PAGE_H - MT - logoH;
  page.drawImage(logoImg, { x, y, width: logoW, height: logoH });
  page.drawLine({
    start: { x: ML, y: PAGE_H - MT - 47 },
    end: { x: PAGE_W - MR, y: PAGE_H - MT - 47 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
}

function drawFooter(
  page: PDFPage,
  pageNum: number,
  totalPages: number,
  font: PDFFont,
  bold: PDFFont,
  logoImg: any,
) {
  page.drawLine({
    start: { x: ML, y: 56 },
    end: { x: PAGE_W - MR, y: 56 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  try {
    page.drawImage(logoImg, { x: 42, y: 32, width: 57, height: 20 });
  } catch { /* noop */ }
  page.drawText("MADE DISTRIBUZIONE S.P.A.", {
    x: 104, y: 46, size: 6.5, font: bold, color: rgb(0, 0, 0),
  });
  page.drawText("Sede Amministrativa: Via G. di Vittorio 3 - 20010 CASOREZZO (MI)", {
    x: 104, y: 40, size: 6, font, color: rgb(0.35, 0.35, 0.35),
  });
  page.drawText("C.F. 10126430965 | REA Milano MI 2507310 | Capitale Sociale Euro 1.572.000 i.v.", {
    x: 104, y: 34, size: 6, font, color: rgb(0.35, 0.35, 0.35),
  });
  const rev = "REV.06 NOV-2025";
  const wRev = bold.widthOfTextAtSize(rev, 6.5);
  page.drawText(rev, { x: 553 - wRev, y: 43, size: 6.5, font: bold });
  const pag = `Pag. ${pageNum} di ${totalPages}`;
  const wPag = bold.widthOfTextAtSize(pag, 6.5);
  page.drawText(pag, { x: 553 - wPag, y: 37, size: 6.5, font: bold });
}

// ---------- contenuto informativa ----------
const INTRO_TEXT = `Made Distribuzione S.p.A. - C.F. 10126430965, con sede in Milano Corso di Porta Nuova 11 (tel. 02404702800 - email gdpr-md@madepoint.it - pec madedistribuzionesrl@pecplus.it) in persona del suo presidente e legale rappresentante pro tempore, in qualita' di Titolare del trattamento, La informa, ai sensi degli artt. 13 e 14 del Regolamento UE 2016/679 (di seguito "GDPR" o "Regolamento"), che i Suoi dati personali saranno trattati con le modalita' e per le finalita' di seguito indicate.`;

const COL_L_TEXT = `1. FONTE DEI DATI PERSONALI
I dati personali in possesso del Titolare sono raccolti direttamente presso l'interessato ovvero presso terzi (es. visure camerali, banche dati pubbliche, informazioni commerciali).

2. CATEGORIE DI DATI TRATTATI
Il Titolare tratta dati anagrafici, di contatto, fiscali, bancari, commerciali, nonche' dati relativi all'attivita' economica svolta dall'interessato e/o dalla societa' rappresentata, ivi inclusi eventuali dati relativi a procedure pregiudizievoli o pagamenti.

3. FINALITA' DEL TRATTAMENTO E BASE GIURIDICA
I dati personali saranno trattati per le seguenti finalita':
a) esecuzione di obblighi contrattuali e precontrattuali (art. 6, par. 1, lett. b GDPR);
b) adempimento di obblighi di legge, contabili e fiscali (art. 6, par. 1, lett. c GDPR);
c) gestione del credito, valutazione dell'affidabilita' e della solvibilita', recupero crediti (art. 6, par. 1, lett. f GDPR - legittimo interesse del Titolare);
d) tutela dei diritti del Titolare in sede giudiziale e stragiudiziale (art. 6, par. 1, lett. f GDPR);
e) previo consenso, finalita' di profilazione, marketing diretto e comunicazioni promozionali tramite canali tradizionali e digitali (art. 6, par. 1, lett. a GDPR).

4. NATURA DEL CONFERIMENTO
Il conferimento dei dati per le finalita' di cui ai punti a), b), c), d) e' obbligatorio: l'eventuale rifiuto comporta l'impossibilita' di instaurare o proseguire il rapporto. Il conferimento per le finalita' di cui al punto e) e' facoltativo: l'eventuale rifiuto non pregiudica il rapporto contrattuale.

5. MODALITA' DEL TRATTAMENTO
Il trattamento e' effettuato con strumenti manuali, informatici e telematici, con logiche strettamente correlate alle finalita' indicate e in modo da garantire la sicurezza e la riservatezza dei dati, nel rispetto delle misure tecniche e organizzative previste dal GDPR.

6. CONSERVAZIONE DEI DATI
I dati saranno conservati per il tempo necessario al perseguimento delle finalita' per cui sono stati raccolti e, comunque, nel rispetto degli obblighi di legge (es. 10 anni per la documentazione contabile e fiscale). Per le finalita' di marketing i dati saranno conservati fino a revoca del consenso e comunque per un periodo non superiore a 24 mesi.

7. COMUNICAZIONE E DIFFUSIONE
I dati potranno essere comunicati a soggetti terzi che svolgono attivita' funzionali al perseguimento delle finalita' indicate, quali consulenti, professionisti, istituti di credito, societa' di assicurazione del credito, societa' di recupero crediti, autorita' pubbliche, nonche' a soggetti designati come Responsabili del trattamento ex art. 28 GDPR. I dati non saranno oggetto di diffusione.

8. TRASFERIMENTO DATI EXTRA UE
Eventuali trasferimenti di dati personali verso Paesi extra UE avverranno nel rispetto delle garanzie previste dagli artt. 44 e ss. del GDPR (decisioni di adeguatezza, clausole contrattuali tipo).

9. DECISIONI AUTOMATIZZATE E PROFILAZIONE
Nell'ambito della valutazione dell'affidabilita' creditizia il Titolare puo' utilizzare strumenti di analisi automatizzata. L'interessato ha diritto di ottenere l'intervento umano, esprimere la propria opinione e contestare la decisione.`;

const COL_R_TEXT = `A. TITOLARE DEL TRATTAMENTO
Made Distribuzione S.p.A., Corso di Porta Nuova 11 - 20121 Milano, C.F./P.IVA 10126430965, email gdpr-md@madepoint.it, pec madedistribuzionesrl@pecplus.it.

B. RESPONSABILE DELLA PROTEZIONE DEI DATI (DPO)
Il Titolare non ha designato un DPO non rientrando nei casi obbligatori previsti dall'art. 37 GDPR. Le richieste degli interessati potranno essere indirizzate al Titolare ai recapiti sopra indicati.

C. CATEGORIE DI DESTINATARI
I dati potranno essere comunicati a: societa' del gruppo, consulenti fiscali e legali, istituti bancari, societa' di assicurazione del credito, societa' di factoring, societa' di recupero crediti, fornitori di servizi informatici, autorita' giudiziarie ed enti pubblici quando previsto dalla legge.

D. DIRITTI DELL'INTERESSATO
L'interessato puo' esercitare in ogni momento i diritti previsti dagli artt. 15-22 del GDPR, tra cui:
- accesso ai propri dati personali;
- rettifica dei dati inesatti o incompleti;
- cancellazione (diritto all'oblio) nei casi previsti;
- limitazione del trattamento;
- portabilita' dei dati;
- opposizione al trattamento;
- revoca del consenso prestato, senza pregiudizio della liceita' del trattamento basato sul consenso prestato prima della revoca.

E. MODALITA' DI ESERCIZIO DEI DIRITTI
Le richieste possono essere inviate via email a gdpr-md@madepoint.it o via pec a madedistribuzionesrl@pecplus.it. Il Titolare provvedera' a fornire riscontro entro i termini di legge.

F. DIRITTO DI RECLAMO
L'interessato ha diritto di proporre reclamo all'Autorita' Garante per la protezione dei dati personali (www.garanteprivacy.it).

G. AGGIORNAMENTI
La presente informativa puo' essere soggetta ad aggiornamenti. La versione vigente e' sempre disponibile presso la sede del Titolare e su richiesta dell'interessato.

10. SICUREZZA
Il Titolare adotta misure tecniche e organizzative adeguate a garantire la sicurezza dei dati, prevenire accessi non autorizzati, perdita, distruzione o divulgazione.

11. DATI DI MINORI
Il trattamento non e' rivolto a soggetti di eta' inferiore ai 16 anni. Il Titolare non raccoglie consapevolmente dati di minori.

12. CONSENSO FACOLTATIVO PER PROFILAZIONE
Previo consenso, i dati potranno essere trattati per attivita' di profilazione finalizzate ad analizzare preferenze, abitudini e scelte di consumo dell'interessato.

13. CONSENSO FACOLTATIVO PER MARKETING DIGITALE
Previo consenso, i dati potranno essere trattati per l'invio di comunicazioni promozionali tramite email, SMS, WhatsApp e altri canali digitali.

14. CONSENSO FACOLTATIVO PER MARKETING TRADIZIONALE
Previo consenso, i dati potranno essere trattati per contatto diretto tramite telefono, posta cartacea o contatto personale per finalita' di marketing.

15. REVOCA DEL CONSENSO
I consensi facoltativi possono essere revocati in qualsiasi momento scrivendo a gdpr-md@madepoint.it, senza pregiudizio della liceita' dei trattamenti effettuati prima della revoca.

16. RIFERIMENTI NORMATIVI
Regolamento UE 2016/679 (GDPR), D.Lgs. 196/2003 come modificato dal D.Lgs. 101/2018, provvedimenti del Garante per la protezione dei dati personali.`;

const CONSENSO_INTRO = `preso atto dell'informativa che precede ai sensi degli articoli 13 e 14 del GDPR, consapevole che il consenso e' facoltativo e revocabile in qualsiasi momento, in relazione alle finalita' facoltative ivi indicate dichiara quanto segue:`;

const BLOCCO_1 = `1) Trattamento dei dati personali per finalita' di profilazione, intesa come analisi delle preferenze, delle abitudini e delle scelte di consumo dell'interessato.`;
const BLOCCO_2 = `2) Trattamento dei dati personali per l'invio di comunicazioni promozionali e di marketing tramite e-mail, SMS, WhatsApp e altri canali digitali.`;
const BLOCCO_3 = `3) Trattamento dei dati personali per finalita' di marketing diretto tramite contatto telefonico, posta cartacea o contatto personale presso il punto vendita.`;

// ---------- coerenza input ----------
function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "si" || v.toLowerCase() === "sì" || v === "true";
  return false;
}

function fmtDataFirma(v: string | Date | undefined | null): string {
  if (!v) return "";
  if (v instanceof Date) {
    const d = String(v.getDate()).padStart(2, "0");
    const m = String(v.getMonth() + 1).padStart(2, "0");
    return `${d}/${m}/${v.getFullYear()}`;
  }
  return String(v);
}

function fmtLuogoData(luogo?: string | null, data?: string | null): string {
  const L = ascii(luogo || "");
  let D = "";
  if (data) {
    const dt = new Date(data);
    if (Number.isFinite(dt.getTime())) {
      const dd = String(dt.getDate()).padStart(2, "0");
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      D = `${dd}/${mm}/${dt.getFullYear()}`;
    } else {
      D = ascii(data);
    }
  }
  if (L && D) return `${L} - ${D}`;
  return L || D || "";
}

// ---------- main ----------
export async function generaSchedaCliente(input: SchedaPdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = Uint8Array.from(atob(LOGO_MADE_BASE64), (c) => c.charCodeAt(0));
  const logoImg = await pdfDoc.embedPng(logoBytes);

  // normalizza input (accetta sia nuovi nomi che legacy)
  const luogoNascita = input.luogoNascita ?? input.dichiaranteLuogoNascita ?? "";
  const dataNascita = input.dataNascita ?? input.dichiaranteDataNascita ?? "";
  const codiceFiscaleDich = input.codiceFiscaleDich ?? input.dichiaranteCodiceFiscale ?? "";
  const residenza = input.residenza ?? input.dichiaranteResidenza ?? "";
  const emailDich = input.emailDich ?? input.dichiaranteEmail ?? "";
  const cellulareDich = input.cellulareDich ?? input.dichiaranteCell ?? "";
  const societa = input.dichiaranteSocieta ?? input.ragioneSociale;

  const cProf = toBool(input.consensoProfilazione);
  const cMedia = toBool(input.consensoMarketingMedia);
  const cDir = toBool(input.consensoMarketingDiretto);

  const dataFirma = fmtDataFirma(input.dataFirma);

  // =================== PAGINA 1 ===================
  const p1 = pdfDoc.addPage([PAGE_W, PAGE_H]);
  await drawHeader(p1, logoImg);

  let y = PAGE_H - MT - 47 - 14;

  const titolo = "INFORMATIVA RESA AI SENSI DEGLI ARTT. 13-14 DEL GDPR (GENERAL DATA PROTECTION REGULATION) 2016/679";
  const titH = drawSectionTitle(p1, titolo, ML, y, CW, 11, bold);
  y -= titH + 6;

  // Intro full width
  const introH = drawText(p1, INTRO_TEXT, ML, y, 8, CW, font, bold, { lineGap: 1.5 });
  y -= introH + 8;

  // Linea verticale separatrice tra colonne
  const colsTop = y;
  const colsBottom = MB + 6;
  const vx = ML + COL_W + 2.5;
  p1.drawLine({
    start: { x: vx, y: colsTop },
    end: { x: vx, y: colsBottom },
    thickness: 0.3,
    color: rgb(0.75, 0.75, 0.75),
  });

  // Colonna sinistra
  drawText(p1, COL_L_TEXT, COL_L_X, y, 7, COL_W, font, bold, { lineGap: 1.4 });
  // Colonna destra
  drawText(p1, COL_R_TEXT, COL_R_X, y, 7, COL_W, font, bold, { lineGap: 1.4 });

  // =================== PAGINA 2 ===================
  const p2 = pdfDoc.addPage([PAGE_W, PAGE_H]);
  await drawHeader(p2, logoImg);

  let y2 = PAGE_H - MT - 47 - 16;

  const titH2 = drawSectionTitle(p2, "FORMULAZIONE DEL CONSENSO", ML, y2, CW, 10, bold);
  y2 -= titH2 + 8;

  const introH2 = drawText(p2, "Il sottoscritto,", ML, y2, 8, CW, font, bold);
  y2 -= introH2 + 4;

  // Tabella dati dichiarante
  const labelW = 108;
  const valueW = CW - labelW;
  const rowH = 22;
  const rows: Array<[string, string]> = [
    ["Nome", ascii(input.dichiaranteNome)],
    ["Cognome", ascii(input.dichiaranteCognome)],
    ["Societa'", ascii(societa)],
    ["Luogo e data di nascita", fmtLuogoData(luogoNascita, dataNascita)],
    ["Codice fiscale", ascii(codiceFiscaleDich)],
    ["P.IVA", ascii(input.partitaIva)],
    ["Residenza", ascii(residenza)],
    ["Email", ascii(emailDich)],
    ["Cell.", ascii(cellulareDich)],
  ];

  for (const [label, value] of rows) {
    const topY = y2;
    const bottomY = y2 - rowH;
    // label cell
    p2.drawRectangle({
      x: ML, y: bottomY, width: labelW, height: rowH,
      color: rgb(0.96, 0.96, 0.96),
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 0.4,
    });
    // value cell
    p2.drawRectangle({
      x: ML + labelW, y: bottomY, width: valueW, height: rowH,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 0.4,
    });
    // label centrato
    const lblW = bold.widthOfTextAtSize(label, 8);
    p2.drawText(label, {
      x: ML + (labelW - lblW) / 2,
      y: bottomY + rowH / 2 - 3,
      size: 8,
      font: bold,
    });
    // value left aligned, troncato
    let val = value || "";
    while (val && font.widthOfTextAtSize(val, 8) > valueW - 8) val = val.slice(0, -1);
    if (val !== (value || "") && val.length > 1) val = val.slice(0, -1) + "...";
    p2.drawText(val, {
      x: ML + labelW + 5,
      y: bottomY + rowH / 2 - 3,
      size: 8,
      font,
    });
    y2 = bottomY;
  }

  y2 -= 10;

  // Intro consenso
  const intCH = drawText(p2, CONSENSO_INTRO, ML, y2, 8, CW, font, bold, { lineGap: 1.5 });
  y2 -= intCH + 6;

  // Helper blocco consenso
  function drawConsentBlock(text: string, value: boolean) {
    const h = drawText(p2, text, ML, y2, 8, CW, font, bold, { lineGap: 1.5 });
    y2 -= h + 3;
    // riga "[X] fornisce il consenso"  centrata
    const fornisce = `${value ? "[X]" : "[ ]"} fornisce il consenso`;
    const nega = `${!value ? "[X]" : "[ ]"} nega il consenso`;
    const wF = bold.widthOfTextAtSize(fornisce, 8);
    p2.drawText(fornisce, { x: ML + (CW - wF) / 2, y: y2, size: 8, font: bold });
    y2 -= 11;
    const wN = bold.widthOfTextAtSize(nega, 8);
    p2.drawText(nega, { x: ML + (CW - wN) / 2, y: y2, size: 8, font: bold });
    y2 -= 12;
  }

  drawConsentBlock(BLOCCO_1, cProf);

  const inH1 = drawText(p2, "Inoltre,", ML, y2, 8, CW, font, bold);
  y2 -= inH1 + 4;

  drawConsentBlock(BLOCCO_2, cMedia);

  const inH2 = drawText(p2, "Inoltre,", ML, y2, 8, CW, font, bold);
  y2 -= inH2 + 4;

  drawConsentBlock(BLOCCO_3, cDir);

  y2 -= 16;

  // Riga firma
  p2.drawText(`Li ${dataFirma}    _______________`, {
    x: ML, y: y2, size: 9, font,
  });

  if (input.firmaPngDataUrl) {
    try {
      const base64 = input.firmaPngDataUrl.includes(",")
        ? input.firmaPngDataUrl.split(",")[1]
        : input.firmaPngDataUrl;
      const sigBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const sigImg = await pdfDoc.embedPng(sigBytes);
      const sigW = 150;
      const sigH = (sigImg.height / sigImg.width) * sigW;
      p2.drawImage(sigImg, {
        x: 350,
        y: y2 - 5,
        width: sigW,
        height: Math.min(sigH, 50),
      });
    } catch { /* firma opzionale */ }
  } else {
    p2.drawLine({
      start: { x: 350, y: y2 - 2 },
      end: { x: 500, y: y2 - 2 },
      thickness: 0.5,
      color: rgb(0.5, 0.5, 0.5),
    });
  }
  // "Firma" centrato sotto a x=425
  const firmaLbl = "Firma";
  const wFL = font.widthOfTextAtSize(firmaLbl, 8);
  p2.drawText(firmaLbl, { x: 425 - wFL / 2, y: y2 - 18, size: 8, font });

  // ---------- footer su tutte le pagine ----------
  const pages = pdfDoc.getPages();
  pages.forEach((p, i) => drawFooter(p, i + 1, pages.length, font, bold, logoImg));

  return pdfDoc.save();
}
