import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

export type SchedaPdfInput = {
  tipo: "nuovo" | "aggiornamento";
  tipoSoggetto?: "persona_fisica" | "azienda" | null;
  ragioneSociale: string;
  indirizzo?: string | null;
  cap?: string | null;
  citta?: string | null;
  provincia?: string | null;
  telefono?: string | null;
  email?: string | null;
  partitaIva?: string | null;
  codiceFiscale?: string | null;
  banca?: string | null;
  agenzia?: string | null;
  abi?: string | null;
  cab?: string | null;
  codiceSdi?: string | null;
  pec?: string | null;
  codiceGestionale?: string | null;
  // Contatti
  titolareNome?: string | null;
  titolareEmail?: string | null;
  titolareCell?: string | null;
  amministrativoNome?: string | null;
  amministrativoEmail?: string | null;
  amministrativoCell?: string | null;
  // Dichiarante
  dichiaranteNome: string;
  dichiaranteCognome: string;
  firmaPngDataUrl: string;
  dataFirma: Date;
};

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

export async function generaSchedaCliente(input: SchedaPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 30) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  // Header
  page.drawText("SCHEDA INSERIMENTO CLIENTE", {
    x: MARGIN, y, size: 16, font: bold, color: rgb(0.05, 0.05, 0.2),
  });
  y -= 18;
  page.drawText(
    input.tipo === "nuovo" ? "☒ NUOVO INSERIMENTO    ☐ AGGIORNAMENTO" : "☐ NUOVO INSERIMENTO    ☒ AGGIORNAMENTO",
    { x: MARGIN, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) },
  );
  y -= 22;

  // Sezione DATI IMPRESA
  sectionTitle(page, "DATI IMPRESA", y, bold);
  y -= 18;

  const soggetto = input.tipoSoggetto === "persona_fisica"
    ? "☒ Persona fisica    ☐ Azienda"
    : input.tipoSoggetto === "azienda"
    ? "☐ Persona fisica    ☒ Azienda"
    : "☐ Persona fisica    ☐ Azienda";
  page.drawText(soggetto, { x: MARGIN + 4, y, size: 10, font });
  y -= 16;

  y = drawRow(page, y, font, bold, [["Ragione sociale / Nominativo", input.ragioneSociale]]);
  y = drawRow(page, y, font, bold, [["Indirizzo", v(input.indirizzo)]]);
  y = drawRow(page, y, font, bold, [
    ["CAP", v(input.cap), 80],
    ["Città", v(input.citta), 230],
    ["Prov.", v(input.provincia), 60],
  ]);
  y = drawRow(page, y, font, bold, [
    ["Telefono", v(input.telefono), 230],
    ["E-mail", v(input.email), 230],
  ]);
  y = drawRow(page, y, font, bold, [["P.IVA", v(input.partitaIva)]]);
  y = drawRow(page, y, font, bold, [["Codice Fiscale", v(input.codiceFiscale)]]);
  y = drawRow(page, y, font, bold, [
    ["Banca", v(input.banca), 280],
    ["ABI", v(input.abi), 180],
  ]);
  y = drawRow(page, y, font, bold, [
    ["Agenzia", v(input.agenzia), 280],
    ["CAB", v(input.cab), 180],
  ]);
  y -= 4;
  page.drawText("(Per Fatturazione Elettronica)", {
    x: MARGIN + 4, y, size: 8, font, color: rgb(0.4, 0.4, 0.4),
  });
  y -= 12;
  y = drawRow(page, y, font, bold, [
    ["COD SDI", v(input.codiceSdi), 200],
    ["PEC", v(input.pec), 260],
  ]);

  y -= 10;
  ensureSpace(200);

  // DATI CONTATTI
  sectionTitle(page, "DATI CONTATTI", y, bold);
  y -= 18;

  page.drawText("Titolare / Legale Rappresentante", { x: MARGIN + 4, y, size: 10, font: bold });
  y -= 14;
  y = drawRow(page, y, font, bold, [["Nominativo", v(input.titolareNome)]]);
  y = drawRow(page, y, font, bold, [
    ["E-mail", v(input.titolareEmail), 280],
    ["Cell.", v(input.titolareCell), 180],
  ]);
  y -= 6;
  page.drawText("Referente Amministrativo (se diverso da Titolare)", {
    x: MARGIN + 4, y, size: 10, font: bold,
  });
  y -= 14;
  y = drawRow(page, y, font, bold, [["Nominativo", v(input.amministrativoNome)]]);
  y = drawRow(page, y, font, bold, [
    ["E-mail", v(input.amministrativoEmail), 280],
    ["Cell.", v(input.amministrativoCell), 180],
  ]);

  y -= 10;
  ensureSpace(220);

  // DATI PERSONA DICHIARANTE
  sectionTitle(page, "DATI PERSONA DICHIARANTE", y, bold);
  y -= 18;
  y = drawRow(page, y, font, bold, [
    ["Nome", input.dichiaranteNome, 230],
    ["Cognome", input.dichiaranteCognome, 230],
  ]);

  y -= 6;
  const informativa = [
    "In relazione al nuovo Regolamento UE 679/2016, ed ai sensi del decreto legislativo 196 del",
    "30/06/2003 vi comunichiamo che nei nostri archivi cartacei e/o informatici sono contenuti i",
    "vostri dati personali. I dati verranno trattati per le finalità relative alla gestione del rapporto",
    "in essere, non verranno comunicati ad altri soggetti e potranno essere utilizzati per l'invio",
    "della corrispondenza. L'interessato potrà chiedere in ogni momento la modifica o la",
    "cancellazione in relazione all'art. 14-15-16-17 del Reg. UE 679/2016.",
  ];
  for (const l of informativa) {
    page.drawText(l, { x: MARGIN + 4, y, size: 8.5, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 11;
  }

  y -= 14;
  ensureSpace(110);

  // Firma + data
  page.drawText("Data", { x: MARGIN + 4, y, size: 10, font: bold });
  page.drawText(input.dataFirma.toLocaleDateString("it-IT"), {
    x: MARGIN + 40, y, size: 10, font,
  });
  page.drawText("Il Dichiarante", { x: MARGIN + 250, y, size: 10, font: bold });
  y -= 8;

  // Firma image
  const pngBytes = await fetch(input.firmaPngDataUrl).then((r) => r.arrayBuffer());
  const png = await pdf.embedPng(pngBytes);
  const sigW = 250;
  const sigH = 70;
  page.drawImage(png, {
    x: MARGIN + 240,
    y: y - sigH,
    width: sigW,
    height: sigH,
  });
  page.drawLine({
    start: { x: MARGIN + 240, y: y - sigH - 2 },
    end: { x: MARGIN + 240 + sigW, y: y - sigH - 2 },
    thickness: 0.5,
    color: rgb(0.5, 0.5, 0.5),
  });
  y -= sigH + 16;

  if (input.codiceGestionale) {
    page.drawText(`Codice gestionale: ${input.codiceGestionale}`, {
      x: MARGIN + 4, y, size: 9, font, color: rgb(0.3, 0.3, 0.3),
    });
    y -= 14;
  }

  // Footer su tutte le pagine
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(
      `SchCli_Digital — ${input.ragioneSociale} — pag. ${i + 1}/${pages.length}`,
      { x: MARGIN, y: 24, size: 7, font, color: rgb(0.55, 0.55, 0.55) },
    );
    p.drawText(
      `Generato il ${input.dataFirma.toLocaleString("it-IT")}`,
      { x: PAGE_W - MARGIN - 160, y: 24, size: 7, font, color: rgb(0.55, 0.55, 0.55) },
    );
  });

  return pdf.save();
}

function v(s?: string | null) {
  return s && s.trim() ? s : "—";
}

function sectionTitle(page: PDFPage, label: string, y: number, bold: PDFFont) {
  page.drawRectangle({
    x: MARGIN, y: y - 4, width: CONTENT_W, height: 18,
    color: rgb(0.92, 0.94, 0.98),
  });
  page.drawText(label, { x: MARGIN + 6, y: y + 2, size: 11, font: bold, color: rgb(0.05, 0.05, 0.25) });
}

function drawRow(
  page: PDFPage,
  y: number,
  font: PDFFont,
  bold: PDFFont,
  cells: Array<[string, string, number?]>,
): number {
  const rowH = 22;
  let x = MARGIN;
  const totalFixed = cells.reduce((s, c) => s + (c[2] ?? 0), 0);
  const flexCount = cells.filter((c) => !c[2]).length;
  const flexW = flexCount > 0 ? (CONTENT_W - totalFixed) / flexCount : 0;

  for (const [label, value, w] of cells) {
    const cellW = w ?? flexW;
    page.drawRectangle({
      x, y: y - rowH + 4, width: cellW, height: rowH,
      borderColor: rgb(0.75, 0.75, 0.8),
      borderWidth: 0.5,
    });
    page.drawText(label, { x: x + 4, y: y - 4, size: 7.5, font: bold, color: rgb(0.4, 0.4, 0.45) });
    page.drawText(truncate(value, cellW - 8, font, 9.5), {
      x: x + 4, y: y - 16, size: 9.5, font,
    });
    x += cellW;
  }
  return y - rowH - 2;
}

function truncate(text: string, maxWidth: number, font: PDFFont, size: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "…";
}
