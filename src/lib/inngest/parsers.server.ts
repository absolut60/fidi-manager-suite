import * as XLSX from "xlsx";

/* ============================================================================
 * Helpers di conversione / normalizzazione
 * ============================================================================ */

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

export function sheetToObjects(
  sheet: XLSX.WorkSheet,
  headerKeyword: string,
): Array<Record<string, unknown> & { __row: number }> {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  const kw = normalize(headerKeyword);
  let headerIdx = -1;
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (
      row.some((c) => {
        const n = normalize(String(c ?? ""));
        return n === kw || n.startsWith(kw + " ");
      })
    ) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];
  const headers = (matrix[headerIdx] ?? []).map((c) => String(c ?? "").trim());
  const kwColIdx = headers.findIndex((h) => {
    const n = normalize(h);
    return n === kw || n.startsWith(kw + " ");
  });
  const nextRow = matrix[headerIdx + 1] ?? [];
  const nextKwCell = kwColIdx >= 0 ? String(nextRow[kwColIdx] ?? "").trim() : "";
  const looksLikeDescription = (s: string) => {
    if (!s) return true;
    if (s.length > 25 && /\s/.test(s) && !/@/.test(s) && !/^\d/.test(s)) return true;
    return false;
  };
  const skipDesc = nextKwCell === "" || looksLikeDescription(nextKwCell);
  const dataStart = skipDesc ? headerIdx + 2 : headerIdx + 1;
  const out: Array<Record<string, unknown> & { __row: number }> = [];
  for (let i = dataStart; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      if (h) obj[h] = row[j] ?? "";
    });
    out.push(Object.assign(obj, { __row: i + 1 }));
  }
  return out;
}

/* ============================================================================
 * ANAGRAFICA
 * ============================================================================ */

export const ANAG_HEADERS: Record<string, string> = {
  "ragione sociale": "ragione_sociale",
  ragionesociale: "ragione_sociale",
  denominazione: "ragione_sociale",
  "codice gestionale": "codice_gestionale",
  codice: "codice_gestionale",
  "cod gestionale": "codice_gestionale",
  "partita iva": "partita_iva",
  "p iva": "partita_iva",
  piva: "partita_iva",
  "codice fiscale": "codice_fiscale",
  cf: "codice_fiscale",
  "forma giuridica": "forma_giuridica",
  indirizzo: "indirizzo",
  via: "indirizzo",
  citta: "citta",
  città: "citta",
  cap: "cap",
  provincia: "provincia",
  prov: "provincia",
  telefono: "telefono",
  tel: "telefono",
  email: "email",
  "e mail": "email",
  mail: "email",
  pec: "pec",
  "codice sdi": "codice_sdi",
  sdi: "codice_sdi",
  "store codice": "store_codice",
  store: "store_codice",
  "punto vendita": "store_codice",
  note: "note",
};

export function anagraficaSheetToObjects(sheet: XLSX.WorkSheet) {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  if (!matrix.length) return [];
  const rowHasRagSoc = (r: unknown[] | undefined) =>
    (r ?? []).some((c) => normalize(String(c ?? "")) === "ragione sociale");
  let headerIdx = -1,
    dataStart = -1;
  if (rowHasRagSoc(matrix[0])) {
    headerIdx = 0;
    dataStart = 1;
  } else if (rowHasRagSoc(matrix[1])) {
    headerIdx = 1;
    dataStart = 3;
  } else return [];
  const headers = (matrix[headerIdx] ?? []).map((c) => String(c ?? "").trim());
  const out: Array<Record<string, string> & { __row: number }> = [];
  for (let i = dataStart; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (!h) return;
      const f = ANAG_HEADERS[normalize(h)];
      if (f) obj[f] = String(row[j] ?? "").trim();
    });
    if (!obj.ragione_sociale) continue;
    out.push(Object.assign(obj, { __row: i + 1 }));
  }
  return out;
}

/* ============================================================================
 * RISCHIO
 * ============================================================================ */

export const RISCHIO_HEADERS: Record<string, string> = {
  codice: "codice_gestionale",
  "cod cliente": "codice_gestionale",
  "codice cliente": "codice_gestionale",
  "ragione sociale": "ragione_sociale",
  "cod pag": "condizione_pagamento_cod",
  "cod pagamento": "condizione_pagamento_cod",
  "codice pagamento": "condizione_pagamento_cod",
  "descr cod pag": "condizione_pagamento_desc",
  "descrizione cod pag": "condizione_pagamento_desc",
  "descrizione pagamento": "condizione_pagamento_desc",
  "saldo contab": "saldo_contabile",
  "saldo contabile": "saldo_contabile",
  "doc da fatt": "doc_da_fatturare",
  "doc da fatturare": "doc_da_fatturare",
  "doc da evad": "doc_da_evadere",
  "doc da evadere": "doc_da_evadere",
  "eff a rischio": "effetti_a_rischio",
  "effetti a rischio": "effetti_a_rischio",
  fido: "fido_gestionale",
  "fido azienda": "fido_gestionale",
  "fido concesso": "fido_gestionale",
  "fido gestionale": "fido_gestionale",
  "totale rischio": "totale_rischio",
  "tot rischio": "totale_rischio",
  "fido residuo": "fido_residuo",
  residuo: "fido_residuo",
  scaduto: "scaduto",
  "a scadere": "a_scadere",
  "num insoluti": "num_insoluti",
  "n insoluti": "num_insoluti",
  insoluti: "num_insoluti",
  "dilaz azienda": "dilazione_concordata",
  "dilazione azienda": "dilazione_concordata",
  "dilaz concordata": "dilazione_concordata",
  "dilaz effettiva": "dilazione_effettiva",
  "dilazione effettiva": "dilazione_effettiva",
};

export type RischioRow = {
  idx: number;
  codice_gestionale: string;
  ragione_sociale: string;
  payload: Record<string, unknown>;
};

export function parseRischioSheet(sheet: XLSX.WorkSheet): {
  rows: RischioRow[];
  missing: number[];
} {
  const raw = sheetToObjects(sheet, "codice");
  const numFields = new Set([
    "saldo_contabile",
    "doc_da_fatturare",
    "doc_da_evadere",
    "effetti_a_rischio",
    "fido_gestionale",
    "totale_rischio",
    "fido_residuo",
    "scaduto",
    "a_scadere",
  ]);
  const intFields = new Set(["num_insoluti", "dilazione_concordata", "dilazione_effettiva"]);
  const rows: RischioRow[] = [];
  const missing: number[] = [];
  for (const r of raw) {
    const mapped: Record<string, unknown> = {};
    for (const k of Object.keys(r)) {
      if (k === "__row") continue;
      const f = RISCHIO_HEADERS[normalize(k)];
      if (f) mapped[f] = r[k];
    }
    const codice = toStr(mapped.codice_gestionale);
    if (!codice) {
      missing.push(r.__row);
      continue;
    }
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(mapped)) {
      if (k === "codice_gestionale" || k === "ragione_sociale") continue;
      if (numFields.has(k)) payload[k] = toNum(v);
      else if (intFields.has(k)) payload[k] = toInt(v);
      else payload[k] = toStr(v);
    }
    rows.push({
      idx: r.__row,
      codice_gestionale: codice,
      ragione_sociale: toStr(mapped.ragione_sociale) ?? "",
      payload,
    });
  }
  return { rows, missing };
}

/* ============================================================================
 * SCADENZIARIO (foglio singolo)
 * ============================================================================ */

export const SCAD_HEADERS: Record<string, string> = {
  "cod cli": "codice_gestionale",
  "codice cliente": "codice_gestionale",
  "cod cliente": "codice_gestionale",
  codice: "codice_gestionale",
  "ragione sociale": "ragione_sociale",
  "codice pagamento scad": "codice_pagamento",
  "codice pagamento": "codice_pagamento",
  "cod pag": "codice_pagamento",
  "descrizione pagamento": "descrizione_pagamento",
  "descr pagamento": "descrizione_pagamento",
  "numero documento origine": "numero_documento",
  "numero documento": "numero_documento",
  "num doc": "numero_documento",
  "sezionale documento": "sezionale",
  sezionale: "sezionale",
  "data documento": "data_documento",
  "data doc": "data_documento",
  "data scadenza": "data_scadenza",
  "anno partita": "anno_partita",
  tipologia: "tipologia_scadenza",
  "tipologia scadenza": "tipologia_scadenza",
  "importo scadenza": "importo_scadenza",
  importo: "importo_scadenza",
  "importo documento": "importo_documento",
  "importo originario": "importo_originario",
  "importo netto prev": "importo_netto_prev",
  "importo ritardo": "importo_ritardo",
  "giorni ritardo": "giorni_ritardo",
  "stato contabile": "stato_contabile",
  "data pagamento": "data_pagamento",
  "dilazione teorica": "dilazione_teorica",
  "dilazione effettiva": "dilazione_effettiva",
  "cod blocco": "cod_blocco",
  "codice blocco": "cod_blocco",
  "fido euro": "fido_euro",
  fido: "fido_euro",
  assicurazione: "assicurazione",
  sede: "sede",
  "in legale": "in_legale",
};

export type ScadRow = {
  idx: number;
  codice_gestionale: string;
  ragione_sociale: string;
  payload: Record<string, unknown>;
};

/* ----------------------------------------------------------------------------
 * Parser STRETTO foglio ufficiale "SCADENZIARIO"
 * Riga 1 ignorata (totali). Riga 2 intestazioni. Dati da riga 3.
 * -------------------------------------------------------------------------- */

const SCAD_OFFICIAL_MAP: Record<string, string> = {
  "cod cli": "codice_gestionale",
  cod_cli: "codice_gestionale",
  codcli: "codice_gestionale",
  "ragione sociale": "__ragsoc",
  "codice pagamento scad": "codice_pagamento",
  "descrizione pagamento": "descrizione_pagamento",
  "numero documento origine": "numero_documento",
  "sezionale documento": "sezionale",
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

export function findSheetByName(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet | null {
  const target = name.toLowerCase().trim();
  const sn = wb.SheetNames.find((s) => s.toLowerCase().trim() === target);
  return sn ? wb.Sheets[sn] : null;
}

export function parseScadenziarioOfficialSheet(sheet: XLSX.WorkSheet): {
  rows: ScadRow[];
  missing: number[];
  totRead: number;
} {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  if (matrix.length < 3) return { rows: [], missing: [], totRead: 0 };
  const headers = (matrix[1] ?? []).map((c) => normalizeOfficialHeader(c));
  const numFields = new Set([
    "importo_scadenza",
    "importo_documento",
    "importo_originario",
    "importo_netto_prev",
    "importo_ritardo",
  ]);
  const intFields = new Set(["giorni_ritardo", "dilazione_effettiva", "anno_partita"]);
  const dateFields = new Set(["data_documento", "data_scadenza", "data_pagamento"]);
  const rows: ScadRow[] = [];
  const missing: number[] = [];
  let totRead = 0;
  for (let i = 2; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    totRead++;
    const mapped: Record<string, unknown> = {};
    let ragSoc = "";
    headers.forEach((h, j) => {
      const field = SCAD_OFFICIAL_MAP[h];
      if (!field) return;
      if (field === "__ragsoc") {
        ragSoc = String(row[j] ?? "").trim();
        return;
      }
      mapped[field] = row[j];
    });
    const codice = toStr(mapped.codice_gestionale);
    if (!codice) {
      missing.push(i + 1);
      continue;
    }
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(mapped)) {
      if (k === "codice_gestionale") continue;
      if (numFields.has(k)) payload[k] = toNum(v);
      else if (intFields.has(k)) payload[k] = toInt(v);
      else if (dateFields.has(k)) payload[k] = excelDateToISO(v);
      else payload[k] = toStr(v);
    }
    rows.push({
      idx: i + 1,
      codice_gestionale: String(codice).replace(/\.0$/, ""),
      ragione_sociale: ragSoc,
      payload,
    });
  }
  return { rows, missing, totRead };
}

export function parseScadenziarioSimpleSheet(sheet: XLSX.WorkSheet): {
  rows: ScadRow[];
  missing: number[];
} {
  const raw = sheetToObjects(sheet, "cod cli");
  const data = raw.length ? raw : sheetToObjects(sheet, "codice");
  const numFields = new Set([
    "importo_scadenza",
    "importo_documento",
    "importo_originario",
    "importo_netto_prev",
    "importo_ritardo",
    "fido_euro",
    "assicurazione",
  ]);
  const intFields = new Set([
    "giorni_ritardo",
    "dilazione_teorica",
    "dilazione_effettiva",
    "anno_partita",
    "sede",
  ]);
  const dateFields = new Set(["data_documento", "data_scadenza", "data_pagamento"]);
  const boolFields = new Set(["in_legale"]);
  const rows: ScadRow[] = [];
  const missing: number[] = [];
  for (const r of data) {
    const mapped: Record<string, unknown> = {};
    for (const k of Object.keys(r)) {
      if (k === "__row") continue;
      const f = SCAD_HEADERS[normalize(k)];
      if (f) mapped[f] = r[k];
    }
    const codice = toStr(mapped.codice_gestionale);
    if (!codice) {
      missing.push(r.__row);
      continue;
    }
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(mapped)) {
      if (k === "codice_gestionale" || k === "ragione_sociale") continue;
      if (numFields.has(k)) payload[k] = toNum(v);
      else if (intFields.has(k)) payload[k] = toInt(v);
      else if (dateFields.has(k)) payload[k] = excelDateToISO(v);
      else if (boolFields.has(k)) {
        const s = String(v ?? "")
          .trim()
          .toLowerCase();
        payload[k] = ["true", "1", "si", "sì", "x", "y", "yes"].includes(s);
      } else payload[k] = toStr(v);
    }
    rows.push({
      idx: r.__row,
      codice_gestionale: codice,
      ragione_sociale: toStr(mapped.ragione_sociale) ?? "",
      payload,
    });
  }
  return { rows, missing };
}

/* ============================================================================
 * SCADENZIARIO + ASSICURAZIONI (file unico, due fogli)
 * ============================================================================ */

export type ScadBlockRow = {
  excelRow: number;
  cod_cli: string;
  data_scadenza: string | null;
  descrizione_pagamento: string | null;
  note_legale: string | null;
  note_solleciti: string | null;
  cod_blocco: string | null;
  importo_scadenza: number | null;
  fido_euro: number | null;
  assicurazione: number | null;
  bloccato: boolean;
};

export type AssicRow = {
  excelRow: number;
  cod_cli: string;
  data_inizio: string | null;
  data_scadenza: string | null;
  importo_assicurato: number | null;
  codice_pagamento: string | null;
};

export function parseScadenziarioBlockSheet(sheet: XLSX.WorkSheet): {
  rows: ScadBlockRow[];
  totRead: number;
} {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  const rows: ScadBlockRow[] = [];
  let currentCod: string | null = null;
  let totRead = 0;
  for (let i = 11; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    const colA = String(row[0] ?? "").trim();
    const colF = String(row[5] ?? "").trim();
    if (/totale/i.test(colA) || /bloccato\s+totale/i.test(colF)) continue;
    if (colA) {
      const m = colA.match(/-\s*(\d+)\s*$/);
      if (m) currentCod = m[1];
    }
    const data_scadenza = excelDateToISO(row[1]);
    if (!data_scadenza) continue;
    if (!currentCod) continue;
    totRead += 1;
    const descr = toStr(row[2]);
    const noteLeg = toStr(row[3]);
    const noteSoll = toStr(row[4]);
    const blocco = toStr(row[5]);
    const isBloccato = !!blocco && /bloccato/i.test(blocco);
    const cleanNote = (s: string | null) => {
      if (!s) return null;
      const t = s.trim();
      if (!t || /^\(vuoto\)$/i.test(t)) return null;
      return t;
    };
    rows.push({
      excelRow: i + 1,
      cod_cli: currentCod,
      data_scadenza,
      descrizione_pagamento: descr,
      note_legale: cleanNote(noteLeg),
      note_solleciti: cleanNote(noteSoll),
      cod_blocco: blocco,
      importo_scadenza: toNum(row[7]),
      fido_euro: toNum(row[8]),
      assicurazione: toNum(row[9]),
      bloccato: isBloccato,
    });
  }
  return { rows, totRead };
}

export function parseAssicurazioneSheet(sheet: XLSX.WorkSheet): AssicRow[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  const out: AssicRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    const cod = toStr(row[2]);
    if (!cod) continue;
    out.push({
      excelRow: i + 1,
      cod_cli: String(cod).replace(/\.0$/, ""),
      data_inizio: excelDateToISO(row[0]),
      data_scadenza: excelDateToISO(row[1]),
      importo_assicurato: toNum(row[9]),
      codice_pagamento: toStr(row[10]),
    });
  }
  return out;
}

/* ============================================================================
 * LEAN cell-by-cell parser per SCADENZIARIO (per fan-out a chunk)
 * - scanScadenziarioMeta: legge headers + conta righe non vuote
 * - parseScadenziarioRangeLean: parsa SOLO un range di righe Excel (1-indexed)
 * Entrambi usano accesso diretto a sheet[encode_cell] per evitare di
 * materializzare la matrice completa con sheet_to_json.
 * ============================================================================ */

const SCAD_OFFICIAL_NUM = new Set([
  "importo_scadenza",
  "importo_documento",
  "importo_originario",
  "importo_netto_prev",
  "importo_ritardo",
]);
const SCAD_OFFICIAL_INT = new Set(["giorni_ritardo", "dilazione_effettiva", "anno_partita"]);
const SCAD_OFFICIAL_DATE = new Set(["data_documento", "data_scadenza", "data_pagamento"]);

export function scanScadenziarioMeta(sheet: XLSX.WorkSheet): {
  headers: string[];
  firstDataRow: number; // 0-indexed (row 2 = third row)
  lastRow: number; // 0-indexed last row with content
  totRowsApprox: number;
} {
  const ref = sheet["!ref"];
  if (!ref) return { headers: [], firstDataRow: 2, lastRow: 1, totRowsApprox: 0 };
  const range = XLSX.utils.decode_range(ref);
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 1, c });
    const cell = sheet[addr] as XLSX.CellObject | undefined;
    headers.push(normalize(String(cell?.v ?? "")));
  }
  return {
    headers,
    firstDataRow: 2,
    lastRow: range.e.r,
    totRowsApprox: Math.max(0, range.e.r - 1),
  };
}

export function parseScadenziarioRangeLean(
  sheet: XLSX.WorkSheet,
  headers: string[],
  startRow0: number,
  endRow0Inclusive: number,
): { rows: ScadRow[]; missing: number[]; totRead: number } {
  const ref = sheet["!ref"];
  if (!ref) return { rows: [], missing: [], totRead: 0 };
  const range = XLSX.utils.decode_range(ref);
  const startR = Math.max(2, startRow0);
  const endR = Math.min(range.e.r, endRow0Inclusive);
  const rows: ScadRow[] = [];
  const missing: number[] = [];
  let totRead = 0;
  for (let r = startR; r <= endR; r++) {
    let hasContent = false;
    const mapped: Record<string, unknown> = {};
    let ragSoc = "";
    let codiceRaw: unknown = null;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const h = headers[c - range.s.c];
      const field = SCAD_OFFICIAL_MAP[h];
      if (!field) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr] as XLSX.CellObject | undefined;
      const v = cell?.v;
      if (v != null && String(v).trim() !== "") hasContent = true;
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
  }
  return { rows, missing, totRead };
}
