import * as XLSX from "xlsx";
import { md5 } from "./md5";
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
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}T${p2(v.getHours())}:${p2(v.getMinutes())}:${p2(v.getSeconds())}`;
  }
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
 * DEPOSITI, GIACENZE_DEPOSITO, ARTICOLI_FORNITORI (Gamma) — FM61 fetta 3A
 * ============================================================================ */

type RigaGrezza = Record<string, unknown> & { __row: number };

/** Righe di un foglio: intestazione = prima riga che contiene `chiaveIntestazione` (normalizzata). */
function righeFoglioConIntestazione(sheet: XLSX.WorkSheet, chiaveIntestazione: string, whitelist: Record<string, string>): Array<Record<string, unknown> & { __row: number }> {
  const m = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: true });
  const hi = m.findIndex((r) => (r ?? []).some((c) => normalize(String(c ?? "")) === chiaveIntestazione));
  if (hi < 0) return [];
  const campi = (m[hi] ?? []).map((c) => whitelist[normalize(String(c ?? ""))] ?? null);
  const out: RigaGrezza[] = [];
  for (let i = hi + 1; i < m.length; i++) {
    const row = m[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    const o: Record<string, unknown> = {};
    campi.forEach((c, j) => { if (c) o[c] = row[j] ?? ""; });
    out.push(Object.assign(o, { __row: i + 1 }));
  }
  return out;
}

const foglioPerNome = (nome: string) => (nomi: string[]) => nomi.find((x) => x.trim().toUpperCase() === nome) ?? null;
export const nomeFoglioDepositi = foglioPerNome("DEPOSITI");
export const nomeFoglioGiacenze = foglioPerNome("GIACENZE_DEPOSITO");
export const nomeFoglioArticoliFornitori = foglioPerNome("ARTICOLI_FORNITORI");

export type AnomaliaChiaveFile = {
  riga: number;
  tipo: "codice_mancante" | "chiave_duplicata" | "valore_non_valido";
  codice: string | null;
  dettaglio: string | null;
};

export const DEPOSITI_HEADERS: Record<string, string> = {
  deposito: "codice",
  descrizione: "descrizione",
  "codice sede": "codice_sede",
  "sede in gamma": "sede_gamma",
  tipo: "tipo",
  "conta in disponibilita sede": "conta_disponibilita",
};

export type DepositoGammaRow = {
  riga: number;
  codice: string;
  descrizione: string | null;
  codice_sede: number | null;
  sede_gamma: number | null;
  tipo: string | null;
  conta_disponibilita: "si" | "no" | "logistica_comune";
};

/** "Si" → si, "No" → no, "Logistica comune" → logistica_comune; altro → null (anomalia). */
export function contaDisponibilitaGamma(v: unknown): DepositoGammaRow["conta_disponibilita"] | null {
  const s = normalize(String(v ?? ""));
  if (s === "si" || s === "sì") return "si";
  if (s === "no") return "no";
  if (s === "logistica comune") return "logistica_comune";
  return null;
}

function intGamma(v: unknown): number | null {
  const n = numeroGamma(v);
  return n == null || !Number.isInteger(n) ? null : n;
}

export function parseDepositiGammaSheet(sheet: XLSX.WorkSheet) {
  const grezze = righeFoglioConIntestazione(sheet, "deposito", DEPOSITI_HEADERS);
  const anomalie: AnomaliaChiaveFile[] = [];
  const perCodice = new Map<string, DepositoGammaRow>();
  for (const g of grezze) {
    const codice = toStr(g.codice);
    if (!codice) { anomalie.push({ riga: g.__row, tipo: "codice_mancante", codice: null, dettaglio: toStr(g.descrizione) }); continue; }
    const conta = contaDisponibilitaGamma(g.conta_disponibilita);
    if (!conta) {
      anomalie.push({ riga: g.__row, tipo: "valore_non_valido", codice, dettaglio: `Conta in disponibilita sede: ${toStr(g.conta_disponibilita) ?? "(vuoto)"}` });
      continue;
    }
    const riga: DepositoGammaRow = {
      riga: g.__row, codice, descrizione: toStr(g.descrizione),
      codice_sede: intGamma(g.codice_sede), sede_gamma: intGamma(g.sede_gamma), tipo: toStr(g.tipo), conta_disponibilita: conta,
    };
    const prec = perCodice.get(codice);
    if (prec) { anomalie.push({ riga: prec.riga, tipo: "chiave_duplicata", codice, dettaglio: prec.descrizione }); perCodice.delete(codice); }
    perCodice.set(codice, riga);
  }
  return { rows: [...perCodice.values()], anomalie, righeLette: grezze.length };
}

export const GIACENZE_HEADERS: Record<string, string> = {
  codice: "articolo_codice",
  deposito: "deposito_codice",
  giacenza: "giacenza",
  "impegnato clienti": "impegnato_clienti",
  "ordinato fornitori": "ordinato_fornitori",
  disponibilita: "disponibilita",
  "aggiornato il": "aggiornato_gamma",
};

export type GiacenzaGammaRow = {
  riga: number;
  articolo_codice: string;
  deposito_codice: string;
  giacenza: number | null;
  impegnato_clienti: number | null;
  ordinato_fornitori: number | null;
  /** Calcolata da Gamma (Giacenza − Impegnato + Ordinato): salvata com'è. */
  disponibilita: number | null;
  aggiornato_gamma: string | null;
};

export function parseGiacenzeGammaSheet(sheet: XLSX.WorkSheet) {
  const grezze = righeFoglioConIntestazione(sheet, "codice", GIACENZE_HEADERS);
  const anomalie: AnomaliaChiaveFile[] = [];
  const perChiave = new Map<string, GiacenzaGammaRow>();
  for (const g of grezze) {
    const art = toStr(g.articolo_codice);
    const dep = toStr(g.deposito_codice);
    if (!art || !dep) {
      anomalie.push({ riga: g.__row, tipo: "codice_mancante", codice: art, dettaglio: art ? "Deposito mancante" : "Codice articolo mancante" });
      continue;
    }
    const riga: GiacenzaGammaRow = {
      riga: g.__row, articolo_codice: art, deposito_codice: dep,
      giacenza: numeroGamma(g.giacenza), impegnato_clienti: numeroGamma(g.impegnato_clienti),
      ordinato_fornitori: numeroGamma(g.ordinato_fornitori), disponibilita: numeroGamma(g.disponibilita),
      aggiornato_gamma: dataOraGamma(g.aggiornato_gamma),
    };
    const k = `${art}\u0000${dep}`;
    const prec = perChiave.get(k);
    if (prec) { anomalie.push({ riga: prec.riga, tipo: "chiave_duplicata", codice: art, dettaglio: `Deposito ${dep}` }); perChiave.delete(k); }
    perChiave.set(k, riga);
  }
  return { rows: [...perChiave.values()], anomalie, righeLette: grezze.length };
}

export const ARTICOLI_FORNITORI_HEADERS: Record<string, string> = {
  codice: "articolo_codice",
  "codice fornitore": "fornitore_codice",
  preferenziale: "preferenziale",
  "codice articolo fornitore": "codice_articolo_fornitore",
};

export type ArticoloFornitoreGammaRow = {
  riga: number;
  articolo_codice: string;
  fornitore_codice: number;
  preferenziale: boolean;
  codice_articolo_fornitore: string | null;
};

export function parseArticoliFornitoriGammaSheet(sheet: XLSX.WorkSheet) {
  const grezze = righeFoglioConIntestazione(sheet, "codice fornitore", ARTICOLI_FORNITORI_HEADERS);
  const anomalie: AnomaliaChiaveFile[] = [];
  const perChiave = new Map<string, ArticoloFornitoreGammaRow>();
  for (const g of grezze) {
    const art = toStr(g.articolo_codice);
    const forn = intStretto(typeof g.fornitore_codice === "string" ? g.fornitore_codice.trim() : g.fornitore_codice);
    if (!art || forn == null) {
      anomalie.push({ riga: g.__row, tipo: "codice_mancante", codice: art, dettaglio: art ? `Codice fornitore non valido: ${toStr(g.fornitore_codice) ?? "(vuoto)"}` : "Codice articolo mancante" });
      continue;
    }
    const riga: ArticoloFornitoreGammaRow = {
      riga: g.__row, articolo_codice: art, fornitore_codice: forn,
      preferenziale: numeroGamma(g.preferenziale) === 1,
      codice_articolo_fornitore: toStr(g.codice_articolo_fornitore),
    };
    // Chiave completa: lo stesso fornitore può avere più codici articolo fornitore per lo stesso articolo.
    const caf = riga.codice_articolo_fornitore ?? "";
    const k = `${art}\u0000${forn}\u0000${caf}`;
    const prec = perChiave.get(k);
    if (prec) {
      // Doppione vero: tiene la preferenziale se c'è, altrimenti l'ultima riga.
      const tieni = prec.preferenziale && !riga.preferenziale ? prec : riga;
      const scartata = tieni === prec ? riga : prec;
      anomalie.push({ riga: scartata.riga, tipo: "chiave_duplicata", codice: art, dettaglio: `Fornitore ${forn}, codice articolo fornitore ${caf || "(vuoto)"}` });
      perChiave.delete(k);
      perChiave.set(k, tieni);
      continue;
    }
    perChiave.set(k, riga);
  }
  return { rows: [...perChiave.values()], anomalie, righeLette: grezze.length };
}

/* ============================================================================
 * REGOLE PREZZO GAMMA — FM61 fetta 3B (import fedele, nessun calcolo)
 * ============================================================================ */

/** testo: trim, '' → null · testo_vuoto: trim, '' resta '' · int/num · data (AAAA-MM-GG, senza ora). */
type TipoCampoRegola = "testo" | "testo_vuoto" | "int" | "num" | "data";

export type FoglioRegolaPrezzo = {
  /** Chiave del gestore e nome della tabella di destinazione. */
  chiave: string;
  tabella: string;
  foglio: string;
  etichetta: string;
  /** Intestazione normalizzata → [colonna, tipo]. */
  campi: Record<string, [string, TipoCampoRegola]>;
  /** Colonna chiave obbligatoria (e unica). */
  pk: string;
  /**
   * Intestazione (normalizzata) che individua la riga di intestazione. Se assente si usa
   * quella della pk. I fogli senza colonna Id nel file hanno `pkRiga`: id = numero di riga.
   */
  intestazione?: string;
  pkRiga?: boolean;
};

const sc = (n: number, tipo: TipoCampoRegola = "num"): Record<string, [string, TipoCampoRegola]> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`sc${i + 1}`, [`sc${i + 1}`, tipo]]));
const validita = { "valido dal": ["valido_dal", "data"], "valido al": ["valido_al", "data"] } as Record<string, [string, TipoCampoRegola]>;

export const FOGLI_REGOLE_PREZZO: FoglioRegolaPrezzo[] = [
  {
    chiave: "listini_priorita", tabella: "listini_priorita_gamma", foglio: "PRIORITA_LISTINI", etichetta: "Priorità listini", pk: "priorita",
    campi: {
      priorita: ["priorita", "int"], "priorità": ["priorita", "int"], "tipo listino": ["tipo_listino", "testo"], livello: ["livello", "testo"],
      "gestione prezzo": ["gestione_prezzo", "int"], ...sc(6, "int"), "sconto importo": ["sconto_importo", "int"],
      mag1: ["mag1", "int"], mag2: ["mag2", "int"], "magg importo": ["magg_importo", "int"],
    },
  },
  {
    chiave: "clienti_condizioni", tabella: "clienti_condizioni_gamma", foglio: "CLIENTI_LISTINO", etichetta: "Condizioni clienti", pk: "cliente_codice",
    campi: {
      cliente: ["cliente_codice", "int"], listino: ["listino", "int"], macrocategoria: ["macrocategoria", "testo"],
      categoria: ["categoria", "testo"], sottocategoria: ["sottocategoria", "testo"],
      "listino piu articoli": ["listino_piu_articoli", "testo"], "listino più articoli": ["listino_piu_articoli", "testo"],
      "sc1 cliente": ["sc1_cliente", "num"], "sc2 cliente": ["sc2_cliente", "num"], "sc3 cliente": ["sc3_cliente", "num"],
      "sconto piede": ["sconto_piede", "num"],
    },
  },
  {
    chiave: "sconti_categoria", tabella: "sconti_categoria_gamma", foglio: "SCONTI_CATEGORIA", etichetta: "Sconti per categoria", pk: "id", intestazione: "macrocategoria", pkRiga: true,
    campi: {
      macrocategoria: ["macrocategoria", "testo"], categoria: ["categoria", "testo"],
      sottocategoria: ["sottocategoria", "testo_vuoto"], listino: ["listino", "int"], ...validita,
      sc1: ["sc1", "num"], sc2: ["sc2", "num"], sc4: ["sc4", "num"], "sconto importo": ["sconto_importo", "num"],
      mag1: ["mag1", "num"], mag2: ["mag2", "num"], "magg importo": ["magg_importo", "num"],
    },
  },
  {
    chiave: "sconti_cliente_famiglia", tabella: "sconti_cliente_famiglia_gamma", foglio: "SCONTI_CLIENTE_FAMIGLIA", etichetta: "Sconti cliente per famiglia", pk: "id", intestazione: "cliente", pkRiga: true,
    campi: {
      cliente: ["cliente_codice", "int"],
      ...Object.fromEntries(["da", "a"].flatMap((p) => ["famiglia", "sottofamiglia", "gruppo", "sottogruppo"].map((x) => [`${p} ${x}`, [`${p}_${x}`, "testo"]]))),
      ...validita, ...sc(6),
    },
  },
  {
    chiave: "listino_piu_articoli", tabella: "listino_piu_articoli_gamma", foglio: "LISTINO_PIU_ARTICOLI", etichetta: "Listino più articoli", pk: "id", intestazione: "codice listino", pkRiga: true,
    campi: {
      "codice listino": ["codice_listino", "testo"], codice: ["articolo_codice", "testo"], ...validita,
      prezzo: ["prezzo", "num"], sc1: ["sc1", "num"],
    },
  },
  {
    chiave: "prezzi_cliente_articolo", tabella: "prezzi_cliente_articolo_gamma", foglio: "PREZZI_CLIENTE_ARTICOLO", etichetta: "Prezzi cliente-articolo", pk: "id", intestazione: "cliente", pkRiga: true,
    campi: {
      cliente: ["cliente_codice", "int"], codice: ["articolo_codice", "testo"], ...validita,
      prezzo: ["prezzo", "num"], ...sc(6), "sconto importo": ["sconto_importo", "num"], mag1: ["mag1", "num"],
    },
  },
  {
    chiave: "prezzi_deposito", tabella: "prezzi_deposito_gamma", foglio: "PREZZI_DEPOSITO", etichetta: "Prezzi per deposito", pk: "id", intestazione: "codice", pkRiga: true,
    campi: {
      codice: ["articolo_codice", "testo"], listino: ["listino", "int"], deposito: ["deposito_codice", "testo"],
      "valido dal": ["valido_dal", "data"], prezzo: ["prezzo", "num"], sc1: ["sc1", "num"], sc2: ["sc2", "num"], sc3: ["sc3", "num"],
      mag1: ["mag1", "num"], "prezzo netto": ["prezzo_netto", "num"],
    },
  },
];

function valoreRegola(v: unknown, tipo: TipoCampoRegola): unknown {
  switch (tipo) {
    case "testo": return toStr(v);
    case "testo_vuoto": return v == null ? "" : String(v).trim();
    case "int": return intGamma(typeof v === "string" ? v.trim() : v);
    case "num": return numeroGamma(v);
    case "data": return dataOraGamma(v)?.slice(0, 10) ?? null;
  }
}

/** Righe di un foglio regole: whitelist delle colonne, chiave obbligatoria; chiave ripetuta → tenuta l'ultima (anomalia). */
export function parseRegolaPrezzoSheet(def: FoglioRegolaPrezzo, sheet: XLSX.WorkSheet) {
  const intestazione = def.intestazione ?? Object.entries(def.campi).find(([, [c]]) => c === def.pk)![0];
  const whitelist = Object.fromEntries(Object.keys(def.campi).map((h) => [h, h]));
  const grezze = righeFoglioConIntestazione(sheet, intestazione, whitelist);
  const anomalie: AnomaliaChiaveFile[] = [];
  // Mai scarti silenziosi: foglio con righe ma senza intestazione riconosciuta → anomalia.
  if (!grezze.length) {
    const m = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
    if (m.some((r) => (r ?? []).some((c) => String(c ?? "").trim() !== ""))) {
      anomalie.push({ riga: 0, tipo: "valore_non_valido", codice: null, dettaglio: `${def.foglio}: intestazione "${intestazione}" non trovata, nessuna riga letta` });
    }
  }
  const perChiave = new Map<string, Record<string, unknown> & { riga: number }>();
  for (const g of grezze) {
    const riga: Record<string, unknown> & { riga: number } = { riga: g.__row };
    if (def.pkRiga) riga[def.pk] = g.__row;
    // Ordine fisso delle colonne (prima occorrenza), così il JSON è stabile.
    for (const [h, [col, tipo]] of Object.entries(def.campi)) {
      if (h in g) riga[col] = valoreRegola(g[h], tipo);
      else if (!(col in riga)) riga[col] = tipo === "testo_vuoto" ? "" : null;
    }
    const k = riga[def.pk];
    if (k == null) {
      anomalie.push({ riga: g.__row, tipo: "codice_mancante", codice: null, dettaglio: `${def.foglio}: ${def.pk} mancante` });
      continue;
    }
    const chiave = String(k);
    const prec = perChiave.get(chiave);
    if (prec) { anomalie.push({ riga: prec.riga, tipo: "chiave_duplicata", codice: chiave, dettaglio: `${def.foglio}: ${def.pk} ripetuto` }); perChiave.delete(chiave); }
    perChiave.set(chiave, riga);
  }
  return { rows: [...perChiave.values()], anomalie, righeLette: grezze.length };
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

/**
 * Impronta della riga importata (hash_riga): md5 del JSON dei soli campi importati, nell'ordine
 * fisso del parser. Le RPC riscrivono solo le righe con impronta diversa o nuove.
 */
function conImpronta<T extends object>(righe: T[]): Array<T & { hash_riga: string }> {
  return righe.map((x) => ({ ...x, hash_riga: md5(JSON.stringify(x)) }));
}

export const PREPARATORI_LISTINI_GAMMA: PreparatoreFoglio[] = [
  {
    chiave: "fornitori",
    etichetta: "Fornitori",
    lotto: 3000, // un solo pacchetto (~2.500 fornitori)
    trovaNome: nomeFoglioFornitori,
    prepara: (sheet) => {
      const r = parseFornitoriGammaSheet(sheet);
      return {
        righe: conImpronta(r.rows.map(({ riga: _riga, ...resto }) => resto)),
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
        righe: conImpronta(r.rows.map(({ riga: _riga, ...resto }) => resto)),
        righeLette: r.righeLette,
        anomalie: r.anomalie,
        codici: r.rows.map((x) => x.codice),
        meta: { marche: r.marche },
      };
    },
  },
  ...([
    ["depositi", "Depositi", 1000, nomeFoglioDepositi, parseDepositiGammaSheet],
    ["giacenze", "Giacenze per deposito", 5000, nomeFoglioGiacenze, parseGiacenzeGammaSheet],
    ["articoli_fornitori", "Articoli-fornitori", 5000, nomeFoglioArticoliFornitori, parseArticoliFornitoriGammaSheet],
  ] as const).map(([chiave, etichetta, lotto, trovaNome, parse]): PreparatoreFoglio => ({
    chiave, etichetta, lotto, trovaNome,
    prepara: (sheet) => {
      const r = parse(sheet);
      return {
        righe: ((righe) => (chiave === "depositi" ? righe : conImpronta(righe)))(
          (r.rows as Array<{ riga: number }>).map(({ riga: _riga, ...resto }) => resto),
        ),
        righeLette: r.righeLette,
        anomalie: r.anomalie,
        // Depositi: codici del file per disattivare gli assenti (le fotografie non ne hanno bisogno).
        codici: chiave === "depositi" ? (r.rows as Array<{ codice: string }>).map((x) => x.codice) : [],
        meta: {},
      };
    },
  })),
  // Regole prezzo (3B): lotti ≤ 5000 + chiusura finale sul server (come le giacenze).
  ...FOGLI_REGOLE_PREZZO.map((def): PreparatoreFoglio => ({
    chiave: def.chiave, etichetta: def.etichetta, lotto: 5000, trovaNome: foglioPerNome(def.foglio),
    prepara: (sheet) => {
      const r = parseRegolaPrezzoSheet(def, sheet);
      return { righe: r.rows.map(({ riga: _riga, ...resto }) => resto), righeLette: r.righeLette, anomalie: r.anomalie, codici: [], meta: {} };
    },
  })),
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
