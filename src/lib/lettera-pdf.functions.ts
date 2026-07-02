// Generazione PDF lettera lato server (TanStack serverFn, runtime Cloudflare Workers).
// Libreria: pdf-lib (pure JS, compatibile Workers, gia in dipendenze).
// FASE 2a: carta intestata basilare (logo + sede + destinatario + corpo + firma + footer legale).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  formatDateIt,
  formatEuro,
  SEDE_FALLBACK,
  type DatiSede,
  type ScadenzaSollecito,
} from "@/lib/template-email-render";
import { classificaScadenza } from "@/lib/scadenze";
import { buildElencoScadenzeTesto, renderLettera, type DatiTemplateLettera } from "@/lib/template-lettera";
import { LOGO_MADE_BASE64 } from "@/lib/logo-made-base64";

const LEGAL_FOOTER_LINES = [
  "MADE DISTRIBUZIONE S.p.A.",
  "Sede Legale: Corso di Porta Nuova 11, 20121 Milano (MI) - C.F. e P.IVA 10126430965 - REA Milano MI 2507310",
  "PEC: madedistribuzionesrl@pecplus.it - Capitale Sociale 2.593.000,00 \u20AC i.v.",
  "Societ\u00E0 sotto la Direzione e il Coordinamento di MADE Italia S.p.A.",
];

// "CASOREZZO" -> "Casorezzo"; "SEDE DI MILANO" -> "Sede di Milano"
function titleCaseSede(raw: string): string {
  const minuscole = new Set(["di", "da", "de", "del", "della", "dei", "delle", "degli", "e", "a", "in", "al", "alla"]);
  return raw
    .toLowerCase()
    .split(/(\s+)/)
    .map((tok, i) => {
      if (/^\s+$/.test(tok)) return tok;
      if (i > 0 && minuscole.has(tok)) return tok;
      return tok.charAt(0).toUpperCase() + tok.slice(1);
    })
    .join("");
}

// Decodifica base64 (no Buffer su Workers)
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Normalizza insegna sede: title-case ma preserva "MADE" e acronimi corti (<=3 lettere)
function formatInsegna(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .split("|")
    .map((part) =>
      part
        .trim()
        .split(/\s+/)
        .map((w) => {
          if (w.toUpperCase() === "MADE") return "MADE";
          if (w.length <= 3 && /^[A-Z]+$/.test(w)) return w.toUpperCase();
          return w
            .split("-")
            .map((seg) => (seg ? seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase() : seg))
            .join("-");
        })
        .join(" "),
    )
    .join(" | ");
}

// Rimuove dal corpo i blocchi che il PDF disegna gia da se (destinatario in alto,
// luogo+data, riga "Oggetto:", saluti+firma+ragione sociale azienda) per evitare doppioni
// quando il corpo proviene da un template che li include o da un'anteprima residua.
function stripLetterChrome(
  corpo: string,
  dati: { cliente: { ragione_sociale: string; indirizzo: string | null; cap: string | null; citta: string | null; provincia: string | null } },
): string {
  const raw = (corpo ?? "").replace(/\r\n/g, "\n");
  const lines = raw.split("\n");

  const rag = (dati.cliente.ragione_sociale ?? "").trim().toUpperCase();
  const indir = (dati.cliente.indirizzo ?? "").trim().toLowerCase();
  const cap = (dati.cliente.cap ?? "").trim();
  const citta = (dati.cliente.citta ?? "").trim().toLowerCase();

  const headerLike = (t: string): boolean => {
    if (!t) return true; // blank
    if (/^spett\.?\s*le?\b/i.test(t)) return true;
    if (/^oggetto\s*:/i.test(t)) return true;
    // riga "Citta, gg/mm/aaaa" (luogo_data)
    if (/^[A-Za-z\u00C0-\u017F'\-\s]{2,40},\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\s*$/.test(t)) return true;
    // riga CAP + citta
    if (/^\d{5}\b/.test(t)) return true;
    if (rag && t.toUpperCase().includes(rag)) return true;
    if (indir && indir.length > 3 && t.toLowerCase().includes(indir)) return true;
    if (citta && citta.length > 2 && t.toLowerCase().includes(citta) && t.length < 80) return true;
    return false;
  };

  // Strip leading chrome
  let start = 0;
  let removedLead = 0;
  while (start < lines.length) {
    const t = lines[start].trim();
    if (headerLike(t)) { start++; if (t !== "") removedLead++; continue; }
    break;
  }
  // Strip leading blank lines after removal
  while (start < lines.length && lines[start].trim() === "") start++;
  // Solo se abbiamo riconosciuto almeno un marcatore (Spett./Oggetto/data)
  const head = removedLead >= 1 ? lines.slice(start) : lines.slice();

  // Strip tail firma: dal primo "<...> saluti" (cordiali/distinti/...) in poi
  // togli TUTTO fino alla fine del corpo. Cosi spariscono anche "GARAVAGLIA | MADE",
  // "Andrea Giani", "MADE DISTRIBUZIONE..." e simili, che il PDF stampa gia da se.
  let cutAt = head.length;
  for (let i = 0; i < head.length; i++) {
    const t = head[i].trim();
    if (/^(cordiali|distinti|cordialmente|con\s+i\s+migliori)\s+saluti/i.test(t) || /^saluti\b/i.test(t)) {
      cutAt = i;
      break;
    }
  }
  const cleaned = head.slice(0, cutAt);

  return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripOggettoPrefix(s: string): string {
  return (s ?? "").replace(/^\s*oggetto\s*:\s*/i, "").trim();
}

type Input = {
  templateId?: string | null;
  clienteId: string;
  oggettoOverride?: string | null;
  corpoOverride?: string | null;
  attachToAzioneId?: string | null;
};


function sanitizeName(s: string): string {
  return s.replace(/[^\w.\-]+/g, "_").slice(0, 100);
}

// Sostituisce caratteri non rappresentabili dai font Standard14 (WinAnsi)
function toWinAnsi(s: string): string {
  return s
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = toWinAnsi(rawLine);
    if (line === "") { lines.push(""); continue; }
    const words = line.split(/(\s+)/); // preserva spazi
    let cur = "";
    for (const w of words) {
      const test = cur + w;
      const width = font.widthOfTextAtSize(test, size);
      if (width <= maxWidth) {
        cur = test;
      } else {
        if (cur.trim() !== "") lines.push(cur.trimEnd());
        // Se la singola parola e piu larga, spezza a caratteri
        if (font.widthOfTextAtSize(w, size) > maxWidth) {
          let chunk = "";
          for (const ch of w) {
            if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          cur = chunk;
        } else {
          cur = w.trimStart();
        }
      }
    }
    if (cur.length) lines.push(cur.trimEnd());
  }
  return lines;
}

export const generaLetteraPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Input) => {
    if (!data?.clienteId) throw new Error("clienteId mancante");
    // templateId opzionale (modalita libera): richiede oggetto+corpo override
    if (!data?.templateId) {
      if (!data?.corpoOverride || !data.corpoOverride.trim()) {
        throw new Error("In modalita libera: oggetto e corpo sono richiesti");
      }
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Carica template (se presente)
    let tpl: { id: string; nome: string; oggetto: string; corpo: string } | null = null;
    if (data.templateId) {
      const { data: tplRow, error: eTpl } = await supabase
        .from("template_lettera")
        .select("id, nome, oggetto, corpo, tipo, attivo")
        .eq("id", data.templateId)
        .maybeSingle();
      if (eTpl) throw eTpl;
      if (!tplRow) throw new Error("Template non trovato");
      tpl = { id: tplRow.id, nome: tplRow.nome, oggetto: tplRow.oggetto ?? "", corpo: tplRow.corpo ?? "" };
    }
    const tplNome = tpl?.nome ?? "Comunicazione libera";



    // 2) Carica cliente + sede + scadenze scadute + operatore (server-side)
    const { data: cliente, error: eCli } = await supabase
      .from("clienti")
      .select("id, ragione_sociale, indirizzo, cap, citta, provincia, store_id")
      .eq("id", data.clienteId)
      .maybeSingle();
    if (eCli) throw eCli;
    if (!cliente) throw new Error("Cliente non trovato");

    let sede: DatiSede | null = null;
    let sedeExtra: { email: string | null; pec: string | null; ragSociale: string | null } = {
      email: null, pec: null, ragSociale: null,
    };
    if (cliente.store_id) {
      const { data: store } = await supabase
        .from("stores")
        .select("nome, insegna, indirizzo, cap, citta, provincia, telefono, email_sede, pec_sede, ragione_sociale_sede")
        .eq("id", cliente.store_id)
        .maybeSingle();
      if (store) {
        sede = {
          nome: store.nome ?? null,
          insegna: (store as { insegna?: string | null }).insegna ?? null,
          indirizzo: store.indirizzo ?? null,
          cap: store.cap ?? null,
          citta: store.citta ?? null,
          provincia: store.provincia ?? null,
          telefono: store.telefono ?? null,
        };
        sedeExtra = {
          email: (store as { email_sede?: string | null }).email_sede ?? null,
          pec: (store as { pec_sede?: string | null }).pec_sede ?? null,
          ragSociale: (store as { ragione_sociale_sede?: string | null }).ragione_sociale_sede ?? null,
        };
      }
    }
    const sedeFinal = sede ?? SEDE_FALLBACK;

    const { data: rawScad, error: eSc } = await supabase
      .from("scadenze")
      .select("numero_documento, data_documento, data_scadenza, importo_scadenza, codice_pagamento, stato_contabile, giorni_ritardo, tempi_scadenza, data_pagamento_effettiva")
      .eq("cliente_id", data.clienteId)
      .order("data_scadenza", { ascending: true });
    if (eSc) throw eSc;
    const scadute: ScadenzaSollecito[] = (rawScad ?? [])
      .filter((s) => classificaScadenza(s) === "scaduto")
      .map((s) => ({
        numero_documento: s.numero_documento,
        data_documento: s.data_documento,
        data_scadenza: s.data_scadenza,
        importo_scadenza: s.importo_scadenza,
        codice_pagamento: (s as { codice_pagamento?: string | null }).codice_pagamento ?? null,
      }));

    const { data: prof } = await supabase
      .from("profili")
      .select("nome, cognome")
      .eq("id", userId)
      .maybeSingle();
    const nomeOperatore = `${prof?.nome ?? ""} ${prof?.cognome ?? ""}`.trim() || "MADE DISTRIBUZIONE S.p.A.";

    // Importo unitario spese di insoluto RiBa (fonte: configurazioni)
    const { data: cfgRow } = await supabase
      .from("configurazioni")
      .select("valore")
      .eq("chiave", "spese_insoluto_riba_eur")
      .maybeSingle();
    const parsedSpese = parseFloat(String(cfgRow?.valore ?? ""));
    const speseUnit = Number.isFinite(parsedSpese) && parsedSpese >= 0 ? parsedSpese : 3;

    // 3) Render (override se passato)
    const dati: DatiTemplateLettera = {
      cliente: {
        ragione_sociale: cliente.ragione_sociale ?? "",
        indirizzo: cliente.indirizzo ?? null,
        cap: cliente.cap ?? null,
        citta: cliente.citta ?? null,
        provincia: cliente.provincia ?? null,
      },
      scadenze: scadute,
      nome_operatore: nomeOperatore,
      sede: sedeFinal,
    };
    const rendered = renderLettera(
      { oggetto: data.oggettoOverride ?? tpl?.oggetto ?? "", corpo: data.corpoOverride ?? tpl?.corpo ?? "" },
      dati,
      { speseImportoUnitario: speseUnit },
    );
    rendered.oggetto = stripOggettoPrefix(rendered.oggetto);
    rendered.corpo = stripLetterChrome(rendered.corpo, dati);

    // 4) Costruisci PDF con pdf-lib
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontI = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // A4 in punti
    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const MARGIN_X = 64; // ~2.25cm margini ampi
    const MARGIN_TOP = 56;
    const MARGIN_BOTTOM = 150; // spazio footer a due blocchi
    const CONTENT_W = PAGE_W - 2 * MARGIN_X;

    // Palette brand MADE (sobria)
    const BRAND_NAVY: [number, number, number] = [0.12, 0.23, 0.37];   // #1F3A5F
    const BRAND_ACCENT: [number, number, number] = [0.78, 0.06, 0.18]; // #C8102E
    const INK: [number, number, number] = [0.10, 0.12, 0.16];
    const MUTED: [number, number, number] = [0.42, 0.46, 0.52];
    const HAIRLINE: [number, number, number] = [0.85, 0.87, 0.90];

    // Logo ufficiale MADE: embed dal base64 in bundle (no fetch, sempre disponibile)
    let logoImg: { width: number; height: number; embed: any } | null = null;
    try {
      const png = await pdfDoc.embedPng(b64ToBytes(LOGO_MADE_BASE64));
      const targetW = 140;
      const scale = targetW / png.width;
      logoImg = { width: targetW, height: png.height * scale, embed: png };
    } catch {
      // logo opzionale
    }

    let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN_TOP;

    const drawText = (
      text: string,
      x: number,
      yy: number,
      opts?: { size?: number; bold?: boolean; italic?: boolean; color?: [number, number, number]; pageRef?: PDFPage },
    ) => {
      const size = opts?.size ?? 10.5;
      const f = opts?.bold ? fontB : opts?.italic ? fontI : font;
      const c = opts?.color ?? INK;
      (opts?.pageRef ?? page).drawText(toWinAnsi(text), { x, y: yy, size, font: f, color: rgb(c[0], c[1], c[2]) });
    };

    const textWidth = (text: string, size: number, bold = false) =>
      (bold ? fontB : font).widthOfTextAtSize(toWinAnsi(text), size);

    // === HEADER MITTENTE: logo ufficiale + sede operativa (NO nome operatore) ===
    if (logoImg) {
      page.drawImage(logoImg.embed, {
        x: MARGIN_X,
        y: y - logoImg.height,
        width: logoImg.width,
        height: logoImg.height,
      });
    }
    const nomeSedeRaw = (sedeFinal.nome ?? "").trim();
    const insegnaSede = formatInsegna(sedeFinal.insegna);
    // Normalizza: rimuovi eventuale prefisso "Sede di " e Capitalize la citta
    const cittaSedeNorm = titleCaseSede(nomeSedeRaw.replace(/^sede\s+(di\s+)?/i, ""));
    const sedeLabel = cittaSedeNorm ? `Sede di ${cittaSedeNorm}` : "";
    const sedeHeadLines: string[] = [];
    if (sedeLabel) sedeHeadLines.push(sedeLabel);
    const indirSede = (sedeFinal.indirizzo ?? "").trim();
    if (indirSede) sedeHeadLines.push(indirSede);
    const rigaCittaSede = [
      (sedeFinal.cap ?? "").trim(),
      (sedeFinal.citta ?? "").trim(),
      sedeFinal.provincia ? `(${sedeFinal.provincia.trim()})` : "",
    ].filter(Boolean).join(" ").trim();
    if (rigaCittaSede) sedeHeadLines.push(rigaCittaSede);

    const sedeX = MARGIN_X + (logoImg ? logoImg.width + 18 : 0);
    let sedeY = y - 6;
    // Insegna come riga principale (se presente), altrimenti fallback su sede o brand
    const titoloMittente = insegnaSede || sedeLabel || "MADE DISTRIBUZIONE";
    drawText(titoloMittente, sedeX, sedeY, { size: 12, bold: true, color: BRAND_NAVY });
    sedeY -= 15;
    // Se l'insegna era la riga principale, la "Sede di X" e' gia in sedeHeadLines.
    // Altrimenti rimuoviamo il duplicato.
    const subLines = insegnaSede ? sedeHeadLines : sedeHeadLines.filter((l) => l !== sedeLabel);
    for (const ln of subLines) {
      drawText(ln, sedeX, sedeY, { size: 9, color: MUTED });
      sedeY -= 11;
    }
    const headerBottom = Math.min(sedeY, logoImg ? y - logoImg.height - 4 : sedeY);

    // Filetto brand sotto l'intestazione
    page.drawRectangle({
      x: MARGIN_X,
      y: headerBottom - 10,
      width: CONTENT_W,
      height: 1.6,
      color: rgb(BRAND_NAVY[0], BRAND_NAVY[1], BRAND_NAVY[2]),
    });
    y = headerBottom - 36;

    // === DESTINATARIO (in alto a destra) ===
    const destBoxW = 240;
    const destX = PAGE_W - MARGIN_X - destBoxW;
    let destY = y;
    drawText("Spett.le", destX, destY, { size: 9, color: MUTED, italic: true });
    destY -= 13;
    drawText(dati.cliente.ragione_sociale || "-", destX, destY, { size: 11, bold: true });
    destY -= 13;
    drawText(dati.cliente.indirizzo?.trim() || "-", destX, destY, { size: 10 });
    destY -= 12;
    const capCittaDest = [
      (dati.cliente.cap ?? "").trim(),
      (dati.cliente.citta ?? "").trim(),
      dati.cliente.provincia ? `(${dati.cliente.provincia.trim()})` : "",
    ].filter(Boolean).join(" ").trim() || "-";
    drawText(capCittaDest, destX, destY, { size: 10 });
    destY -= 22;

    y = Math.min(y, destY) - 8;

    // === LUOGO E DATA ===
    const luogoData = `${(sedeFinal.citta ?? "Casorezzo").trim()}, ${formatDateIt(new Date())}`;
    drawText(luogoData, MARGIN_X, y, { size: 10, color: MUTED });
    y -= 28;

    const ensureSpace = (h: number) => {
      if (y - h < MARGIN_BOTTOM) {
        page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN_TOP;
      }
    };

    // === OGGETTO (in evidenza, accent brand) ===
    if (rendered.oggetto?.trim()) {
      ensureSpace(34);
      drawText("OGGETTO", MARGIN_X, y, { size: 8.5, bold: true, color: BRAND_ACCENT });
      y -= 13;
      const oggLines = wrapText(rendered.oggetto.trim(), fontB, 12, CONTENT_W);
      for (const l of oggLines) {
        ensureSpace(15);
        drawText(l, MARGIN_X, y, { size: 12, bold: true, color: BRAND_NAVY });
        y -= 15;
      }
      y -= 14;
    }

    // === CORPO ===
    let corpoFinale = rendered.corpo ?? "";
    const corpoSize = 10.5;
    const corpoLineH = 15; // interlinea piu arieggiata

    const corpoLines = wrapText(corpoFinale, font, corpoSize, CONTENT_W);
    for (const ln of corpoLines) {
      ensureSpace(corpoLineH);
      drawText(ln, MARGIN_X, y, { size: corpoSize });
      y -= corpoLineH;
    }

    // === TABELLA SCADENZE (sostituisce l'elenco puntato) ===
    if (scadute.length && !/TOTALE:/i.test(corpoFinale)) {
      y -= 14;
      ensureSpace(80);
      drawText("Dettaglio scadenze scadute", MARGIN_X, y, { size: 10.5, bold: true, color: BRAND_NAVY });
      y -= 14;

      // Layout colonne: Documento | Data doc. | Scadenza | Importo
      const colW = [CONTENT_W * 0.32, CONTENT_W * 0.20, CONTENT_W * 0.20, CONTENT_W * 0.28];
      const colX = [
        MARGIN_X,
        MARGIN_X + colW[0],
        MARGIN_X + colW[0] + colW[1],
        MARGIN_X + colW[0] + colW[1] + colW[2],
      ];
      const rowH = 18;

      // Header riga
      page.drawRectangle({
        x: MARGIN_X, y: y - rowH + 4, width: CONTENT_W, height: rowH,
        color: rgb(BRAND_NAVY[0], BRAND_NAVY[1], BRAND_NAVY[2]),
      });
      const headers = ["Documento", "Data doc.", "Scadenza", "Importo"];
      const headerY = y - rowH + 9;
      drawText(headers[0], colX[0] + 8, headerY, { size: 9, bold: true, color: [1, 1, 1] });
      drawText(headers[1], colX[1] + 8, headerY, { size: 9, bold: true, color: [1, 1, 1] });
      drawText(headers[2], colX[2] + 8, headerY, { size: 9, bold: true, color: [1, 1, 1] });
      // Importo allineato a destra
      const hImpW = textWidth(headers[3], 9, true);
      drawText(headers[3], colX[3] + colW[3] - 8 - hImpW, headerY, { size: 9, bold: true, color: [1, 1, 1] });
      y -= rowH;

      // Righe
      let totale = 0;
      for (let i = 0; i < scadute.length; i++) {
        const s = scadute[i];
        ensureSpace(rowH + 6);
        // Zebra leggera
        if (i % 2 === 1) {
          page.drawRectangle({
            x: MARGIN_X, y: y - rowH + 4, width: CONTENT_W, height: rowH,
            color: rgb(0.97, 0.97, 0.98),
          });
        }
        const rowY = y - rowH + 9;
        const doc = s.numero_documento ?? "-";
        const dataDoc = formatDateIt(s.data_documento);
        const dataScad = formatDateIt(s.data_scadenza);
        const importo = formatEuro(s.importo_scadenza);
        totale += Number(s.importo_scadenza ?? 0);

        drawText(doc, colX[0] + 8, rowY, { size: 9.5 });
        drawText(dataDoc, colX[1] + 8, rowY, { size: 9.5 });
        drawText(dataScad, colX[2] + 8, rowY, { size: 9.5 });
        const impW = textWidth(importo, 9.5);
        drawText(importo, colX[3] + colW[3] - 8 - impW, rowY, { size: 9.5 });

        // Linea separatrice sottile
        page.drawLine({
          start: { x: MARGIN_X, y: y - rowH + 4 },
          end: { x: PAGE_W - MARGIN_X, y: y - rowH + 4 },
          thickness: 0.4,
          color: rgb(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]),
        });
        y -= rowH;
      }

      // Riga TOTALE
      ensureSpace(rowH + 4);
      page.drawRectangle({
        x: MARGIN_X, y: y - rowH + 4, width: CONTENT_W, height: rowH,
        borderColor: rgb(BRAND_NAVY[0], BRAND_NAVY[1], BRAND_NAVY[2]),
        borderWidth: 0,
        color: rgb(0.94, 0.95, 0.97),
      });
      const totLabel = "TOTALE SCADUTO";
      const totVal = formatEuro(totale);
      drawText(totLabel, colX[0] + 8, y - rowH + 9, { size: 10, bold: true, color: BRAND_NAVY });
      const totW = textWidth(totVal, 10, true);
      drawText(totVal, colX[3] + colW[3] - 8 - totW, y - rowH + 9, { size: 10, bold: true, color: BRAND_ACCENT });
      y -= rowH + 6;
    }

    // === FIRMA (unica) ===
    y -= 22;
    ensureSpace(58);
    drawText("Distinti saluti,", MARGIN_X, y, { size: 10.5 });
    y -= 34;
    drawText(nomeOperatore, MARGIN_X, y, { size: 10.5, bold: true, color: BRAND_NAVY });
    y -= 12;
    drawText("MADE DISTRIBUZIONE S.p.A.", MARGIN_X, y, { size: 9.5, color: MUTED });

    // === FOOTER (solo ultima pagina): sede operativa + dati legali ===
    {
      const lastPage = pdfDoc.getPage(pdfDoc.getPageCount() - 1);

      // Componi righe SEDE OPERATIVA del cliente (graceful: omette righe vuote)
      const sedeFootLines: string[] = [];
      // Titolo footer: "Insegna - Sede di X" se insegna presente, altrimenti solo "Sede di X"
      const sedeFootBase = cittaSedeNorm ? `Sede di ${cittaSedeNorm}` : "Sede operativa";
      const nomeSedeFoot = insegnaSede ? `${insegnaSede} - ${sedeFootBase}` : sedeFootBase;
      const indirCompleto = [
        (sedeFinal.indirizzo ?? "").trim(),
        [
          (sedeFinal.cap ?? "").trim(),
          (sedeFinal.citta ?? "").trim(),
          sedeFinal.provincia ? `(${sedeFinal.provincia.trim()})` : "",
        ].filter(Boolean).join(" ").trim(),
      ].filter(Boolean).join(" - ");
      if (indirCompleto) sedeFootLines.push(indirCompleto);
      const contatti: string[] = [];
      if (sedeFinal.telefono) contatti.push(`Tel. ${sedeFinal.telefono}`);
      if (sedeExtra.email) contatti.push(`Email: ${sedeExtra.email}`);
      if (sedeExtra.pec) contatti.push(`PEC: ${sedeExtra.pec}`);
      if (contatti.length) sedeFootLines.push(contatti.join("  -  "));

      // Calcolo altezza footer
      const footTopY = 130;
      // Filetto brand
      lastPage.drawRectangle({
        x: MARGIN_X, y: footTopY, width: CONTENT_W, height: 1.2,
        color: rgb(BRAND_NAVY[0], BRAND_NAVY[1], BRAND_NAVY[2]),
      });

      // Blocco SEDE OPERATIVA
      let fy = footTopY - 12;
      drawText(nomeSedeFoot, MARGIN_X, fy, { size: 8.5, bold: true, color: BRAND_NAVY, pageRef: lastPage });
      fy -= 10;
      for (const ln of sedeFootLines) {
        drawText(ln, MARGIN_X, fy, { size: 7.5, color: MUTED, pageRef: lastPage });
        fy -= 9;
      }

      // Separatore sottile
      fy -= 4;
      lastPage.drawLine({
        start: { x: MARGIN_X, y: fy },
        end: { x: PAGE_W - MARGIN_X, y: fy },
        thickness: 0.4,
        color: rgb(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2]),
      });
      fy -= 11;

      // Blocco DATI LEGALI MADE
      for (let i = 0; i < LEGAL_FOOTER_LINES.length; i++) {
        const isFirst = i === 0;
        drawText(LEGAL_FOOTER_LINES[i], MARGIN_X, fy, {
          size: isFirst ? 8 : 7,
          bold: isFirst,
          color: isFirst ? BRAND_NAVY : MUTED,
          pageRef: lastPage,
        });
        fy -= isFirst ? 10 : 9;
      }
    }


    const pdfBytes = await pdfDoc.save();

    // 5) Determina azione di aggancio (riusa o crea)
    let azioneId = data.attachToAzioneId ?? null;
    let creataAzione = false;
    if (!azioneId) {
      const { data: insAz, error: eAz } = await supabase
        .from("azioni_recupero")
        .insert({
          cliente_id: data.clienteId,
          operatore_id: userId,
          tipo: "lettera",
          esito: "fatto",
          data_azione: new Date().toISOString(),
          note: `Lettera generata: ${tplNome}`,
        })
        .select("id")
        .single();
      if (eAz) throw eAz;
      azioneId = insAz.id;
      creataAzione = true;
    }

    // 6) Upload su bucket allegati + insert in tabella allegati
    const fileName = `lettera-${sanitizeName(tplNome || "documento")}-${formatDateIt(new Date()).replace(/\//g, "-")}.pdf`;
    const storagePath = `azione_recupero/${azioneId}/${crypto.randomUUID()}-${fileName}`;
    const { error: eUp } = await supabase.storage
      .from("allegati")
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (eUp) {
      // Se abbiamo creato un'azione apposta e l'upload fallisce, rimuoviamola (nessun residuo)
      if (creataAzione && azioneId) {
        await supabase.from("azioni_recupero").delete().eq("id", azioneId);
      }
      throw new Error(`Upload PDF fallito: ${eUp.message}`);
    }

    const { data: insAll, error: eIns } = await supabase
      .from("allegati")
      .insert({
        entita_tipo: "azione_recupero",
        entita_id: azioneId,
        cliente_id: data.clienteId,
        nome_file: fileName,
        storage_path: storagePath,
        mime_type: "application/pdf",
        dimensione_bytes: pdfBytes.byteLength,
        descrizione: tpl ? `Lettera generata da modello: ${tpl.nome}` : "Lettera generata (modalita libera)",
        caricato_da: userId,
      })
      .select("id")
      .single();
    if (eIns) {
      // rollback: rimuovi file e (se creata da noi) azione
      await supabase.storage.from("allegati").remove([storagePath]);
      if (creataAzione && azioneId) {
        await supabase.from("azioni_recupero").delete().eq("id", azioneId);
      }
      throw new Error(`Salvataggio allegato fallito: ${eIns.message}`);
    }

    // 7) Ritorna PDF in base64 (per download client)
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < pdfBytes.length; i += chunkSize) {
      binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunkSize));
    }
    const pdfBase64 = btoa(binary);

    return {
      ok: true as const,
      pdfBase64,
      fileName,
      allegatoId: insAll.id,
      azioneId,
      creataAzione,
    };
  });
