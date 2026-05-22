import { PDFDocument, StandardFonts, rgb, PDFPage } from "pdf-lib";
import { LOGO_MADE_BASE64 } from "./logo-made-base64";

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
const ML = 42;
const MR = 42;
const MT = 34;
const MB = 56;
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
  ): number {
    const lines = wrapText(text, maxW, size, f);
    const lineH = size * 1.4;
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
  const titleH = drawWrapped(page1, titleText, ML, y, CW, 10, bold, NAVY);
  y -= titleH + 8;

  const introText =
    "Made Distribuzione S.p.A. - C.F. 10126430965, con sede in Milano Corso di Porta Nuova 11 (tel. 02404702800 - email gdpr-md@madepoint.it pec madedistribuzionesrl@pecplus.it) in persona del suo presidente Dott. Gian Luca Bellini, ai sensi dell'articolo 13 del GDPR 2016/679, Le fornisce le seguenti informazioni:";
  const introH = drawWrapped(page1, introText, ML, y, CW, 8, font);
  y -= introH + 10;

  const half = (CW - 14) / 2;
  const colXL = ML;
  const colXR = ML + half + 14;
  const colY = y;
  page1.drawLine({
    start: { x: ML + half + 7, y: colY },
    end: { x: ML + half + 7, y: minY },
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
      const h = drawWrapped(page, item.text, ix, cy, iw, 8, f);
      cy -= h + 3;
      if (cy < stopY) break;
    }
    return cy;
  }

  const colLItems = [
    { text: "TIPI DI DATI", isBold: true },
    {
      text: "1. Dati personali - I dati personali (nome, cognome, estremi documento di riconoscimento e copia dello stesso, telefono, indirizzo e-mail, etc.), sono quelli che saranno forniti al momento della sottoscrizione o comunque prima dell'avvio del rapporto contrattuale ovvero nel corso dello stesso.",
    },
    {
      text: "2. Particolari categorie di dati (dati sensibili) - Tra i dati conferiti possono figurare anche i dati di cui all'art. 9 GDPR, ossia i dati personali che rivelino l'origine razziale o etnica, l'appartenenza sindacale, dati relativi alla salute della persona.",
    },
    { text: "TIPI E FINALITA' DI TRATTAMENTO", isBold: true },
    {
      text: "3. Trattamenti derivanti da obblighi contrattuali (trattamenti che prescindono da consenso) - I dati personali comuni e/o sensibili e/o giudiziari saranno oggetto, anche senza il Vostro consenso ai sensi dell'art. 6, lettere b) e f) GDPR:",
    },
    {
      text: "i. di trattamento relativo alle funzioni connesse all'esercizio delle proprie attivita' aziendali (fornitura di prodotti, materiali, opere e servizi nei campi edile, elettrotecnico e idraulico);",
      indent: 12,
    },
    {
      text: "ii. di trattamento relativo all'esame e all'archiviazione dell'anagrafica cliente e del curriculum vitae;",
      indent: 12,
    },
    {
      text: "iii. di trattamento connesso alla fase precontrattuale e agli adempimenti del rapporto contrattuale: produzione in ambito giudiziale, registrazione fatture, elaborazione certificazioni, stipula di coperture assicurative, comunicazione a commercialisti, avvocati, banche e compagnie assicurative;",
      indent: 12,
    },
    {
      text: "4. Trattamenti derivanti da obblighi di legge (trattamenti che prescindono da consenso) - I dati saranno oggetto ai sensi dell'art. 6, lettera c) GDPR:",
    },
    { text: "iv. di trattamento connesso a finalita' fiscale/tributaria/contributiva;", indent: 12 },
    { text: "v. di trattamento connesso alla comunicazione a Enti pubblici o privati prevista per legge;", indent: 12 },
    { text: "vi. di trattamento connesso agli obblighi di legge in tema di tutela della vita e della salute;", indent: 12 },
    {
      text: "vii. di trasferimento a terzi per finalita' di backup su server esterni anche fuori UE con cifratura.",
      indent: 12,
    },
    { text: "5. Trattamenti a prescindere da obblighi contrattuali o di legge - I dati personali saranno oggetto:" },
    {
      text: "viii. di trattamento costituito dalla conservazione e analisi con strumenti tecnologici automatizzati (profilazione) per gestire un consolidato nazionale in tempo reale e indirizzare le strategie commerciali del network;",
      indent: 12,
    },
    {
      text: "ix. di inserimento di dati, fotografie, articoli e riprese audiovisive nel sito internet, social network, pubblicazioni, brochure, cataloghi per fini didattici, pubblicitari e di marketing;",
      indent: 12,
    },
    {
      text: "x. di invio di informative per finalita' pubblicitarie e di marketing anche via e-mail, sms, whatsapp.",
      indent: 12,
    },
    {
      text: "6. Definizione di trattamento - Il trattamento di dati personali e' definito dall'art. 4 GDPR come qualsiasi operazione compiuta con o senza l'ausilio di processi automatizzati applicata a dati personali.",
    },
    {
      text: "7. Trattamento di particolari categorie di dati (dati sensibili) - I dati particolari ex art. 9 GDPR non rientrano normalmente nel trattamento sopra descritto e verranno trattati solo in presenza di Vostro consenso.",
    },
    {
      text: "8. Trattamento di dati giudiziari - I dati giudiziari verranno trattati solo se necessario e su consenso dell'interessato.",
    },
    { text: "CATEGORIE DI SOGGETTI AI QUALI I DATI POSSONO ESSERE COMUNICATI", isBold: true },
    {
      text: "9. I dati personali forniti potranno essere oggetto di comunicazione a tutti i dipendenti e collaboratori coinvolti, nonche' agli Enti esterni destinatari delle pratiche che riguardano il cliente/fornitore, e ai soggetti esterni che interagiscono con il titolare, sempre ed esclusivamente per attivita' funzionali alle finalita' sopra descritte; tali categorie sono:",
    },
  ];

  const colRItems = [
    {
      text: "A. Societa' operanti nel campo E.D.P., anche residenti all'estero, per la cura dell'information management del titolare, della sicurezza e della riservatezza dei dati;",
    },
    {
      text: "B. Commercialisti, societa' di servizi nel campo della consulenza del lavoro e nell'elaborazione di sistemi di paghe e stipendi, nonche' Studi Legali per eventuali controversie;",
    },
    {
      text: "C. Clienti e Fornitori per lo svolgimento delle attivita' commerciali, di servizio e amministrative del titolare;",
    },
    {
      text: "D. Distributori, agenti, vettori, corrieri, trasportatori e comunque ogni altra Societa' utilizzata nell'ambito dei servizi offerti dal titolare;",
    },
    { text: "E. Societa' del Gruppo Made;" },
    {
      text: "F. Societa' o soggetti che svolgono attivita' commerciale di vendita e/o fornitura di beni e/o servizi, di pubblicita', nell'ambito dell'attivita' commerciale promozionale e di marketing;",
    },
    {
      text: "G. soggetti terzi con cui sia necessario o anche solo opportuno collaborare nell'ambito dell'organizzazione dell'attivita' aziendale.",
    },
    { text: "MODALITA' DI TRATTAMENTO", isBold: true },
    {
      text: "10. Principi - Il trattamento dei dati personali sara' improntato ai principi di correttezza, licceita', trasparenza e di tutela della Sua riservatezza e dei Suoi diritti.",
    },
    {
      text: "11. Strumenti - Il trattamento dei dati sara' effettuato sia con strumenti manuali e/o informatici e/o telematici con logiche di organizzazione ed elaborazione strettamente correlate alle finalita' stesse.",
    },
    {
      text: "12. Cessione dei dati all'estero - E' possibile la cessione dei dati all'estero e al di fuori dell'Unione Europea per finalita' di backup dati, per l'utilizzo di software che utilizzano server all'estero (Microsoft 365) e nel caso di servizi resi all'estero.",
    },
    { text: "TERMINE DI CONSERVAZIONE DEI DATI", isBold: true },
    {
      text: "13. I dati personali vengono conservati per tutta la durata del rapporto contrattuale e, nel caso di cessazione del rapporto, nei termini prescrizionali normativamente previsti. In ogni caso per non meno di 10 anni in ragione degli obblighi di conservazione a fini fiscali.",
    },
    { text: "CONSENSO DELL'INTERESSATO", isBold: true },
    {
      text: "14. Il conferimento dei dati personali al trattamento finora spiegato ha natura obbligatoria ai sensi delle leggi e dei contratti che regolamentano il rapporto contrattuale.",
    },
    { text: "15. Si informa in particolare che:" },
    {
      text: "a) e' obbligatorio fornire i dati per le finalita' di cui al punto 3 e 4. Il mancato consenso comporta l'impossibilita' di assolvere gli obblighi di legge e quindi di costituire o proseguire il rapporto contrattuale;",
      indent: 12,
    },
    { text: "b) e' facoltativo fornire i dati per il trattamento di cui al punto 5;", indent: 12 },
    { text: "c) e' facoltativo fornire i dati giudiziari.", indent: 12 },
    { text: "DIRITTI DELL'INTERESSATO", isBold: true },
    { text: "16. Ella potra', in qualsiasi momento, esercitare i diritti:" },
    { text: "a. di accesso ai dati personali ai sensi dell'art. 15 GDPR;", indent: 12 },
    {
      text: "b. di ottenere la rettifica (art. 16 GDPR), la cancellazione (art. 17 GDPR) o la limitazione del trattamento (art. 18 GDPR);",
      indent: 12,
    },
    { text: "c. di opporsi al trattamento ai sensi dell'art. 21 GDPR;", indent: 12 },
    { text: "d. alla portabilita' dei dati ai sensi dell'art. 20 GDPR;", indent: 12 },
    { text: "e. di revocare il consenso (art. 7 co. 3 GDPR);", indent: 12 },
    { text: "f. di proporre reclamo all'autorita' di controllo (Garante Privacy).", indent: 12 },
    {
      text: "L'esercizio dei suoi diritti potra' avvenire attraverso l'invio di una richiesta mediante e-mail all'indirizzo gdpr-md@madepoint.it.",
    },
    {
      text: "La revoca del consenso, la richiesta di cancellazione, l'opposizione e la richiesta di portabilita' dei dati comportera' l'impossibilita' di adempiere alle obbligazioni inerenti al rapporto e dunque rendera' impossibile la sua prosecuzione.",
    },
    { text: "DATI DEL TITOLARE E CONTATTI", isBold: true },
    {
      text: "Il Titolare del trattamento dati e' Made Distribuzione S.p.A. - c.f. 10126430965, con sede in Milano Corso di Porta Nuova 11 (tel. 02404702800 - email: gdpr-md@madepoint.it - pec: madedistribuzionesrl@pecplus.it). La persona a cui e' possibile rivolgersi per esercitare i diritti e' raggiungibile all'indirizzo e-mail: gdpr-md@madepoint.it.",
    },
  ];

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
  page2.drawText("Inoltre,", { x: ML, y: y2, size: 8, font, color: BLACK });
  y2 -= 12;

  y2 = drawConsentBlock(
    page2,
    y2,
    "al trattamento, ivi compresa la comunicazione ai soggetti di cui al punto 9 e la cessione al di fuori dell'Unione Europea, dei dati personali, ivi compresi quelli sensibili di cui all'art. 9 GDPR e le immagini dell'interessato per le finalita' di inserimento di dati, fotografie, articoli e riprese audiovisive nel proprio sito internet e nelle proprie pubblicazioni, social network, per la pubblicazione di fotografie e/o riprese audiovisive, corsi on line, pubblicazioni, brochure, presentazioni, cataloghi per fini didattici, pubblicitari e di marketing",
    toBool(input.consensoMarketingMedia),
  );
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

  if (input.firmaPngDataUrl) {
    try {
      const pngBytes = Uint8Array.from(atob(input.firmaPngDataUrl.split(",")[1]), (c) => c.charCodeAt(0));
      const firmaImg = await pdfDoc.embedPng(pngBytes);
      const firmaDims = firmaImg.scale(1);
      const firmaImgW = 113;
      const firmaImgH = Math.min((firmaImgW * firmaDims.height) / firmaDims.width, 34);
      page2.drawImage(firmaImg, { x: firmaX + 14, y: firmaY + 4, width: firmaImgW, height: firmaImgH });
    } catch (e) {
      console.warn("Firma PNG non incorporata:", e);
    }
  }

  return pdfDoc.save();
}
