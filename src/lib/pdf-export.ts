import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PreventivoConDettagli } from "./preventivi-api";
import { calcolaTotaliPreventivo, calcolaBlocco } from "./preventivi-api";
import {
  aggregaMateriali, arricchisciMateriali, arrotondaPerFornitore, buildBlocchiOutput,
  fetchArticoliPerOrdine,
} from "./output-api";

import { LOGO_MADE_BASE64 } from "./logo-made-base64";

const LOGO_MADE_B64 = "data:image/jpeg;base64,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";

const FOOTER_LEGAL =
  "MADE DISTRIBUZIONE S.p.A.  |  Sede Legale: Corso di Porta Nuova 11, 20121 MILANO  |  " +
  "C.F., P.IVA e nr. iscrizione Reg. Imp. di Milano-Monza-Brianza-Lodi 10126430965  |  " +
  "madedistribuzionesrl@pecplus.it  |  REA Milano MI 2507310  |  " +
  "Capitale Sociale € 2.593.000,00 i.v.  |  " +
  "Sede Amministrativa: Via G. Di Vittorio 3, 20003 Casorezzo (MI) — Tel.: 02/90380000 — Fax: 02/90384008  |  " +
  "Sede Operativa: Via Privata Georges Bizet 25, 20092 Cinisello Balsamo (MI) — Tel.: 02/25569828  |  " +
  "Sotto la Direzione e il Coordinamento di Made Italia S.p.A.";

const NAVY:      [number, number, number] = [13, 31, 60];
const VERDE:     [number, number, number] = [0, 146, 70];
const ROSSO:     [number, number, number] = [206, 43, 55];
const GRIGIO:    [number, number, number] = [110, 115, 125];
const GRIGIO_LT: [number, number, number] = [245, 246, 248];
const GRIGIO_BD: [number, number, number] = [220, 222, 226];
const BLOCK_BG:  [number, number, number] = [235, 238, 244];
const BANDA_BG:  [number, number, number] = [235, 238, 244];
const LABEL_COL: [number, number, number] = [130, 140, 155];
const COBALT:    [number, number, number] = [38, 95, 176];

const fmtEur = (n: number) =>
  "€ " + n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n: number, d = 2) =>
  n.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtData = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("it-IT");
};

function drawHeader(doc: jsPDF, titolo: string, prev: PreventivoConDettagli, logo: "sistema" | "fidimanager" = "fidimanager"): number {
  const w = doc.internal.pageSize.getWidth();

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, w, 26, "F");
  // Logo: "sistema MADE" (JPEG) solo per Preventivo/Ordine; PNG FidiManager per gli altri documenti
  try {
    if (logo === "sistema") {
      doc.addImage(LOGO_MADE_B64, "JPEG", 12, 4, 95, 20.2);
    } else {
      doc.addImage(LOGO_MADE_BASE64, "PNG", 12, 6, 95, 13.4);
    }
  } catch { /* fallback */ }
  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text(titolo.toUpperCase(), w - 14, 13, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
  doc.setTextColor(...GRIGIO);
  doc.text("Distribuzione sistemi a secco  |  cartongesso, profili, isolanti, controsoffitti", w - 14, 18.5, { align: "right" });

  const by = 26;
  const bh = 34;
  doc.setFillColor(...BANDA_BG); doc.rect(0, by, w, bh, "F");

  const cli = prev.cliente;
  doc.setFont("helvetica", "bold"); doc.setFontSize(5.8);
  doc.setTextColor(...LABEL_COL);
  doc.text("CLIENTE", 14, by + 5);

  doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
  doc.setTextColor(...NAVY);
  const rs = (cli?.ragione_sociale ?? "—").slice(0, 48);
  doc.text(rs, 14, by + 10.5);

  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  doc.setTextColor(...NAVY);
  let yL = by + 15.5;
  if (cli?.piva) {
    doc.text(`P.IVA ${cli.piva}`, 14, yL);
    yL += 4;
  }
  if (cli?.indirizzo) {
    doc.text(cli.indirizzo.slice(0, 70), 14, yL);
    yL += 4;
  }
  const loc: string[] = [];
  if (cli?.cap) loc.push(cli.cap);
  if (cli?.comune?.nome) loc.push(cli.comune.nome);
  if (cli?.provincia) loc.push(`(${cli.provincia})`);
  const locStr = loc.join(" ");
  if (locStr) {
    doc.text(locStr.slice(0, 70), 14, yL);
    yL += 4;
  }

  const colDoc  = w - 78;
  const colData = w - 42;
  const colVal  = w - 14;
  const R1 = [
    { lbl: "N° DOCUMENTO", val: String(prev.numero ?? "—"), x: colDoc },
    { lbl: "DATA",         val: fmtData(prev.data),          x: colData },
    { lbl: "VALIDITÀ",     val: fmtData(prev.validita),      x: colVal },
  ];
  const R2 = [
    { lbl: "AGENTE",  val: (prev.agente?.nome ?? "—").slice(0, 22), x: colDoc },
    { lbl: "FILIALE", val: (prev.filiale ?? "—").slice(0, 18),       x: colVal },
  ];
  for (const c of R1) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.8); doc.setTextColor(...LABEL_COL);
    doc.text(c.lbl, c.x, by + 5, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...NAVY);
    doc.text(c.val, c.x, by + 11, { align: "right" });
  }
  for (const c of R2) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.8); doc.setTextColor(...LABEL_COL);
    doc.text(c.lbl, c.x, by + 19, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...NAVY);
    doc.text(c.val, c.x, by + 25, { align: "right" });
  }

  let headerEnd = by + bh;

  if (prev.cantiere) {
    const cant = prev.cantiere;
    const ctAddrParts: string[] = [];
    if (cant.indirizzo) ctAddrParts.push(cant.indirizzo);
    const ctLoc: string[] = [];
    if (cant.comune?.nome) ctLoc.push(cant.comune.nome);
    if (cant.provincia) ctLoc.push(`(${cant.provincia})`);
    const ctLocStr = ctLoc.join(" ");

    const stripX = 0;
    const stripW = w;
    const padX = 14;
    const innerW = stripW - padX * 2;

    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const addrLines: string[] = [];
    if (ctAddrParts.length) {
      const wrapped = doc.splitTextToSize(ctAddrParts.join(", "), innerW) as string[];
      addrLines.push(...wrapped);
    }
    if (ctLocStr) {
      const wrapped = doc.splitTextToSize(ctLocStr, innerW) as string[];
      addrLines.push(...wrapped);
    }

    const labelH = 3.5;
    const nameH = 5;
    const lineH = 3.6;
    const padTop = 2.6;
    const padBot = 2.8;
    const stripH = padTop + labelH + nameH + addrLines.length * lineH + padBot;
    const stripY = headerEnd + 1;

    const CANTIERE_BG: [number, number, number] = [220, 230, 245];
    const CANTIERE_BORDER: [number, number, number] = [180, 200, 225];
    doc.setFillColor(...CANTIERE_BG);
    doc.setDrawColor(...CANTIERE_BORDER);
    doc.setLineWidth(0.2);
    doc.rect(stripX, stripY, stripW, stripH, "F");
    doc.line(0, stripY, w, stripY);
    doc.line(0, stripY + stripH, w, stripY + stripH);

    doc.setFont("helvetica", "bold"); doc.setFontSize(6);
    doc.setTextColor(...LABEL_COL);
    doc.text("CANTIERE", padX, stripY + padTop + labelH - 0.6);

    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(cant.nome ?? "—", padX, stripY + padTop + labelH + nameH - 0.2);

    if (addrLines.length) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.setTextColor(...NAVY);
      let yA = stripY + padTop + labelH + nameH + lineH - 0.5;
      for (const ln of addrLines) {
        doc.text(ln, padX, yA);
        yA += lineH;
      }
    }

    headerEnd = stripY + stripH;
  }

  return headerEnd;
}

function drawFooter(doc: jsPDF) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  const FOOTER_H = 20;
  const BAND_H = 18.4;
  const BAND_GAP = 2;

  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const isLast = i === pages;

    if (isLast) {
      const bandY = h - FOOTER_H - BAND_GAP - BAND_H;
      doc.setFillColor(...COBALT);
      doc.rect(0, bandY, w, BAND_H, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");

      doc.setFontSize(10);
      doc.text("IL NUOVO MODO", 14, bandY + 5);
      doc.text("DI COSTRUIRE.", 14, bandY + 9);

      doc.setFontSize(5);
      doc.text("Tecnologie leggere, risultati solidi", 14, bandY + 13.5);
      doc.text("il sistema a secco che guarda al futuro.", 14, bandY + 16.3);

      doc.setFont("helvetica", "normal");
    }

    doc.setDrawColor(...GRIGIO_BD); doc.setLineWidth(0.2);
    doc.line(14, h - FOOTER_H + 1, w - 14, h - FOOTER_H + 1);

    doc.setFont("helvetica", "normal"); doc.setFontSize(5.2);
    doc.setTextColor(...GRIGIO);
    const legalW = w - 28;
    const lines = doc.splitTextToSize(FOOTER_LEGAL, legalW);
    doc.text(lines, 14, h - FOOTER_H + 4);

    doc.setFontSize(6);
    doc.text(`Pag. ${i} / ${pages}`, w - 14, h - 5, { align: "right" });
  }
}

function fileName(prev: PreventivoConDettagli, tipo: string, ext = "pdf") {
  const num = (prev.numero ?? "senza-numero").replace(/[^A-Za-z0-9_-]+/g, "_");
  const cli = (prev.cliente?.ragione_sociale ?? "cliente").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 30);
  return `${tipo}_${num}_${cli}.${ext}`;
}

export interface ColonneRighePdf {
  um: boolean;
  quantita: boolean;
  prezzo_unit: boolean;
  sconto: boolean;
  prezzo_scontato: boolean;
  importo: boolean;
}

export const COLONNE_RIGHE_DEFAULT: ColonneRighePdf = {
  um: true, quantita: true, prezzo_unit: true, sconto: true, prezzo_scontato: true, importo: true,
};

export interface PreventivoPdfOptions {
  colonne?: Partial<ColonneRighePdf>;
}

export async function exportPreventivoPdf(prev: PreventivoConDettagli, opzioni: PreventivoPdfOptions = {}) {
  const col: ColonneRighePdf = { ...COLONNE_RIGHE_DEFAULT, ...(opzioni.colonne ?? {}) };
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const headerEnd = drawHeader(doc, prev.tipo === "ordine" ? "Ordine" : "Preventivo", prev, "sistema");

  const blocchi = buildBlocchiOutput(prev);
  const USABLE = w - 28;
  let y = Math.max(62, headerEnd + 4);

  for (const b of blocchi) {
    autoTable(doc, {
      startY: y,
      head: [[
        { content: b.rif || "—", styles: { halign: "left", font: "courier", fontStyle: "bold" } },
        { content: b.descrizione, styles: { halign: "left" } },
        { content: `${fmtNum(b.quantita, 2)} ${b.um}`, styles: { halign: "right" } },
        { content: `${fmtEur(b.prezzo_um)} /${b.um}`, styles: { halign: "right" } },
      ]],
      body: [],
      theme: "plain",
      headStyles: {
        fillColor: BLOCK_BG, textColor: NAVY, fontSize: 8.5,
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        lineColor: GRIGIO_BD, lineWidth: 0.15,
      },
      columnStyles: {
        0: { cellWidth: 24 },
        2: { cellWidth: 32 },
        3: { cellWidth: 36 },
      },
      margin: { left: 14, right: 14, bottom: 30, top: 20 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

    if (b.note_tecniche) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(...GRIGIO);
      const lines = doc.splitTextToSize(b.note_tecniche, USABLE);
      doc.text(lines, 14, y + 3);
      y += 3 + lines.length * 3.2;
    }

    type ColDef = { head: string; width: number; halign?: "left" | "right" | "center"; font?: string; bold?: boolean };
    const colDefs: ColDef[] = [
      { head: "Cod. Gamma", width: 22, font: "courier" },
      { head: "Descrizione", width: 0 },
    ];
    if (col.um) colDefs.push({ head: "U.M.", width: 12, halign: "center" });
    if (col.quantita) colDefs.push({ head: "Quantità", width: 18, halign: "right", font: "courier" });
    if (col.prezzo_unit) colDefs.push({ head: "Prezzo unit.", width: 22, halign: "right", font: "courier" });
    if (col.sconto) colDefs.push({ head: "Sconto %", width: 16, halign: "right", font: "courier" });
    if (col.prezzo_scontato) colDefs.push({ head: col.prezzo_unit ? "Prezzo scontato" : "Prezzo", width: 24, halign: "right", font: "courier" });
    if (col.importo) colDefs.push({ head: "Importo", width: 24, halign: "right", font: "courier", bold: true });

    type CellSpec = string | number | {
      content: string;
      colSpan?: number;
      styles?: Record<string, unknown>;
    };
    const body: CellSpec[][] = [];
    const ncols = colDefs.length;
    const lastIdx = ncols - 1;
    const calcBl = calcolaBlocco(b.righe);
    const subMap = new Map<string, number>();
    for (const x of calcBl.righe) subMap.set(x.id, x.calc.importoEffettivo);

    for (const r of b.righe) {
      if (r.tipo_riga === "nota") {
        body.push([{
          content: r.descrizione ?? "",
          colSpan: ncols,
          styles: {
            fontStyle: "italic",
            textColor: GRIGIO as unknown as number[],
            fillColor: [255, 255, 255] as unknown as number[],
            fontSize: 7,
            cellPadding: { top: 1.4, right: 2, bottom: 1.4, left: 2 },
          },
        }]);
        continue;
      }
      if (r.tipo_riga === "separatore") {
        body.push([{
          content: r.descrizione ?? "",
          colSpan: ncols,
          styles: {
            fillColor: GRIGIO_BD as unknown as number[],
            textColor: GRIGIO as unknown as number[],
            fontSize: 5,
            halign: "center",
            cellPadding: { top: 0.4, right: 2, bottom: 0.4, left: 2 },
            minCellHeight: 1,
          },
        }]);
        continue;
      }
      if (r.tipo_riga === "sotto_totale") {
        const sub = subMap.get(r.id) ?? 0;
        if (ncols >= 2 && col.importo) {
          body.push([
            {
              content: r.descrizione || "Subtotale",
              colSpan: lastIdx,
              styles: {
                fontStyle: "bold",
                halign: "right",
                fillColor: GRIGIO_LT as unknown as number[],
                textColor: NAVY as unknown as number[],
                fontSize: 7.5,
              },
            },
            {
              content: fmtEur(sub),
              styles: {
                fontStyle: "bold",
                halign: "right",
                font: "courier",
                fillColor: GRIGIO_LT as unknown as number[],
                textColor: NAVY as unknown as number[],
                fontSize: 7.5,
              },
            },
          ]);
        } else {
          body.push([{
            content: `${r.descrizione || "Subtotale"}   ${fmtEur(sub)}`,
            colSpan: ncols,
            styles: {
              fontStyle: "bold",
              halign: "right",
              fillColor: GRIGIO_LT as unknown as number[],
              textColor: NAVY as unknown as number[],
              fontSize: 7.5,
            },
          }]);
        }
        continue;
      }
      const prezzo = Number(r.prezzo_unit ?? 0);
      const sc = Number(r.sconto_perc ?? 0);
      const prezzoScontato = prezzo * (1 - sc / 100);
      const hasQta = r.quantita != null && Number(r.quantita) !== 0;
      const hasPrezzo = r.prezzo_unit != null && Number(r.prezzo_unit) !== 0;
      const row: CellSpec[] = [
        r.articolo?.cod_gamma ?? "",
        r.descrizione ?? r.articolo?.descrizione ?? "",
      ];
      if (col.um) row.push(r.um ?? r.articolo?.um ?? "");
      if (col.quantita) row.push(hasQta ? fmtNum(Number(r.quantita), 2) : "");
      if (col.prezzo_unit) row.push(hasPrezzo ? fmtEur(prezzo) : "");
      if (col.sconto) row.push(sc > 0 ? `${fmtNum(sc, 2)}%` : "—");
      if (col.prezzo_scontato) row.push(hasPrezzo ? fmtEur(prezzoScontato) : "");
      if (col.importo) row.push(r.importo != null ? fmtEur(Number(r.importo)) : "");
      body.push(row);
    }
    if (body.length) {
      const columnStyles: Record<number, Record<string, unknown>> = {};
      colDefs.forEach((c, i) => {
        const s: Record<string, unknown> = {};
        if (c.width > 0) s.cellWidth = c.width;
        if (c.halign) s.halign = c.halign;
        if (c.font) s.font = c.font;
        if (c.bold) s.fontStyle = "bold";
        columnStyles[i] = s;
      });
      autoTable(doc, {
        startY: y,
        head: [colDefs.map((c) => c.head)],
        body,
        theme: "striped",
        headStyles: {
          fillColor: [255, 255, 255] as [number, number, number],
          textColor: GRIGIO, fontStyle: "bold", fontSize: 6.2,
          lineColor: GRIGIO_BD, lineWidth: 0.1,
        },
        bodyStyles: { fontSize: 7, textColor: [30, 35, 45] as [number, number, number], cellPadding: 1.4 },
        alternateRowStyles: { fillColor: GRIGIO_LT },
        columnStyles,
        margin: { left: 14, right: 14, bottom: 30, top: 20 },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    }

    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...NAVY);
    doc.text(`Totale ${fmtEur(b.importo)}`, w - 14, y + 5, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 8;

    doc.setDrawColor(...GRIGIO_BD); doc.setLineWidth(0.1);
    doc.line(14, y, w - 14, y);
    y += 6;

    if (y > doc.internal.pageSize.getHeight() - 70) {
      doc.addPage(); y = 20;
    }
  }

  if (y > doc.internal.pageSize.getHeight() - 72) { doc.addPage(); y = 20; }
  doc.setDrawColor(...GRIGIO_BD); doc.setLineWidth(0.2);
  doc.line(14, y, w - 14, y);
  y += 5;

  const ivaPerc = Number(prev.iva_perc ?? 22);
  const tot = calcolaTotaliPreventivo(
    prev.blocchi.map((bl) => ({
      righe: bl.righe, quantita_base: bl.quantita_base, prezzo_um: bl.prezzo_um, importo: bl.importo,
    })),
    ivaPerc,
    0,
  );

  const DISCLAIMER =
    "I prezzi si intendono franco filiale MADE — IVA esclusa. " +
    "La vendita è effettuata a confezioni / bancali / pallet interi. " +
    (prev.tipo === "ordine" ? "" : "Validità preventivo come indicato in intestazione. ") +
    "Salvo errori ed omissioni.";
  doc.setFont("helvetica", "italic"); doc.setFontSize(6.8); doc.setTextColor(...GRIGIO);
  const discLines = doc.splitTextToSize(DISCLAIMER, 78);
  doc.text(discLines, 14, y + 1);

  const boxH = 26;
  const tw = 80; const tx = w - 14 - tw; const ty = y;
  doc.setDrawColor(...GRIGIO_BD); doc.setLineWidth(0.3);
  doc.rect(tx, ty, tw, boxH, "D");

  doc.setFillColor(...NAVY); doc.rect(tx, ty, tw, 11, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
  doc.text("Totale", tx + 3, ty + 7.5);
  doc.text(fmtEur(tot.imponibile_netto), tx + tw - 4, ty + 7.5, { align: "right" });

  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GRIGIO);
  doc.text(`IVA ${ivaPerc}%`, tx + 3, ty + 16);
  doc.setTextColor(...NAVY); doc.text(fmtEur(tot.iva), tx + tw - 4, ty + 16, { align: "right" });

  doc.setDrawColor(...GRIGIO_BD); doc.setLineWidth(0.1);
  doc.line(tx + 2, ty + 18.5, tx + tw - 2, ty + 18.5);

  doc.setTextColor(...GRIGIO);
  doc.text("Totale con IVA", tx + 3, ty + 22.5);
  doc.setTextColor(...NAVY); doc.text(fmtEur(tot.totale), tx + tw - 4, ty + 22.5, { align: "right" });

  drawFooter(doc);
  const name = fileName(prev, prev.tipo === "ordine" ? "ordine" : "preventivo");
  return { blob: doc.output("blob") as Blob, fileName: name };
}

export async function exportPropostaRapidaPdf(prev: PreventivoConDettagli) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const headerEnd = drawHeader(doc, "Proposta rapida", prev);

  const blocchi = buildBlocchiOutput(prev);
  const body = blocchi.map((b) => [
    b.rif || "—",
    b.descrizione,
    `${fmtNum(b.quantita, 2)} ${b.um}`,
    `${fmtEur(b.prezzo_um)} /${b.um}`,
    fmtEur(b.importo),
  ]);

  autoTable(doc, {
    startY: Math.max(62, headerEnd + 4),
    head: [["Rif.", "Descrizione", "Quantità", "Prezzo unit.", "Importo"]],
    body,
    theme: "striped",
    headStyles: { fillColor: BLOCK_BG, textColor: NAVY, fontStyle: "bold", fontSize: 8, lineColor: GRIGIO_BD, lineWidth: 0.15 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 35, 45] as [number, number, number] },
    alternateRowStyles: { fillColor: GRIGIO_LT },
    styles: { cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 24, font: "courier", fontStyle: "bold" },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 32, halign: "right", font: "courier" },
      4: { cellWidth: 32, halign: "right", font: "courier", fontStyle: "bold" },
    },
    margin: { left: 14, right: 14, bottom: 30, top: 20 },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = 20; }
  doc.setDrawColor(...GRIGIO_BD); doc.setLineWidth(0.2);
  doc.line(14, y, w - 14, y);
  y += 5;

  const ivaPerc = Number(prev.iva_perc ?? 22);
  const tot = calcolaTotaliPreventivo(
    prev.blocchi.map((bl) => ({
      righe: bl.righe, quantita_base: bl.quantita_base, prezzo_um: bl.prezzo_um, importo: bl.importo,
    })),
    ivaPerc,
    0,
  );

  const DISCLAIMER =
    "I prezzi si intendono franco filiale MADE — IVA esclusa. " +
    (prev.tipo === "ordine" ? "" : "Validità preventivo come indicato in intestazione. ") +
    "Salvo errori ed omissioni.";
  doc.setFont("helvetica", "italic"); doc.setFontSize(6.8); doc.setTextColor(...GRIGIO);
  const discLines = doc.splitTextToSize(DISCLAIMER, 78);
  doc.text(discLines, 14, y + 1);

  const boxH = 26;
  const tw = 80; const tx = w - 14 - tw; const ty = y;
  doc.setDrawColor(...GRIGIO_BD); doc.setLineWidth(0.3);
  doc.rect(tx, ty, tw, boxH, "D");

  doc.setFillColor(...NAVY); doc.rect(tx, ty, tw, 11, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
  doc.text("Totale", tx + 3, ty + 7.5);
  doc.text(fmtEur(tot.imponibile_netto), tx + tw - 4, ty + 7.5, { align: "right" });

  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GRIGIO);
  doc.text(`IVA ${ivaPerc}%`, tx + 3, ty + 16);
  doc.setTextColor(...NAVY); doc.text(fmtEur(tot.iva), tx + tw - 4, ty + 16, { align: "right" });

  doc.setDrawColor(...GRIGIO_BD); doc.setLineWidth(0.1);
  doc.line(tx + 2, ty + 18.5, tx + tw - 2, ty + 18.5);

  doc.setTextColor(...GRIGIO);
  doc.text("Totale con IVA", tx + 3, ty + 22.5);
  doc.setTextColor(...NAVY); doc.text(fmtEur(tot.totale), tx + tw - 4, ty + 22.5, { align: "right" });

  drawFooter(doc);
  const name = fileName(prev, "proposta-rapida");
  return { blob: doc.output("blob") as Blob, fileName: name };
}

export async function exportListaMaterialiPdf(prev: PreventivoConDettagli) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const headerEnd = drawHeader(doc, "Lista materiali", prev);

  const base = aggregaMateriali(prev.blocchi);
  const info = await fetchArticoliPerOrdine(base.map((m) => m.articolo_id));
  const mats = arricchisciMateriali(base, info);

  autoTable(doc, {
    startY: Math.max(62, headerEnd + 4),
    head: [["Cod. Gamma", "Descrizione", "U.M.", "Quantità", "Peso (kg)", "Fornitore"]],
    body: mats.map((m) => [
      m.cod_gamma ?? "",
      m.descrizione,
      m.um ?? "",
      fmtNum(m.qta_teorica, 2),
      fmtNum(m.peso_totale, 1),
      m.fornitore_nome ?? "—",
    ]),
    theme: "striped",
    headStyles: { fillColor: BLOCK_BG, textColor: NAVY, fontStyle: "bold", fontSize: 7.5, lineColor: GRIGIO_BD, lineWidth: 0.15 },
    bodyStyles: { fontSize: 8, textColor: [30, 35, 45] as [number, number, number] },
    alternateRowStyles: { fillColor: GRIGIO_LT },
    styles: { cellPadding: 1.6 },
    columnStyles: {
      0: { cellWidth: 26, font: "courier" },
      2: { cellWidth: 14, halign: "center" },
      3: { cellWidth: 22, halign: "right", font: "courier" },
      4: { cellWidth: 22, halign: "right", font: "courier" },
      5: { cellWidth: 36 },
    },
    margin: { left: 14, right: 14, bottom: 30, top: 20 },
  });

  drawFooter(doc);
  const name = fileName(prev, "lista-materiali");
  return { blob: doc.output("blob") as Blob, fileName: name };
}

export async function exportListaFornitorePdf(prev: PreventivoConDettagli) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const headerEnd = drawHeader(doc, "Lista mat. fornitore", prev);

  const base = aggregaMateriali(prev.blocchi);
  const info = await fetchArticoliPerOrdine(base.map((m) => m.articolo_id));
  const mats = arricchisciMateriali(base, info);
  const gruppi = arrotondaPerFornitore(mats);

  let y = Math.max(62, headerEnd + 4);
  for (const g of gruppi) {
    doc.setFillColor(...BLOCK_BG);
    doc.rect(14, y, doc.internal.pageSize.getWidth() - 28, 7, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...NAVY);
    doc.text(`Fornitore: ${g.fornitore_nome}`, 16, y + 5);
    y += 7;

    autoTable(doc, {
      startY: y,
      head: [["Cod. Gamma", "Descrizione", "U.M.", "Q.tà teorica", "Conf.", "N°", "Q.tà ordine"]],
      body: g.righe.map((r) => [
        r.cod_gamma ?? "",
        r.descrizione,
        r.um ?? "",
        fmtNum(r.qta_teorica, 2),
        r.qta_confezione > 0 ? fmtNum(r.qta_confezione, 2) : "—",
        String(r.n_confezioni),
        fmtNum(r.qta_ordine, 2),
      ]),
      theme: "striped",
      headStyles: { fillColor: [255, 255, 255] as [number, number, number], textColor: GRIGIO, fontStyle: "bold", fontSize: 6.8, lineColor: GRIGIO_BD, lineWidth: 0.1 },
      bodyStyles: { fontSize: 7.5, textColor: [30, 35, 45] as [number, number, number] },
      alternateRowStyles: { fillColor: GRIGIO_LT },
      styles: { cellPadding: 1.6 },
      columnStyles: {
        0: { cellWidth: 24, font: "courier" },
        2: { cellWidth: 14, halign: "center" },
        3: { cellWidth: 22, halign: "right", font: "courier" },
        4: { cellWidth: 18, halign: "right", font: "courier" },
        5: { cellWidth: 12, halign: "right", font: "courier" },
        6: { cellWidth: 24, halign: "right", font: "courier", fontStyle: "bold" },
      },
      margin: { left: 14, right: 14, bottom: 30, top: 20 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 20;
    }
  }

  drawFooter(doc);
  const name = fileName(prev, "ordine-fornitore");
  return { blob: doc.output("blob") as Blob, fileName: name };
}
