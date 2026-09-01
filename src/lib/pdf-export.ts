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

  const cantiereProvvisorio =
    !prev.cantiere && (prev as { cantiere_descrizione?: string | null }).cantiere_descrizione
      ? ((prev as { cantiere_descrizione?: string | null }).cantiere_descrizione as string)
      : null;

  if (prev.cantiere || cantiereProvvisorio) {
    const cant = prev.cantiere ?? {
      nome: cantiereProvvisorio as string,
      indirizzo: null as string | null,
      provincia: null as string | null,
      comune: null as { nome: string } | null,
    };
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
