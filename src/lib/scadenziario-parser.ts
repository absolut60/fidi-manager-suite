import * as XLSX from "xlsx";

export function normalize(h: string) {
  return String(h ?? "")
    .toLowerCase()
    .replace(/[._\-/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toNum(v: unknown): number | null {
  if (v === "" || v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n == null ? null : Math.trunc(n);
}

export function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function excelDateToISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF?.parse_date_code?.(v);
    if (d) {
      const m = String(d.m).padStart(2, "0");
      const day = String(d.d).padStart(2, "0");
      return `${d.y}-${m}-${day}`;
    }
  }
  const s = String(v).trim();
  if (!s) return null;
  const m1 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m1) {
    const dd = m1[1].padStart(2, "0");
    const mm = m1[2].padStart(2, "0");
    let yy = m1[3];
    if (yy.length === 2) yy = (Number(yy) > 50 ? "19" : "20") + yy;
    return `${yy}-${mm}-${dd}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export type ScadRow = {
  idx: number;
  codice_gestionale: string;
  ragione_sociale: string;
  payload: Record<string, unknown>;
};

/* ----------------------------------------------------------------------------
 * Parser condiviso foglio ufficiale "SCADENZIARIO".
 * Intestazione COD_CLI cercata nelle prime 15 righe; dati dalla successiva.
 * -------------------------------------------------------------------------- */

const SCAD_OFFICIAL_MAP: Record<string, string> = {
  // Match cliente
  "cod cli": "codice_gestionale",
  cod_cli: "codice_gestionale",
  codcli: "codice_gestionale",
  // (Ragione Sociale: assente nel tracciato MADE_VISTASCADENZE, ma supportato per retrocompat)
  "ragione sociale": "__ragsoc",
  // Nuovo tracciato MADE_VISTASCADENZE
  keydocumento: "key_documento",
  keytipoeffetto: "key_tipo_effetto",
  "data pagamento effettiva": "data_pagamento_effettiva",
  "importo pagato": "importo_pagato",
  "importo residuo": "importo_residuo",
  "importo effetto originario": "importo_effetto_orig",
  "importo effetto orig": "importo_effetto_orig",
  // Campi documento
  "codice pagamento scad": "codice_pagamento",
  "descrizione pagamento": "descrizione_pagamento",
  "numero documento origine": "numero_documento",
  "data documento": "data_documento",
  "anno partita": "anno_partita",
  "tipologia scadenza": "tipologia_scadenza",
  "data scadenza": "data_scadenza",
  "stato contabile": "stato_contabile",
  "importo scadenza": "importo_scadenza",
  "importo documento": "importo_documento",
  "giorni ritardo": "giorni_ritardo",
  "dilazione effettiva": "dilazione_effettiva",
  "importo ritardo": "importo_ritardo",
  "data pagamento": "data_pagamento",
  "importo originario effetto": "importo_originario",
  "importo scadenza netto prev": "importo_netto_prev",
  "tempi scadenza": "tempi_scadenza",
  // Chiave sintetica (vedi normalizeOfficialHeader) per la colonna "_Tempi Scadenza"
  "__tempi scadenza": "tempi_scadenza_key",
};


// Normalizza l'header del foglio SCADENZIARIO ufficiale.
// Le colonne "Tempi Scadenza" e "_Tempi Scadenza" collidono dopo normalize()
// (gli underscore diventano spazi). Distinguiamo guardando il valore raw:
// se inizia con "_" usiamo la chiave sintetica "__tempi scadenza".
export function normalizeOfficialHeader(raw: unknown): string {
  const s = String(raw ?? "");
  const n = normalize(s);
  if (n === "tempi scadenza" && s.trim().startsWith("_")) return "__tempi scadenza";
  return n;
}

const SCAD_OFFICIAL_NUM = new Set([
  "importo_scadenza",
  "importo_documento",
  "importo_originario",
  "importo_netto_prev",
  "importo_ritardo",
  "importo_pagato",
  "importo_residuo",
  "importo_effetto_orig",
]);
const SCAD_OFFICIAL_INT = new Set([
  "giorni_ritardo",
  "dilazione_effettiva",
  "anno_partita",
  "key_tipo_effetto",
]);
const SCAD_OFFICIAL_DATE = new Set([
  "data_documento",
  "data_scadenza",
  "data_pagamento",
  "data_pagamento_effettiva",
]);


export function scanScadenziarioMeta(sheet: XLSX.WorkSheet): {
  headers: string[];
  firstDataRow: number; // 0-indexed (riga successiva all'header)
  lastRow: number; // 0-indexed last row with content
  totRowsApprox: number;
} {
  const ref = sheet["!ref"];
  if (!ref) return { headers: [], firstDataRow: 1, lastRow: 0, totRowsApprox: 0 };
  const range = XLSX.utils.decode_range(ref);
  // Scan dinamico delle prime 15 righe per trovare quella che contiene COD_CLI.
  // Il tracciato nuovo (MADE_VISTASCADENZE) ha l'header in riga 1 (r=0);
  // il vecchio (Copia_di_FORMAT_SCADENZIARIO_NEW) in riga 2 (r=1).
  const HEADER_SCAN_LIMIT = Math.min(15, range.e.r + 1);
  let headerRowIdx = -1;
  let headers: string[] = new Array(range.e.c + 1).fill("");
  for (let r = 0; r < HEADER_SCAN_LIMIT; r++) {
    const candidate: string[] = new Array(range.e.c + 1).fill("");
    for (let c = 0; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr] as XLSX.CellObject | undefined;
      candidate[c] = normalizeOfficialHeader(cell?.v);
    }
    if (candidate.some((h) => SCAD_OFFICIAL_MAP[h] === "codice_gestionale")) {
      headerRowIdx = r;
      headers = candidate;
      break;
    }
  }
  if (headerRowIdx < 0) {
    return { headers: [], firstDataRow: 1, lastRow: range.e.r, totRowsApprox: 0 };
  }
  const firstDataRow = headerRowIdx + 1;
  return {
    headers,
    firstDataRow,
    lastRow: range.e.r,
    totRowsApprox: Math.max(0, range.e.r - headerRowIdx),
  };
}


export function parseScadenziarioRangeLean(
  sheet: XLSX.WorkSheet,
  headers: string[],
  startRow0: number,
  endRow0Inclusive: number,
): {
  rows: ScadRow[];
  missing: number[];
  totRead: number;
  rowErrors: Array<{ riga: number; errore: string }>;
} {
  const ref = sheet["!ref"];
  if (!ref) return { rows: [], missing: [], totRead: 0, rowErrors: [] };
  const range = XLSX.utils.decode_range(ref);
  const startR = Math.max(0, startRow0);
  const endR = Math.min(range.e.r, endRow0Inclusive);
  const rows: ScadRow[] = [];
  const missing: number[] = [];
  const rowErrors: Array<{ riga: number; errore: string }> = [];
  let totRead = 0;
  for (let r = startR; r <= endR; r++) {
    try {
      let hasContent = false;
      const mapped: Record<string, unknown> = {};
      let ragSoc = "";
      let codiceRaw: unknown = null;
      for (let c = 0; c <= range.e.c; c++) {
        const h = headers[c];
        const field = SCAD_OFFICIAL_MAP[h];
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr] as XLSX.CellObject | undefined;
        const v = cell?.v;
        if (v != null && String(v).trim() !== "") hasContent = true;
        if (!field) continue;
        if (field === "__ragsoc") {
          ragSoc = String(v ?? "").trim();
        } else if (field === "codice_gestionale") {
          codiceRaw = v;
        } else {
          mapped[field] = v;
        }
      }
      if (!hasContent) continue;
      totRead++;
      const codice = toStr(codiceRaw);
      if (!codice) {
        missing.push(r + 1);
        continue;
      }
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(mapped)) {
        if (SCAD_OFFICIAL_NUM.has(k)) payload[k] = toNum(v);
        else if (SCAD_OFFICIAL_INT.has(k)) payload[k] = toInt(v);
        else if (SCAD_OFFICIAL_DATE.has(k)) payload[k] = excelDateToISO(v);
        else payload[k] = toStr(v);
      }
      rows.push({
        idx: r + 1,
        codice_gestionale: String(codice).replace(/\.0$/, ""),
        ragione_sociale: ragSoc,
        payload,
      });
    } catch (err) {
      // Riga malformata: skip isolato, non far cadere il chunk
      rowErrors.push({
        riga: r + 1,
        errore: `Parse riga ${r + 1}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
      });
    }
  }
  return { rows, missing, totRead, rowErrors };
}

export type DoppioneScadenziario = {
  codice_gestionale: string;
  ragione_sociale: string;
  numero_documento: unknown;
  data_scadenza: unknown;
  importo_scadenza: unknown;
  riga_scartata: number;
  riga_tenuta: number;
};

export function chiaveScadenziario(r: ScadRow): string {
  const p = r.payload;
  return JSON.stringify([r.codice_gestionale, p.key_documento ?? null,
    p.data_scadenza ?? null, p.key_tipo_effetto ?? null, p.importo_scadenza ?? null]);
}

function confrontaVersioni(a: ScadRow, b: ScadRow): number {
  const dataA = String(a.payload.data_pagamento_effettiva ?? "");
  const dataB = String(b.payload.data_pagamento_effettiva ?? "");
  if (dataA !== dataB) return dataA > dataB ? 1 : -1;
  const importoA = Math.abs(Number(a.payload.importo_pagato ?? 0));
  const importoB = Math.abs(Number(b.payload.importo_pagato ?? 0));
  if (importoA !== importoB) return importoA - importoB;
  return a.idx - b.idx;
}

export function unisciDoppioniScadenziario(rows: ScadRow[]) {
  const tenute = new Map<string, ScadRow>();
  for (const r of rows) {
    const key = chiaveScadenziario(r);
    const precedente = tenute.get(key);
    if (!precedente || confrontaVersioni(r, precedente) > 0) tenute.set(key, r);
  }
  // Una voce per ogni scarto, sempre collegata alla vincitrice definitiva (anche con 3+ righe).
  const doppioni: DoppioneScadenziario[] = [];
  for (const r of rows) {
    const tenuta = tenute.get(chiaveScadenziario(r));
    if (!tenuta || tenuta === r) continue;
    doppioni.push({ codice_gestionale: r.codice_gestionale,
      ragione_sociale: r.ragione_sociale, numero_documento: r.payload.numero_documento,
      data_scadenza: r.payload.data_scadenza, importo_scadenza: r.payload.importo_scadenza,
      riga_scartata: r.idx, riga_tenuta: tenuta.idx });
  }
  return { rows: Array.from(tenute.values()).sort((a, b) => a.idx - b.idx), doppioni };
}

export function parseOfficialScadenziarioSheet(sheet: XLSX.WorkSheet) {
  const meta = scanScadenziarioMeta(sheet);
  if (!meta.headers.length) throw new Error(
    "Intestazione COD_CLI non trovata: verifica che il foglio SCADENZIARIO abbia le intestazioni");
  const parsed = parseScadenziarioRangeLean(sheet, meta.headers, meta.firstDataRow, meta.lastRow);
  return { ...parsed, ...unisciDoppioniScadenziario(parsed.rows) };
}

export function messaggioDoppioniGamma(n: number): string {
  return `${n} righe doppie nel file Gamma: tenuta la versione più aggiornata`;
}

export function anomaliaDoppioneGamma(d: DoppioneScadenziario) {
  return {
    codice_gestionale: d.codice_gestionale,
    ragione_sociale: d.ragione_sociale,
    tipo_anomalia: "riga_doppia_gamma",
    campo: "scadenza",
    valore_attuale: JSON.stringify({ numero_documento: d.numero_documento ?? null,
      data_scadenza: d.data_scadenza ?? null, importo_scadenza: d.importo_scadenza ?? null,
      riga_excel_scartata: d.riga_scartata, riga_excel_tenuta: d.riga_tenuta }),
    valore_nuovo: `Tenuta la riga Excel ${d.riga_tenuta}; scartata la riga Excel ${d.riga_scartata}: versione più aggiornata`,
    stato: "in_attesa",
  };
}
