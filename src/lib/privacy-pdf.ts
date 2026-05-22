import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type PrivacyPdfInput = {
  ragioneSociale: string;
  partitaIva?: string | null;
  codiceFiscale?: string | null;
  indirizzo?: string | null;
  citta?: string | null;
  email?: string | null;
  firmaPngDataUrl: string;
  dataFirma: Date;
};

export async function generaPdfPrivacy(input: PrivacyPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = height - margin;

  page.drawText("INFORMATIVA E CONSENSO PRIVACY", {
    x: margin,
    y,
    size: 16,
    font: fontBold,
    color: rgb(0.05, 0.05, 0.2),
  });
  y -= 30;

  page.drawText("Regolamento UE 2016/679 (GDPR) - Art. 13", {
    x: margin,
    y,
    size: 10,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 30;

  // Dati cliente
  page.drawText("Dati del soggetto interessato:", {
    x: margin,
    y,
    size: 11,
    font: fontBold,
  });
  y -= 18;

  const fallback = (v: string | null | undefined) => {
    const s = v == null ? "" : String(v).trim();
    return s.length > 0 ? s : "—";
  };
  const indirizzoCompleto = [input.indirizzo, input.citta]
    .map((x) => (x == null ? "" : String(x).trim()))
    .filter((s) => s.length > 0)
    .join(", ");

  const rows: Array<[string, string]> = [
    ["Ragione sociale", fallback(input.ragioneSociale)],
    ["Partita IVA", fallback(input.partitaIva)],
    ["Codice Fiscale", fallback(input.codiceFiscale)],
    ["Indirizzo", indirizzoCompleto.length > 0 ? indirizzoCompleto : "—"],
    ["Email", fallback(input.email)],
  ];

  for (const [k, v] of rows) {
    page.drawText(`${k}:`, { x: margin, y, size: 10, font: fontBold });
    page.drawText(v, { x: margin + 110, y, size: 10, font });
    y -= 15;
  }

  y -= 15;
  page.drawText("Informativa", { x: margin, y, size: 11, font: fontBold });
  y -= 15;

  const testo = [
    "Il Titolare del trattamento tratterà i dati personali forniti per le finalità",
    "di gestione della richiesta di apertura fido commerciale, valutazione del",
    "merito creditizio, comunicazione con il cliente e adempimento di obblighi",
    "di legge. I dati saranno conservati per il tempo necessario alle finalità",
    "indicate e potranno essere comunicati a soggetti terzi (banche, assicurazioni",
    "del credito, consulenti) per le sole finalità sopra descritte.",
    "",
    "L'interessato ha diritto di accesso, rettifica, cancellazione, limitazione",
    "e opposizione al trattamento, oltre al diritto di proporre reclamo al Garante",
    "per la protezione dei dati personali.",
  ];
  for (const line of testo) {
    page.drawText(line, { x: margin, y, size: 9, font, color: rgb(0.15, 0.15, 0.15) });
    y -= 13;
  }

  y -= 20;
  page.drawText("Consenso", { x: margin, y, size: 11, font: fontBold });
  y -= 15;
  page.drawText(
    "Il sottoscritto, letta l'informativa sopra riportata, presta il consenso al",
    { x: margin, y, size: 9, font },
  );
  y -= 12;
  page.drawText(
    "trattamento dei propri dati personali per le finalità indicate.",
    { x: margin, y, size: 9, font },
  );

  // Firma
  y -= 50;
  page.drawText("Firma:", { x: margin, y, size: 10, font: fontBold });

  const pngBytes = await fetch(input.firmaPngDataUrl).then((r) => r.arrayBuffer());
  const pngImage = await pdf.embedPng(pngBytes);
  const sigDims = pngImage.scale(0.35);
  page.drawImage(pngImage, {
    x: margin + 60,
    y: y - sigDims.height + 8,
    width: Math.min(sigDims.width, 280),
    height: Math.min(sigDims.height, 70),
  });

  // Linea firma
  page.drawLine({
    start: { x: margin + 60, y: y - 50 },
    end: { x: margin + 60 + 280, y: y - 50 },
    thickness: 0.5,
    color: rgb(0.5, 0.5, 0.5),
  });

  y -= 70;
  page.drawText(
    `Data: ${input.dataFirma.toLocaleString("it-IT")}`,
    { x: margin, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) },
  );

  // Footer
  page.drawText(
    `Documento generato elettronicamente — ${input.ragioneSociale}`,
    {
      x: margin,
      y: 30,
      size: 7,
      font,
      color: rgb(0.6, 0.6, 0.6),
    },
  );

  return pdf.save();
}
