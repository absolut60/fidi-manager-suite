/**
 * Esportazione Excel del fido teorico per TUTTI i clienti visibili all'utente.
 *
 * Sola lettura: usa la RPC canonica `public.get_fido_teorico()` (senza filtro id)
 * e l'anagrafica clienti. Nessuna scrittura sul DB, nessun calcolo alternativo
 * del fido: i valori del motore vengono riportati tali e quali.
 */
import * as XLSX from "xlsx";
import { unzipSync, zipSync } from "fflate";

import { supabase } from "@/integrations/supabase/client";
import { REGOLA_DESCRIZIONE } from "@/lib/fido-teorico";

const PAGE = 1000;

export type Dinamica = "dormiente" | "perso" | "consolidato" | "nuovo";

export const DINAMICA_LABEL: Record<Dinamica, string> = {
  dormiente: "Dormiente",
  perso: "Perso",
  consolidato: "Consolidato",
  nuovo: "Nuovo",
};

export const DINAMICHE: Dinamica[] = ["dormiente", "perso", "consolidato", "nuovo"];

export function calcolaDinamica(annoCorrente: number, annoPrecedente: number): Dinamica {
  const cur = annoCorrente > 0;
  const prev = annoPrecedente > 0;
  if (!cur && !prev) return "dormiente";
  if (!cur && prev) return "perso";
  if (cur && prev) return "consolidato";
  return "nuovo";
}

/** Fasce di fido base, stesse soglie del gestionale. */
export const FASCE: Array<{ label: string; test: (v: number) => boolean }> = [
  { label: "≤ 500", test: (v) => v <= 500 },
  { label: "≤ 1.000", test: (v) => v > 500 && v <= 1000 },
  { label: "≤ 2.000", test: (v) => v > 1000 && v <= 2000 },
  { label: "≤ 3.000", test: (v) => v > 2000 && v <= 3000 },
  { label: "≤ 4.000", test: (v) => v > 3000 && v <= 4000 },
  { label: "≤ 5.000", test: (v) => v > 4000 && v <= 5000 },
  { label: "oltre 5.000", test: (v) => v > 5000 },
];

export type RigaExport = {
  codice_gestionale: string;
  ragione_sociale: string;
  partita_iva: string;
  sede: string;
  agente: string;
  categoria: string;
  condizione_pagamento: string;
  giorni: number | null;
  fatturato_rolling: number;
  fido_base: number;
  fido_proposto: number;
  fido_attuale: number;
  scostamento: number;
  regola: string;
  scaduto: number;
  a_scadere: number;
  totale_rischio: number;
  doc_da_fatturare: number;
  doc_da_evadere: number;
  picco_esposizione: number;
  num_insoluti: number;
  bloccato: boolean;
  attivo: boolean;
  mesi_attivi: number;
  fatturato_anno_corrente: number;
  fatturato_anno_precedente: number;
  dinamica: Dinamica;
  ritmo_mensile: number;
  giorni_oltre_accordo: number;
  profilo_pagamento: string;
  coefficiente: number;
  fido_proposto_senza_coefficiente: number;
  richiede_verifica: boolean;
  nota_proposta: string;
  sede_cinisello: boolean;
  ddt_incluso: number;
  fido_teorico_puro: number;
  pavimento_applicato: boolean;
};


export type ProgressoExport = { fase: string; percentuale: number };
type OnProgress = (p: ProgressoExport) => void;

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Raccoglie tutti i dati necessari all'esportazione, paginando ogni sorgente. */
export async function raccogliDatiFidoTeorico(
  mesiAttiviMap: Record<string, number>,
  onProgress: OnProgress,
): Promise<{ righe: RigaExport[]; mesiRolling: number | null }> {
  // 1) Motore fido teorico (tutti i clienti visibili)
  onProgress({ fase: "Calcolo fido teorico...", percentuale: 5 });
  const teorico = new Map<string, any>();
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await (supabase as any)
      .rpc("get_fido_teorico", {})
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as any[];
    for (const r of batch) teorico.set(String(r.cliente_id), r);
    onProgress({
      fase: `Calcolo fido teorico: ${teorico.size} clienti...`,
      percentuale: Math.min(45, 5 + teorico.size / 400),
    });
    if (batch.length < PAGE) break;
    if (off > 200_000) break;
  }

  // 2) Anagrafica clienti
  onProgress({ fase: "Lettura anagrafica clienti...", percentuale: 50 });
  const clienti = new Map<string, any>();
  const SELECT =
    "id, codice_gestionale, ragione_sociale, partita_iva, agente, categoria, " +
    "condizione_pagamento_cod, condizione_pagamento_desc, scaduto, a_scadere, totale_rischio, " +
    "doc_da_fatturare, doc_da_evadere, num_insoluti, bloccato, attivo, fido_gestionale, stores(nome)";
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabase.from("clienti").select(SELECT).range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as any[];
    for (const c of batch) clienti.set(String(c.id), c);
    onProgress({
      fase: `Lettura anagrafica clienti: ${clienti.size}...`,
      percentuale: Math.min(75, 50 + clienti.size / 500),
    });
    if (batch.length < PAGE) break;
    if (off > 200_000) break;
  }

  // 3) Fatturato anno corrente / precedente
  onProgress({ fase: "Lettura fatturato annuale...", percentuale: 80 });
  const annoCorrente = new Date().getFullYear();
  const annoPrec = annoCorrente - 1;
  const fattCur = new Map<string, number>();
  const fattPrev = new Map<string, number>();
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabase
      .from("fatturato_clienti")
      .select("cliente_id, anno, fatturato")
      .in("anno", [annoCorrente, annoPrec])
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as any[];
    for (const r of batch) {
      if (!r.cliente_id) continue;
      const target = Number(r.anno) === annoCorrente ? fattCur : fattPrev;
      target.set(String(r.cliente_id), num(r.fatturato));
    }
    if (batch.length < PAGE) break;
    if (off > 500_000) break;
  }

  // 4) Finestra di calcolo configurata
  const { data: cfg } = await supabase
    .from("configurazioni")
    .select("valore")
    .eq("chiave", "fido_teorico_mesi_rolling")
    .maybeSingle();
  const mesiRolling = cfg?.valore ? Number(cfg.valore) : null;

  onProgress({ fase: "Composizione del file...", percentuale: 90 });
  const righe: RigaExport[] = [];
  for (const [id, t] of teorico) {
    const c = clienti.get(id) ?? {};
    const cur = fattCur.get(id) ?? 0;
    const prev = fattPrev.get(id) ?? 0;
    const totaleRischio = num(c.totale_rischio);
    const daEvadere = num(c.doc_da_evadere);
    const condizione =
      [c.condizione_pagamento_cod, c.condizione_pagamento_desc].filter(Boolean).join(" - ") || "";
    righe.push({
      codice_gestionale: c.codice_gestionale ?? "",
      ragione_sociale: c.ragione_sociale ?? "",
      partita_iva: c.partita_iva ?? "",
      sede: c.stores?.nome ?? "",
      agente: c.agente ?? "",
      categoria: c.categoria ?? "",
      condizione_pagamento: condizione,
      giorni: t.giorni_mancanti ? null : num(t.giorni),
      fatturato_rolling: num(t.fatturato_rolling),
      fido_base: num(t.fido_base),
      fido_proposto: num(t.fido_proposto),
      fido_attuale: num(t.fido_attuale),
      scostamento: num(t.scostamento),
      regola: REGOLA_DESCRIZIONE[String(t.regola_applicata)] ?? String(t.regola_applicata ?? ""),
      scaduto: num(c.scaduto),
      a_scadere: num(c.a_scadere),
      totale_rischio: totaleRischio,
      doc_da_fatturare: num(c.doc_da_fatturare),
      doc_da_evadere: daEvadere,
      picco_esposizione: totaleRischio + daEvadere,
      num_insoluti: num(c.num_insoluti),
      bloccato: !!c.bloccato,
      attivo: c.attivo !== false,
      mesi_attivi: mesiAttiviMap[id] ?? 0,
      fatturato_anno_corrente: cur,
      fatturato_anno_precedente: prev,
      dinamica: calcolaDinamica(cur, prev),
      ritmo_mensile: num(t.ritmo_mensile),
      giorni_oltre_accordo: num(t.giorni_oltre_accordo),
      profilo_pagamento: t.profilo_pagamento === "patologico" ? "Patologico" : "Sano",
      coefficiente: Number(t.coefficiente ?? 1),
      fido_proposto_senza_coefficiente: num(t.fido_proposto_senza_coefficiente ?? t.fido_proposto),
      richiede_verifica: !!t.richiede_verifica,
      nota_proposta: String(t.nota_proposta ?? ""),
      sede_cinisello: !!t.sede_cinisello,
      ddt_incluso: num(t.ddt_da_fatturare),
      fido_teorico_puro: num(t.fido_teorico_puro ?? t.fido_proposto),
      pavimento_applicato: !!t.pavimento_applicato,
    });
  }

  righe.sort((a, b) => a.ragione_sociale.localeCompare(b.ragione_sociale, "it"));
  return { righe, mesiRolling };
}

const INTESTAZIONI = [
  "Codice gestionale",
  "Ragione sociale",
  "Partita IVA",
  "Sede",
  "Agente",
  "Categoria",
  "Condizione di pagamento",
  "Giorni di pagamento",
  "Fatturato nella finestra (lordo)",
  "Fido base",
  "Fido proposto",
  "Fido attuale (gestionale)",
  "Scostamento",
  "Regola applicata",
  "Scaduto",
  "A scadere",
  "Totale rischio",
  "Documenti da fatturare",
  "Documenti da evadere",
  "Picco di esposizione",
  "N. insoluti",
  "Cliente bloccato",
  "Cliente attivo",
  "Mesi attivi negli ultimi 12",
  "Fatturato anno corrente",
  "Fatturato anno precedente",
  "Dinamica",
  "Ritmo mensile",
  "Giorni oltre l'accordo",
  "Profilo di pagamento",
  "Coefficiente",
  "Fido proposto senza coefficiente",
  "Da verificare",
  "Nota sulla proposta",
  "Sede Cinisello Balsamo",
  "DDT inclusi nel fido",
  "Fido teorico puro (prima del pavimento)",
  "Pavimento su esposizione",
];

/** Indici (0-based) delle colonne da trattare come TESTO (zeri iniziali). */
const COL_TESTO = new Set([0, 2]);
/** Indici delle colonne monetarie (due decimali). */
const COL_EURO = new Set([8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 24, 25, 27, 31, 34, 36]);


function marcaTipi(ws: XLSX.WorkSheet, nRighe: number, nCol: number, offsetRiga = 1) {
  for (let r = 0; r < nRighe; r++) {
    for (let c = 0; c < nCol; c++) {
      const addr = XLSX.utils.encode_cell({ r: r + offsetRiga, c });
      const cell = ws[addr];
      if (!cell) continue;
      if (COL_TESTO.has(c)) {
        cell.t = "s";
        cell.v = String(cell.v ?? "");
        cell.z = "@";
      } else if (COL_EURO.has(c) && typeof cell.v === "number") {
        cell.t = "n";
        cell.z = "#,##0.00";
      }
    }
  }
}




export function costruisciWorkbook(
  righe: RigaExport[],
  meta: { estrattoIl: Date; mesiRolling: number | null },
): XLSX.WorkBook {
  // --- Foglio "Fido teorico"
  const aoa: any[][] = [
    INTESTAZIONI,
    ...righe.map((r) => [
      r.codice_gestionale,
      r.ragione_sociale,
      r.partita_iva,
      r.sede,
      r.agente,
      r.categoria,
      r.condizione_pagamento,
      r.giorni,
      r.fatturato_rolling,
      r.fido_base,
      r.fido_proposto,
      r.fido_attuale,
      r.scostamento,
      r.regola,
      r.scaduto,
      r.a_scadere,
      r.totale_rischio,
      r.doc_da_fatturare,
      r.doc_da_evadere,
      r.picco_esposizione,
      r.num_insoluti,
      r.bloccato ? "Sì" : "No",
      r.attivo ? "Sì" : "No",
      r.mesi_attivi,
      r.fatturato_anno_corrente,
      r.fatturato_anno_precedente,
      DINAMICA_LABEL[r.dinamica],
      r.ritmo_mensile,
      r.giorni_oltre_accordo,
      r.profilo_pagamento,
      r.coefficiente,
      r.fido_proposto_senza_coefficiente,
      r.richiede_verifica ? "Sì" : "No",
      r.nota_proposta,
      r.sede_cinisello ? "Sì" : "No",
      r.ddt_incluso,
      r.fido_teorico_puro,
      r.pavimento_applicato ? "Sì" : "No",
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: false });
  marcaTipi(ws, righe.length, INTESTAZIONI.length);

  ws["!cols"] = INTESTAZIONI.map((h, i) => ({
    wch: i === 1 ? 38 : i === 13 ? 46 : i === 33 ? 70 : Math.max(12, Math.min(26, h.length + 2)),
  }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: righe.length, c: INTESTAZIONI.length - 1 } }) };
  (ws as any)["!freeze"] = { xSplit: "0", ySplit: "1", topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };

  // --- Foglio "Riepilogo"
  const somma = (f: (r: RigaExport) => number, rows: RigaExport[] = righe) =>
    rows.reduce((a, r) => a + f(r), 0);

  const rip: any[][] = [];
  rip.push(["Riepilogo fido teorico"]);
  rip.push(["Estrazione", meta.estrattoIl.toLocaleString("it-IT")]);
  rip.push(["Finestra di calcolo (mesi)", meta.mesiRolling ?? "—"]);
  rip.push([]);
  rip.push(["Totali"]);
  rip.push(["Numero clienti", righe.length]);
  rip.push(["Somma fido base", somma((r) => r.fido_base)]);
  rip.push(["Somma fido proposto", somma((r) => r.fido_proposto)]);
  rip.push(["Somma fido attuale", somma((r) => r.fido_attuale)]);
  rip.push(["Scostamento complessivo", somma((r) => r.scostamento)]);
  rip.push([]);

  rip.push(["Per regola applicata", "Clienti", "Fido proposto"]);
  const perRegola = new Map<string, RigaExport[]>();
  for (const r of righe) {
    const k = r.regola || "—";
    if (!perRegola.has(k)) perRegola.set(k, []);
    perRegola.get(k)!.push(r);
  }
  for (const [k, rows] of [...perRegola.entries()].sort((a, b) => b[1].length - a[1].length)) {
    rip.push([k, rows.length, somma((r) => r.fido_proposto, rows)]);
  }
  rip.push([]);

  const rigaDinamica = rip.length;
  rip.push(["Per dinamica", "Clienti", "Fido base", "Fido proposto"]);
  for (const d of DINAMICHE) {
    const rows = righe.filter((r) => r.dinamica === d);
    rip.push([DINAMICA_LABEL[d], rows.length, somma((r) => r.fido_base, rows), somma((r) => r.fido_proposto, rows)]);
  }
  rip.push([]);

  const rigaFascia = rip.length;
  rip.push(["Per fascia di fido base", "Clienti", "Fido base", "Fido proposto", "Differenza"]);
  for (const f of FASCE) {
    const rows = righe.filter((r) => f.test(r.fido_base));
    const base = somma((r) => r.fido_base, rows);
    const prop = somma((r) => r.fido_proposto, rows);
    rip.push([f.label, rows.length, base, prop, prop - base]);
  }
  rip.push([]);

  const rigaProfilo = rip.length;
  rip.push(["Per profilo di pagamento", "Clienti", "Fido proposto", "Senza coefficiente"]);
  for (const p of ["Sano", "Patologico"]) {
    const rows = righe.filter((r) => r.profilo_pagamento === p);
    rip.push([p, rows.length, somma((r) => r.fido_proposto, rows), somma((r) => r.fido_proposto_senza_coefficiente, rows)]);
  }
  rip.push([]);

  const rigaCoef = rip.length;
  rip.push(["Per coefficiente", "Clienti", "Fido proposto", "Senza coefficiente"]);
  const coefficienti = [...new Set(righe.map((r) => r.coefficiente))].sort((a, b) => a - b);
  for (const k of coefficienti) {
    const rows = righe.filter((r) => r.coefficiente === k);
    rip.push([
      k.toLocaleString("it-IT"),
      rows.length,
      somma((r) => r.fido_proposto, rows),
      somma((r) => r.fido_proposto_senza_coefficiente, rows),
    ]);
  }



  const wsR = XLSX.utils.aoa_to_sheet(rip);
  for (let r = 0; r < rip.length; r++) {
    for (let c = 1; c < 5; c++) {
      const cell = wsR[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "number" && !(r === 5 && c === 1)) {
        cell.t = "n";
        if (c !== 1 || r > 10) cell.z = c === 1 ? "0" : "#,##0.00";
        else cell.z = "#,##0.00";
      }
    }
  }
  wsR["!cols"] = [{ wch: 46 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Fido teorico");
  XLSX.utils.book_append_sheet(wb, wsR, "Riepilogo");
  // Righe (1-based) da rendere in grassetto in post-produzione, per foglio.
  (wb as any).__grassetto = {
    1: [1],
    2: [1, 5, 12, rigaDinamica + 1, rigaFascia + 1, rigaProfilo + 1, rigaCoef + 1],
  };
  return wb;
}


export function nomeFileExport(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `fido-teorico-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.xlsx`;
}

/**
 * SheetJS community non scrive stili ne' riquadri bloccati: il file prodotto
 * viene quindi ritoccato a valle (aggiunta di un font grassetto, applicazione
 * alle righe di intestazione e blocco della prima riga del foglio dati).
 */
function applicaStiliEBlocco(buf: Uint8Array, grassetto: Record<number, number[]>): Uint8Array {
  const files = unzipSync(buf);
  const dec = new TextDecoder();
  const enc = new TextEncoder();

  const stylesKey = "xl/styles.xml";
  if (!files[stylesKey]) return buf;
  let styles = dec.decode(files[stylesKey]);

  // Nuovo font grassetto
  const fontsMatch = styles.match(/<fonts count="(\d+)">/);
  if (!fontsMatch) return buf;
  const nFonts = Number(fontsMatch[1]);
  styles = styles
    .replace(fontsMatch[0], `<fonts count="${nFonts + 1}">`)
    .replace("</fonts>", `<font><b/><sz val="12"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts>`);

  // Nuovo formato cella che usa il font grassetto
  const xfsMatch = styles.match(/<cellXfs count="(\d+)">/);
  if (!xfsMatch) return buf;
  const boldXf = Number(xfsMatch[1]);
  styles = styles
    .replace(xfsMatch[0], `<cellXfs count="${boldXf + 1}">`)
    .replace("</cellXfs>", `<xf numFmtId="0" fontId="${nFonts}" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>`);
  files[stylesKey] = enc.encode(styles);

  for (const [idxStr, righe] of Object.entries(grassetto)) {
    const idx = Number(idxStr);
    const key = `xl/worksheets/sheet${idx}.xml`;
    if (!files[key]) continue;
    let xml = dec.decode(files[key]);

    if (idx === 1) {
      xml = xml.replace(
        /<sheetView([^>]*)\/>/,
        `<sheetView$1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>`,
      );
    }

    for (const riga of righe) {
      const re = new RegExp(`(<row r="${riga}"[^>]*>)([\\s\\S]*?)(</row>)`);
      xml = xml.replace(re, (_m, apri: string, corpo: string, chiudi: string) => {
        const nuovo = corpo
          .replace(/<c r="([A-Z]+\d+)" s="\d+"/g, `<c r="$1" s="${boldXf}"`)
          .replace(/<c r="([A-Z]+\d+)"(?! s=)/g, `<c r="$1" s="${boldXf}"`);
        return apri + nuovo + chiudi;
      });
    }
    files[key] = enc.encode(xml);
  }

  return zipSync(files, { level: 6 });
}

export function scaricaWorkbook(wb: XLSX.WorkBook, nomeFile: string) {
  const raw = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  let out: Uint8Array = raw;
  try {
    out = applicaStiliEBlocco(raw, (wb as any).__grassetto ?? {}) as Uint8Array;
  } catch {
    out = raw; // in caso di problemi si scarica comunque il file senza stili
  }

  const blob = new Blob([out as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

