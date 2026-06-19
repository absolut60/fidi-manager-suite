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

const LOGO_URL =
  "https://fidi-manager-suite.lovable.app/__l5e/assets-v1/035e2dea-71e9-4ef5-a16d-94aee28def35/logo-made.png";

const LEGAL_FOOTER_LINES = [
  "MADE DISTRIBUZIONE S.p.A.",
  "Sede Legale: Corso di Porta Nuova 11, 20121 Milano (MI) - C.F. e P.IVA 10126430965 - REA Milano MI 2507310",
  "PEC: madedistribuzionesrl@pecplus.it - Capitale Sociale 2.593.000,00 \u20AC i.v.",
  "Societa sotto la Direzione e il Coordinamento di MADE Italia S.p.A.",
];

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
    if (!data?.templateId) throw new Error("templateId mancante");
    if (!data?.clienteId) throw new Error("clienteId mancante");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Carica template
    const { data: tpl, error: eTpl } = await supabase
      .from("template_lettera")
      .select("id, nome, oggetto, corpo, tipo, attivo")
      .eq("id", data.templateId)
      .maybeSingle();
    if (eTpl) throw eTpl;
    if (!tpl) throw new Error("Template non trovato");

    // 2) Carica cliente + sede + scadenze scadute + operatore (server-side)
    const { data: cliente, error: eCli } = await supabase
      .from("clienti")
      .select("id, ragione_sociale, indirizzo, cap, citta, provincia, store_id")
      .eq("id", data.clienteId)
      .maybeSingle();
    if (eCli) throw eCli;
    if (!cliente) throw new Error("Cliente non trovato");

    let sede: DatiSede | null = null;
    if (cliente.store_id) {
      const { data: store } = await supabase
        .from("stores")
        .select("nome, insegna, indirizzo, cap, citta, provincia, telefono")
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
      }
    }
    const sedeFinal = sede ?? SEDE_FALLBACK;

    const { data: rawScad, error: eSc } = await supabase
      .from("scadenze")
      .select("numero_documento, data_documento, data_scadenza, importo_scadenza, stato_contabile, giorni_ritardo, tempi_scadenza, data_pagamento_effettiva")
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
      }));

    const { data: prof } = await supabase
      .from("profili")
      .select("nome, cognome")
      .eq("id", userId)
      .maybeSingle();
    const nomeOperatore = `${prof?.nome ?? ""} ${prof?.cognome ?? ""}`.trim() || "MADE DISTRIBUZIONE S.p.A.";

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
      { oggetto: data.oggettoOverride ?? tpl.oggetto, corpo: data.corpoOverride ?? tpl.corpo },
      dati,
    );

    // 4) Costruisci PDF con pdf-lib
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // A4 in punti
    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const MARGIN_X = 56; // ~2cm
    const MARGIN_TOP = 56;
    const MARGIN_BOTTOM = 90; // spazio per footer legale
    const CONTENT_W = PAGE_W - 2 * MARGIN_X;

    // Logo (fetch best-effort)
    let logoImg: { width: number; height: number; embed: any } | null = null;
    try {
      const res = await fetch(LOGO_URL);
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        const png = await pdfDoc.embedPng(bytes);
        const targetW = 130;
        const scale = targetW / png.width;
        logoImg = { width: targetW, height: png.height * scale, embed: png };
      }
    } catch {
      // logo opzionale, prosegui senza
    }

    let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN_TOP;

    const drawText = (
      text: string,
      x: number,
      yy: number,
      opts?: { size?: number; bold?: boolean; color?: [number, number, number] },
    ) => {
      const size = opts?.size ?? 10.5;
      const f = opts?.bold ? fontB : font;
      const c = opts?.color ?? [0.1, 0.12, 0.16];
      page.drawText(toWinAnsi(text), { x, y: yy, size, font: f, color: rgb(c[0], c[1], c[2]) });
    };

    // === HEADER: logo + sede mittente ===
    if (logoImg) {
      page.drawImage(logoImg.embed, {
        x: MARGIN_X,
        y: y - logoImg.height,
        width: logoImg.width,
        height: logoImg.height,
      });
    }
    // Sede mittente a sinistra sotto il logo (oppure a destra del logo)
    const sedeLines: string[] = [];
    const insegna = (sedeFinal.insegna ?? sedeFinal.nome ?? "MADE DISTRIBUZIONE").toString().trim();
    if (insegna) sedeLines.push(insegna);
    const indir = (sedeFinal.indirizzo ?? "").trim();
    const cap = (sedeFinal.cap ?? "").trim();
    const citta = (sedeFinal.citta ?? "").trim();
    const prov = (sedeFinal.provincia ?? "").trim();
    if (indir) sedeLines.push(indir);
    const rigaCitta = [cap, citta, prov ? `(${prov})` : ""].filter(Boolean).join(" ").trim();
    if (rigaCitta) sedeLines.push(rigaCitta);
    if (sedeFinal.telefono) sedeLines.push(`Tel. ${sedeFinal.telefono}`);

    const sedeX = MARGIN_X + (logoImg ? logoImg.width + 16 : 0);
    let sedeY = y - 8;
    drawText(sedeLines[0] ?? "", sedeX, sedeY, { size: 10, bold: true });
    sedeY -= 12;
    for (let i = 1; i < sedeLines.length; i++) {
      drawText(sedeLines[i], sedeX, sedeY, { size: 9, color: [0.3, 0.34, 0.4] });
      sedeY -= 11;
    }
    const headerBottom = Math.min(sedeY, logoImg ? y - logoImg.height - 4 : sedeY);

    // Linea separatrice
    page.drawLine({
      start: { x: MARGIN_X, y: headerBottom - 6 },
      end: { x: PAGE_W - MARGIN_X, y: headerBottom - 6 },
      thickness: 0.5,
      color: rgb(0.78, 0.81, 0.85),
    });
    y = headerBottom - 28;

    // === DESTINATARIO (riquadro a destra in stile lettera) ===
    const destBoxW = 250;
    const destX = PAGE_W - MARGIN_X - destBoxW;
    let destY = y;
    drawText("Spett.le", destX, destY, { size: 9, color: [0.4, 0.44, 0.5] });
    destY -= 13;
    drawText(dati.cliente.ragione_sociale || "—", destX, destY, { size: 11, bold: true });
    destY -= 13;
    drawText(dati.cliente.indirizzo?.trim() || "—", destX, destY, { size: 10 });
    destY -= 12;
    const capCittaDest = [
      (dati.cliente.cap ?? "").trim(),
      (dati.cliente.citta ?? "").trim(),
      dati.cliente.provincia ? `(${dati.cliente.provincia.trim()})` : "",
    ].filter(Boolean).join(" ").trim() || "—";
    drawText(capCittaDest, destX, destY, { size: 10 });
    destY -= 18;

    y = Math.min(y, destY) - 10;

    // === LUOGO E DATA ===
    const luogoData = `${(sedeFinal.citta ?? "Casorezzo").trim()}, ${formatDateIt(new Date())}`;
    drawText(luogoData, MARGIN_X, y, { size: 10 });
    y -= 24;

    // === OGGETTO ===
    if (rendered.oggetto?.trim()) {
      const oggLines = wrapText(`Oggetto: ${rendered.oggetto.trim()}`, fontB, 11, CONTENT_W);
      for (const l of oggLines) {
        drawText(l, MARGIN_X, y, { size: 11, bold: true });
        y -= 14;
      }
      y -= 10;
    }

    // === CORPO ===
    // Se il corpo contiene {{elenco_scadenze}} renderLettera lo ha gia sostituito col testo.
    // In ogni caso aggiungiamo una resa pulita: se l'utente non lo ha incluso, mostriamo la lista
    // SOLO se non c'e gia (evita doppione semplice: controllo presenza di "TOTALE:").
    let corpoFinale = rendered.corpo ?? "";
    const corpoSize = 10.5;
    const corpoLineH = 14;

    const ensureSpace = (h: number) => {
      if (y - h < MARGIN_BOTTOM) {
        page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN_TOP;
      }
    };

    const corpoLines = wrapText(corpoFinale, font, corpoSize, CONTENT_W);
    for (const ln of corpoLines) {
      ensureSpace(corpoLineH);
      drawText(ln, MARGIN_X, y, { size: corpoSize });
      y -= corpoLineH;
    }

    // Se il corpo NON contiene l'elenco scadenze e ce ne sono, aggiungilo
    if (scadute.length && !/TOTALE:/i.test(corpoFinale)) {
      y -= 6;
      ensureSpace(corpoLineH * 3);
      drawText("Dettaglio scadenze scadute:", MARGIN_X, y, { size: 10.5, bold: true });
      y -= corpoLineH;
      const elenco = buildElencoScadenzeTesto(scadute);
      for (const ln of wrapText(elenco, font, 10, CONTENT_W)) {
        ensureSpace(corpoLineH);
        drawText(ln, MARGIN_X, y, { size: 10 });
        y -= 12;
      }
    }

    // === FIRMA ===
    y -= 30;
    ensureSpace(60);
    drawText("Distinti saluti,", MARGIN_X, y, { size: 10.5 });
    y -= 32;
    drawText(nomeOperatore, MARGIN_X, y, { size: 10.5, bold: true });
    y -= 12;
    drawText("MADE DISTRIBUZIONE S.p.A.", MARGIN_X, y, { size: 9.5, color: [0.4, 0.44, 0.5] });

    // === FOOTER LEGALE (solo ultima pagina) ===
    {
      const lastPage = pdfDoc.getPage(pdfDoc.getPageCount() - 1);
      let fy = 56;
      lastPage.drawLine({
        start: { x: MARGIN_X, y: fy + 8 + LEGAL_FOOTER_LINES.length * 9 },
        end: { x: PAGE_W - MARGIN_X, y: fy + 8 + LEGAL_FOOTER_LINES.length * 9 },
        thickness: 0.5,
        color: rgb(0.85, 0.87, 0.9),
      });
      // disegno dalle ultime righe verso l'alto (semplice: dall'alto)
      let footY = fy + LEGAL_FOOTER_LINES.length * 9;
      for (let i = 0; i < LEGAL_FOOTER_LINES.length; i++) {
        const isFirst = i === 0;
        lastPage.drawText(toWinAnsi(LEGAL_FOOTER_LINES[i]), {
          x: MARGIN_X,
          y: footY,
          size: isFirst ? 8.5 : 7.5,
          font: isFirst ? fontB : font,
          color: rgb(0.5, 0.53, 0.58),
        });
        footY -= isFirst ? 11 : 9;
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
          note: `Lettera generata: ${tpl.nome}`,
        })
        .select("id")
        .single();
      if (eAz) throw eAz;
      azioneId = insAz.id;
      creataAzione = true;
    }

    // 6) Upload su bucket allegati + insert in tabella allegati
    const fileName = `lettera-${sanitizeName(tpl.nome || "documento")}-${formatDateIt(new Date()).replace(/\//g, "-")}.pdf`;
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
        descrizione: `Lettera generata da modello: ${tpl.nome}`,
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
