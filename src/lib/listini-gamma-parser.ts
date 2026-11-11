import * as XLSX from "xlsx";
import { normalize, toStr, excelDateToISO } from "@/lib/scadenziario-parser";

/**
 * File MADE_ARTICOLI_LISTINI_PQ.xlsx — fonte unica della lettura dei fogli (FM61).
 * Modulo browser-safe: lo usa la pagina Import/Export (in un Web Worker) per leggere il
 * file e preparare i pacchetti JSON di staging; il server NON apre più lo xlsx di questo
 * import e legge solo quei JSON. parsers.server.ts riesporta tutto per compatibilità.
 */

/* ============================================================================
 * FORNITORI (Gamma) — FM61
 * ============================================================================ */

/** Whitelist intestazioni (normalizzate) → campo di `fornitori`. Le altre colonne si ignorano. */
export const FORNITORI_HEADERS: Record<string, string> = {
  "codice fornitore": "codice_gestionale",
  "ragione sociale": "ragione_sociale",
  alias: "alias",
  valida: "valida",
  indirizzo: "indirizzo",
  cap: "cap",
  citta: "citta",
  provincia: "provincia",
  stato: "stato",
  "partita iva": "partita_iva",
  "codice fiscale": "codice_fiscale",
  "persona fisica": "persona_fisica",
  telefono: "telefono",
  "telefono 2": "telefono_2",
  cellulare: "cellulare",
  fax: "fax",
  email: "email",
  sito: "sito",
  pec: "pec",
  "codice pagamento": "condizione_pagamento_cod",
  pagamento: "condizione_pagamento_desc",
  "ultima modifica": "ultima_modifica_gamma",
  "codice anagrafica generale": "codice_anagrafica_generale",
  "codice cliente collegato": "codice_cliente_gamma",
};

export type FornitoreGammaRow = {
  riga: number;
  codice_gestionale: number;
  ragione_sociale: string | null;
  alias: string | null;
  valida: boolean | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  stato: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  persona_fisica: boolean | null;
  telefono: string | null;
  telefono_2: string | null;
  cellulare: string | null;
  fax: string | null;
  email: string | null;
  sito: string | null;
  pec: string | null;
  condizione_pagamento_cod: string | null;
  condizione_pagamento_desc: string | null;
  ultima_modifica_gamma: string | null;
  codice_anagrafica_generale: number | null;
  codice_cliente_gamma: number | null;
};

export type AnomaliaFornitoreFile = {
  riga: number;
  tipo: "codice_mancante" | "codice_duplicato";
  codice: string | null;
  ragione_sociale: string | null;
};

/** Righe del foglio fornitori: intestazione = prima riga con "Codice fornitore", dati subito sotto. */
function righeFoglioFornitori(sheet: XLSX.WorkSheet): Array<Record<string, unknown> & { __row: number }> {
  const m = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: true });
  const hi = m.findIndex((r) => (r ?? []).some((c) => normalize(String(c ?? "")) === "codice fornitore"));
  if (hi < 0) return [];
  const headers = (m[hi] ?? []).map((c) => String(c ?? "").trim());
  const out: Array<Record<string, unknown> & { __row: number }> = [];
  for (let i = hi + 1; i < m.length; i++) {
    const row = m[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    const o: Record<string, unknown> = {};
    headers.forEach((h, j) => { if (h) o[h] = row[j] ?? ""; });
    out.push(Object.assign(o, { __row: i + 1 }));
  }
  return out;
}

export const NOMI_FOGLIO_FORNITORI = ["SYNC_ANAGRAFICA_FORNITORI", "FORNITORI"];

/**
 * Foglio fornitori SOLO per nome ("SYNC_ANAGRAFICA_FORNITORI" o "FORNITORI"): nel file
 * unico anche altri fogli (es. articoli-fornitori) hanno la colonna "Codice fornitore".
 */
export function nomeFoglioFornitori(nomi: string[]): string | null {
  for (const nome of NOMI_FOGLIO_FORNITORI) {
    const sn = nomi.find((x) => x.toLowerCase().trim() === nome.toLowerCase());
    if (sn) return sn;
  }
  return null;
}

export function trovaFoglioFornitori(wb: XLSX.WorkBook): { nome: string; sheet: XLSX.WorkSheet } | null {
  const sn = nomeFoglioFornitori(wb.SheetNames);
  return sn && wb.Sheets[sn] ? { nome: sn, sheet: wb.Sheets[sn] } : null;
}

function intStretto(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isInteger(v) ? v : null;
  const s = String(v).trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

/** Data/ora di Gamma → "AAAA-MM-GGTHH:MM:SS" (ora locale del file). */
export function dataOraGamma(v: unknown): string | null {
  if (v == null || v === "") return null;
  const p2 = (n: number | string) => String(n).padStart(2, "0");
  if (typeof v === "number") {
    const d = XLSX.SSF?.parse_date_code?.(v);
    if (!d) return null;
    return `${d.y}-${p2(d.m)}-${p2(d.d)}T${p2(d.H)}:${p2(d.M)}:${p2(Math.floor(d.S))}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return `${m[3]}-${p2(m[2])}-${p2(m[1])}T${p2(m[4] ?? 0)}:${p2(m[5] ?? 0)}:${p2(m[6] ?? 0)}`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/);
  if (iso) return `${iso[1]}T${iso[2] ? (iso[2].length === 5 ? iso[2] + ":00" : iso[2]) : "00:00:00"}`;
  return null;
}

export function parseFornitoriGammaSheet(sheet: XLSX.WorkSheet): {
  rows: FornitoreGammaRow[];
  anomalie: AnomaliaFornitoreFile[];
  righeLette: number;
} {
  const grezze = righeFoglioFornitori(sheet);
  const anomalie: AnomaliaFornitoreFile[] = [];
  const perCodice = new Map<number, FornitoreGammaRow>();
  for (const g of grezze) {
    const r: Record<string, unknown> = {};
    for (const [h, v] of Object.entries(g)) {
      if (h === "__row") continue;
      const campo = FORNITORI_HEADERS[normalize(h)];
      if (campo) r[campo] = v;
    }
    const ragione = toStr(r.ragione_sociale);
    const codice = intStretto(r.codice_gestionale);
    if (codice == null) {
      anomalie.push({ riga: g.__row, tipo: "codice_mancante", codice: toStr(r.codice_gestionale), ragione_sociale: ragione });
      continue;
    }
    const riga: FornitoreGammaRow = {
      riga: g.__row,
      codice_gestionale: codice,
      ragione_sociale: ragione,
      alias: toStr(r.alias),
      valida: r.valida == null || toStr(r.valida) == null ? null : toStr(r.valida)!.toLowerCase() === "valida",
      indirizzo: toStr(r.indirizzo),
      cap: toStr(r.cap),
      citta: toStr(r.citta),
      provincia: toStr(r.provincia),
      stato: toStr(r.stato),
      partita_iva: toStr(r.partita_iva),
      codice_fiscale: toStr(r.codice_fiscale),
      persona_fisica: toStr(r.persona_fisica) == null ? null : toStr(r.persona_fisica)!.toLowerCase() === "si",
      telefono: toStr(r.telefono),
      telefono_2: toStr(r.telefono_2),
      cellulare: toStr(r.cellulare),
      fax: toStr(r.fax),
      email: toStr(r.email),
      sito: toStr(r.sito),
      pec: toStr(r.pec),
      condizione_pagamento_cod: toStr(r.condizione_pagamento_cod),
      condizione_pagamento_desc: toStr(r.condizione_pagamento_desc),
      ultima_modifica_gamma: dataOraGamma(r.ultima_modifica_gamma),
      codice_anagrafica_generale: intStretto(r.codice_anagrafica_generale),
      codice_cliente_gamma: intStretto(r.codice_cliente_gamma),
    };
    const prec = perCodice.get(codice);
    if (prec) {
      anomalie.push({ riga: prec.riga, tipo: "codice_duplicato", codice: String(codice), ragione_sociale: prec.ragione_sociale });
      perCodice.delete(codice); // tieni l'ultima, in ordine di file
    }
    perCodice.set(codice, riga);
  }
  return { rows: [...perCodice.values()], anomalie, righeLette: grezze.length };
}

/* ============================================================================
 * ARTICOLI (Gamma) — FM61 fetta 2A
 * ============================================================================ */

/** Whitelist intestazioni (normalizzate) del foglio ARTICOLI. "Fornitore pref" e "Marca" letti a parte. */
export const ARTICOLI_GAMMA_HEADERS: Record<string, string> = {
  codice: "codice",
  descrizione: "descrizione",
  "descrizione estesa": "descrizione_estesa",
  "codice famiglia": "codice_famiglia",
  famiglia: "famiglia",
  "codice sottofamiglia": "codice_sottofamiglia",
  sottofamiglia: "sottofamiglia",
  "codice marca": "marca_codice",
  marca: "marca_descrizione",
  um: "um",
  "um 2": "um2",
  "fattore conversione": "fattore_conversione",
  iva: "iva",
  "peso netto": "peso_netto",
  stato: "stato_gamma",
  "data creazione": "data_creazione_gamma",
  "data ultimo aggiornamento": "data_aggiornamento_gamma",
  "premio fornitore": "premio_fornitore",
  "codice a barre": "codice_a_barre",
  "codice fornitore pref": "fornitore_pref_codice",
  "codice articolo fornitore": "codice_articolo_fornitore",
  "n fornitori": "n_fornitori",
  "costo ultimo": "costo_ultimo",
  "costo medio": "costo_medio",
  "costo fifo": "costo_fifo",
  "prezzo l10 lombardia": "p10",
  "prezzo l20 piemonte": "p20",
  "prezzo l30 applicatori": "p30",
  "prezzo l9": "p9",
  "costo listino acq l10": "c10",
  "costo listino acq l20": "c20",
  "costo listino acq l30": "c30",
  "costo listino acq l9": "c9",
};

export type ListinoArticoloGamma = { listino: 9 | 10 | 20 | 30; prezzo_vendita: number | null; costo_acquisto: number | null };

export type ArticoloGammaRow = {
  riga: number;
  codice: string;
  descrizione: string | null;
  descrizione_estesa: string | null;
  codice_famiglia: string | null;
  famiglia: string | null;
  codice_sottofamiglia: string | null;
  sottofamiglia: string | null;
  marca_codice: string | null;
  um: string | null;
  um2: string | null;
  fattore_conversione: number | null;
  iva: string | null;
  peso_netto: number | null;
  stato_gamma: "in_uso" | "in_esaurimento" | null;
  data_creazione_gamma: string | null;
  data_aggiornamento_gamma: string | null;
  premio_fornitore: string | null;
  codice_a_barre: string | null;
  fornitore_pref_codice: number | null;
  codice_articolo_fornitore: string | null;
  n_fornitori: number | null;
  costo_ultimo: number | null;
  costo_medio: number | null;
  costo_fifo: number | null;
  listini: ListinoArticoloGamma[];
};

export type AnomaliaArticoloFile = {
  riga: number;
  tipo: "codice_mancante" | "codice_duplicato";
  codice: string | null;
  descrizione: string | null;
};

/** Foglio articoli SOLO per nome "ARTICOLI". */
export function nomeFoglioArticoli(nomi: string[]): string | null {
  return nomi.find((x) => x.trim().toUpperCase() === "ARTICOLI") ?? null;
}

export function trovaFoglioArticoli(wb: XLSX.WorkBook): { nome: string; sheet: XLSX.WorkSheet } | null {
  const sn = nomeFoglioArticoli(wb.SheetNames);
  return sn && wb.Sheets[sn] ? { nome: sn, sheet: wb.Sheets[sn] } : null;
}

/** Numero da cella Gamma: numeri così come sono; testo italiano ("1.234,5") o con punto decimale ("12.5"). */
export function numeroGamma(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : null;
}

function statoArticoloGamma(v: unknown): "in_uso" | "in_esaurimento" | null {
  const s = toStr(v)?.toLowerCase();
  if (s === "in uso") return "in_uso";
  if (s === "in esaurimento") return "in_esaurimento";
  return null;
}

/** Righe del foglio: intestazione = prima riga con una cella "Codice" esatta, dati subito sotto. */
function righeFoglioArticoli(sheet: XLSX.WorkSheet): Array<Record<string, unknown> & { __row: number }> {
  const m = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: true });
  const hi = m.findIndex((r) => (r ?? []).some((c) => normalize(String(c ?? "")) === "codice"));
  if (hi < 0) return [];
  const headers = (m[hi] ?? []).map((c) => String(c ?? "").trim());
  const out: Array<Record<string, unknown> & { __row: number }> = [];
  for (let i = hi + 1; i < m.length; i++) {
    const row = m[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    const o: Record<string, unknown> = {};
    headers.forEach((h, j) => { if (h) o[h] = row[j] ?? ""; });
    out.push(Object.assign(o, { __row: i + 1 }));
  }
  return out;
}

export function parseArticoliGammaSheet(sheet: XLSX.WorkSheet): {
  rows: ArticoloGammaRow[];
  marche: Array<{ codice: string; descrizione: string | null }>;
  anomalie: AnomaliaArticoloFile[];
  righeLette: number;
} {
  const grezze = righeFoglioArticoli(sheet);
  const anomalie: AnomaliaArticoloFile[] = [];
  const perCodice = new Map<string, ArticoloGammaRow>();
  const marche = new Map<string, string | null>();
  for (const g of grezze) {
    const r: Record<string, unknown> = {};
    for (const [h, v] of Object.entries(g)) {
      if (h === "__row") continue;
      const campo = ARTICOLI_GAMMA_HEADERS[normalize(h)];
      if (campo) r[campo] = v;
    }
    const codice = toStr(r.codice);
    const descrizione = toStr(r.descrizione);
    if (!codice) {
      anomalie.push({ riga: g.__row, tipo: "codice_mancante", codice: null, descrizione });
      continue;
    }
    const marca = toStr(r.marca_codice);
    if (marca && (!marche.has(marca) || marche.get(marca) == null)) marche.set(marca, toStr(r.marca_descrizione));
    const listini: ListinoArticoloGamma[] = [];
    for (const l of [10, 20, 30, 9] as const) {
      const prezzo = numeroGamma(r[`p${l}`]);
      const costo = numeroGamma(r[`c${l}`]);
      if (prezzo != null || costo != null) listini.push({ listino: l, prezzo_vendita: prezzo, costo_acquisto: costo });
    }
    const forn = toStr(r.fornitore_pref_codice);
    const riga: ArticoloGammaRow = {
      riga: g.__row,
      codice,
      descrizione,
      descrizione_estesa: toStr(r.descrizione_estesa),
      codice_famiglia: toStr(r.codice_famiglia),
      famiglia: toStr(r.famiglia),
      codice_sottofamiglia: toStr(r.codice_sottofamiglia),
      sottofamiglia: toStr(r.sottofamiglia),
      marca_codice: marca,
      um: toStr(r.um)?.toUpperCase() ?? null,
      um2: toStr(r.um2)?.toUpperCase() ?? null,
      fattore_conversione: numeroGamma(r.fattore_conversione),
      iva: toStr(r.iva),
      peso_netto: numeroGamma(r.peso_netto),
      stato_gamma: statoArticoloGamma(r.stato_gamma),
      data_creazione_gamma: excelDateToISO(r.data_creazione_gamma),
      data_aggiornamento_gamma: excelDateToISO(r.data_aggiornamento_gamma),
      premio_fornitore: toStr(r.premio_fornitore),
      codice_a_barre: toStr(r.codice_a_barre),
      fornitore_pref_codice: forn && /^\d+$/.test(forn) ? Number(forn) : null,
      codice_articolo_fornitore: toStr(r.codice_articolo_fornitore),
      n_fornitori: (() => { const n = numeroGamma(r.n_fornitori); return n == null ? null : Math.trunc(n); })(),
      costo_ultimo: numeroGamma(r.costo_ultimo),
      costo_medio: numeroGamma(r.costo_medio),
      costo_fifo: numeroGamma(r.costo_fifo),
      listini,
    };
    const prec = perCodice.get(codice);
    if (prec) {
      anomalie.push({ riga: prec.riga, tipo: "codice_duplicato", codice, descrizione: prec.descrizione });
      perCodice.delete(codice);
    }
    perCodice.set(codice, riga);
  }
  return {
    rows: [...perCodice.values()],
    marche: [...marche.entries()].map(([codice, descrizione]) => ({ codice, descrizione })),
    anomalie,
    righeLette: grezze.length,
  };
}

/* ============================================================================
 * Preparazione dello staging (browser): un preparatore per foglio gestito
 * ============================================================================ */

export type PreparazioneFoglio = {
  righe: unknown[];
  righeLette: number;
  anomalie: unknown[];
  /** Codici presenti nel file (per la disattivazione degli assenti). */
  codici: Array<string | number>;
  meta: Record<string, unknown>;
};

/**
 * Preparatore di un foglio. Aggiungere un foglio = un preparatore qui + un esecutore
 * in listini-gamma/gestori.server.ts con la stessa chiave. L'ordine di questo elenco
 * è l'ordine fisso di esecuzione (articoli DOPO fornitori: serve il fornitore preferenziale).
 */
export type PreparatoreFoglio = {
  chiave: string;
  etichetta: string;
  /** Righe per pacchetto: lo staging è già diviso così. */
  lotto: number;
  trovaNome: (nomi: string[]) => string | null;
  prepara: (sheet: XLSX.WorkSheet) => PreparazioneFoglio;
};

export const PREPARATORI_LISTINI_GAMMA: PreparatoreFoglio[] = [
  {
    chiave: "fornitori",
    etichetta: "Fornitori",
    lotto: 500,
    trovaNome: nomeFoglioFornitori,
    prepara: (sheet) => {
      const r = parseFornitoriGammaSheet(sheet);
      return {
        righe: r.rows.map(({ riga: _riga, ...resto }) => resto),
        righeLette: r.righeLette,
        anomalie: r.anomalie,
        codici: r.rows.map((x) => x.codice_gestionale),
        meta: {},
      };
    },
  },
  {
    chiave: "articoli",
    etichetta: "Articoli",
    lotto: 1000,
    trovaNome: nomeFoglioArticoli,
    prepara: (sheet) => {
      const r = parseArticoliGammaSheet(sheet);
      return {
        righe: r.rows.map(({ riga: _riga, ...resto }) => resto),
        righeLette: r.righeLette,
        anomalie: r.anomalie,
        codici: r.rows.map((x) => x.codice),
        meta: { marche: r.marche },
      };
    },
  },
];

/** Nomi dei file di staging, relativi a `_staging/<importazioneId>/` (stessi per browser e server). */
export const fileLottoListini = (chiave: string, i: number) => `listini-${chiave}-${String(i).padStart(3, "0")}.json`;
export const fileExtraListini = (chiave: string, nome: "anomalie" | "codici" | "meta") => `listini-${chiave}-${nome}.json`;

export type FoglioPreparato = {
  chiave: string;
  foglio: string;
  righe: number;
  righeLette: number;
  anomalie: number;
  lotti: number;
  lotto: number;
  /** Lettura del foglio non riuscita nel browser: il foglio risulterà "Non completato". */
  errore?: string;
};

/** Passato nell'evento Inngest: elenco dei fogli e numero di pacchetti per foglio. */
export type ManifestListini = { fogli: FoglioPreparato[]; nonGestiti: string[] };

export type PacchettoListini = { nome: string; json: string };

export const LIMITE_LOTTI_FOGLIO = 1000;

/**
 * Legge il file una volta (solo i fogli con preparatore) e produce manifest + pacchetti
 * JSON pronti da caricare. Un foglio che non si legge non ferma gli altri.
 */
export function preparaFileListiniGamma(buf: ArrayBuffer): { manifest: ManifestListini; pacchetti: PacchettoListini[] } {
  const nomi = XLSX.read(buf, { type: "array", bookSheets: true }).SheetNames;
  const assegnati = PREPARATORI_LISTINI_GAMMA.map((p) => ({ p, nome: p.trovaNome(nomi) }));
  const usati = new Set(assegnati.map((a) => a.nome).filter(Boolean) as string[]);
  const manifest: ManifestListini = { fogli: [], nonGestiti: nomi.filter((n) => !usati.has(n)) };
  const pacchetti: PacchettoListini[] = [];
  if (!usati.size) return { manifest, pacchetti };

  const wb = XLSX.read(buf, {
    type: "array", sheets: [...usati], dense: true,
    cellFormula: false, cellHTML: false, cellStyles: false, cellText: false,
  });
  for (const { p, nome } of assegnati) {
    if (!nome) continue;
    try {
      const sheet = wb.Sheets[nome];
      if (!sheet) throw new Error(`Foglio ${nome} non leggibile`);
      const r = p.prepara(sheet);
      const lotti = Math.ceil(r.righe.length / p.lotto);
      if (lotti > LIMITE_LOTTI_FOGLIO) throw new Error(`Troppe righe (${r.righe.length})`);
      for (let i = 0; i < lotti; i++) {
        pacchetti.push({ nome: fileLottoListini(p.chiave, i), json: JSON.stringify(r.righe.slice(i * p.lotto, (i + 1) * p.lotto)) });
      }
      pacchetti.push(
        { nome: fileExtraListini(p.chiave, "anomalie"), json: JSON.stringify(r.anomalie) },
        { nome: fileExtraListini(p.chiave, "codici"), json: JSON.stringify(r.codici) },
        { nome: fileExtraListini(p.chiave, "meta"), json: JSON.stringify(r.meta) },
      );
      manifest.fogli.push({ chiave: p.chiave, foglio: nome, righe: r.righe.length, righeLette: r.righeLette, anomalie: r.anomalie.length, lotti, lotto: p.lotto });
    } catch (e) {
      manifest.fogli.push({
        chiave: p.chiave, foglio: nome, righe: 0, righeLette: 0, anomalie: 0, lotti: 0, lotto: p.lotto,
        errore: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { manifest, pacchetti };
}
