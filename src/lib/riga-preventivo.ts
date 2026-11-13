/**
 * FM65 — Fonte unica del calcolo della riga preventivo (formula Gamma).
 * Regola: docs/regole/prezzi-preventivo.md. Nessun altro file calcola l'importo di riga.
 *
 * netto   = prezzo_unit × Π(1 − s/100 per s in sconti_gamma) × (1 + maggiorazione_perc/100) × (1 − sconto_perc/100)
 * importo = round2(quantita × netto × segno)   (Gamma arrotonda solo l'importo di riga)
 * Il netto NON viene arrotondato (si mostra a 4 decimali).
 */

export interface PrezzoRigaInput {
  prezzo_unit: number | string | null | undefined;
  sconti_gamma?: readonly (number | string | null)[] | null;
  maggiorazione_perc?: number | string | null;
  /** Sconto extra (piede o trattativa), in cascata dopo gli sconti Gamma. */
  sconto_perc?: number | string | null;
}

export interface ImportoRigaInput extends PrezzoRigaInput {
  quantita: number | string | null | undefined;
  segno?: number | null;
}

const num = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/**
 * Arrotondamento a 2 decimali dell'importo, metà per eccesso (lontano da zero),
 * corretto per l'errore binario: 23,70 × 1,15 = 27,255 → 27,26 come Gamma
 * (Math.round su 27,254999… darebbe 27,25).
 */
export function round2Importo(x: number): number {
  const c = Number((Math.abs(x) * 100).toPrecision(15));
  return (Math.sign(x) * Math.round(c)) / 100 || 0;
}

/** Costo totale di riga = costo unitario × quantità, salvato a 4 decimali (il costo unitario mostrato resta esatto). */
export function costoRiga(costoUnit: number | string | null | undefined, quantita: number | string | null | undefined): number {
  const x = num(costoUnit) * num(quantita);
  const c = Number((Math.abs(x) * 10000).toPrecision(15));
  return (Math.sign(x) * Math.round(c)) / 10000 || 0;
}

export function segnoRiga(segno: number | null | undefined): 1 | -1 {
  return (segno ?? 1) === -1 ? -1 : 1;
}

export function prezzoNettoRiga(r: PrezzoRigaInput): number {
  let netto = num(r.prezzo_unit);
  for (const s of r.sconti_gamma ?? []) netto *= 1 - num(s) / 100;
  netto *= 1 + num(r.maggiorazione_perc) / 100;
  netto *= 1 - num(r.sconto_perc) / 100;
  return netto;
}

export function importoRiga(r: ImportoRigaInput): number {
  return round2Importo(num(r.quantita) * prezzoNettoRiga(r) * segnoRiga(r.segno));
}

/** Margine % sul prezzo netto (con segno), dato il costo totale della riga. */
export function marginePercRiga(r: ImportoRigaInput & { costo?: number | string | null }): number {
  const q = num(r.quantita);
  const netto = prezzoNettoRiga(r) * segnoRiga(r.segno);
  const costoUnit = q > 0 ? num(r.costo) / q : 0;
  return netto !== 0 ? Math.round(((netto - costoUnit) / netto) * 10000) / 100 : 0;
}

// ---------------------------------------------------------------------------
// FM65 fetta 2b-1: sconti come in Gamma ("17+5") e riga dal motore prezzi.
// ---------------------------------------------------------------------------

export const MAX_SCONTI_GAMMA = 6;

const fmtSconto = (v: number) =>
  v.toLocaleString("it-IT", { maximumFractionDigits: 4, useGrouping: false });

/** "17+5" come in Gamma; vuoto se nessuno sconto. */
export function formatScontiGamma(sconti: readonly (number | string | null)[] | null | undefined): string {
  return (sconti ?? []).map(num).filter((s) => s !== 0).map(fmtSconto).join("+");
}

/**
 * Legge "17+5" (virgola decimale italiana). Restituisce null se il testo non è valido
 * o se gli sconti sono più di 6. Gli zeri vengono tolti.
 */
export function parseScontiGamma(testo: string): number[] | null {
  const t = testo.trim();
  if (!t) return [];
  const parti = t.split("+").map((p) => p.trim().replace(/\s/g, "").replace(",", "."));
  const valori: number[] = [];
  for (const p of parti) {
    if (!/^-?\d+(\.\d+)?$/.test(p)) return null;
    const v = Number(p);
    if (v !== 0) valori.push(v);
  }
  return valori.length > MAX_SCONTI_GAMMA ? null : valori;
}

/** Uscita di public.prezzi_preventivo_cliente (solo i campi usati dalla riga). */
export interface PrezzoClienteGamma {
  prezzo_base: number | null;
  sc1: number | null; sc2: number | null; sc3: number | null;
  sc4: number | null; sc5: number | null; sc6: number | null;
  maggiorazione_perc: number | null;
  costo_ultimo: number | null;
  avvisi?: string[] | null;
}

/** Slot sc1..sc6 diversi da 0, nell'ordine. */
export function scontiDaSlot(p: PrezzoClienteGamma): number[] {
  return [p.sc1, p.sc2, p.sc3, p.sc4, p.sc5, p.sc6].map(num).filter((s) => s !== 0);
}

/** Campi prezzo della riga dal motore. Nessun ricalcolo: valori del motore così come sono. */
export function campiPrezzoDaMotore(
  p: PrezzoClienteGamma | null | undefined,
  quantita: number,
  scontoPiede: number,
): { prezzo_unit: number | null; sconti_gamma: number[]; maggiorazione_perc: number; sconto_perc: number; costo: number | null; importo: number } {
  const sconto_perc = scontoPiede > 0 ? scontoPiede : 0;
  const costo = p?.costo_ultimo == null ? null : costoRiga(p.costo_ultimo, quantita);
  if (!p || p.prezzo_base == null) {
    return { prezzo_unit: null, sconti_gamma: [], maggiorazione_perc: 0, sconto_perc, costo, importo: 0 };
  }
  const campi = {
    prezzo_unit: num(p.prezzo_base),
    sconti_gamma: scontiDaSlot(p),
    maggiorazione_perc: num(p.maggiorazione_perc),
    sconto_perc,
  };
  return { ...campi, costo, importo: importoRiga({ ...campi, quantita }) };
}

const TIPI_VALORIZZATI = new Set(["articolo_singolo", "da_kit", "manuale"]);
const CAMPI_IMPORTO = ["quantita", "prezzo_unit", "sconti_gamma", "maggiorazione_perc", "sconto_perc", "segno", "costo"] as const;

type RigaBase = {
  tipo_riga?: string | null;
  quantita?: number | null; prezzo_unit?: number | null; sconto_perc?: number | null;
  sconti_gamma?: number[] | null; maggiorazione_perc?: number | null; segno?: number | null; costo?: number | null;
};

/**
 * Aggiunge al patch l'importo ricalcolato (fonte unica). Se cambia la quantità e il costo
 * non è nel patch, il costo totale segue la quantità mantenendo il costo unitario.
 */
export function patchConImporto<P extends Partial<RigaBase>>(riga: RigaBase, patch: P): P & { importo?: number; costo?: number | null } {
  const tipo = patch.tipo_riga ?? riga.tipo_riga;
  if (!tipo || !TIPI_VALORIZZATI.has(tipo)) return patch;
  if (!CAMPI_IMPORTO.some((k) => k in patch)) return patch;
  const out: P & { importo?: number; costo?: number | null } = { ...patch };
  if ("quantita" in patch && !("costo" in patch) && riga.costo != null) {
    const qVecchia = num(riga.quantita);
    if (qVecchia > 0) out.costo = costoRiga(num(riga.costo) / qVecchia, patch.quantita);
  }
  out.importo = importoRiga({ ...riga, ...out } as ImportoRigaInput);
  return out;
}

// ---------------------------------------------------------------------------
// FM65 fetta 2b-2: "Aggiorna listini" — confronto fra valori salvati e motore.
// ---------------------------------------------------------------------------

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const stessiSconti = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((v, i) => r4(v) === r4(b[i]));

export interface ValoriPrezzoRiga {
  prezzo_unit: number | null;
  sconti_gamma: number[];
  maggiorazione_perc: number;
  costo_unit: number | null;
}

/**
 * Valori attuali e nuovi di una riga; null se il motore non dà prezzo o non cambia nulla.
 * Il costo resta quello salvato quando il motore non ha costo ultimo.
 */
export function confrontoAggiornamento(
  riga: { quantita?: number | null; prezzo_unit?: number | null; sconti_gamma?: number[] | null; maggiorazione_perc?: number | null; costo?: number | null; sconto_perc?: number | null },
  p: PrezzoClienteGamma | null | undefined,
): { attuali: ValoriPrezzoRiga; nuovi: ValoriPrezzoRiga; nettoNuovo: number; sottoCosto: boolean } | null {
  if (!p || p.prezzo_base == null) return null;
  const q = num(riga.quantita);
  const attuali: ValoriPrezzoRiga = {
    prezzo_unit: riga.prezzo_unit == null ? null : num(riga.prezzo_unit),
    sconti_gamma: (riga.sconti_gamma ?? []).map(num).filter((s) => s !== 0),
    maggiorazione_perc: num(riga.maggiorazione_perc),
    costo_unit: riga.costo == null ? null : q > 0 ? num(riga.costo) / q : num(riga.costo),
  };
  const nuovi: ValoriPrezzoRiga = {
    prezzo_unit: num(p.prezzo_base),
    sconti_gamma: scontiDaSlot(p),
    maggiorazione_perc: num(p.maggiorazione_perc),
    costo_unit: p.costo_ultimo == null ? attuali.costo_unit : num(p.costo_ultimo),
  };
  const uguale =
    attuali.prezzo_unit != null && r4(attuali.prezzo_unit) === r4(nuovi.prezzo_unit!) &&
    stessiSconti(attuali.sconti_gamma, nuovi.sconti_gamma) &&
    r4(attuali.maggiorazione_perc) === r4(nuovi.maggiorazione_perc) &&
    (attuali.costo_unit == null ? nuovi.costo_unit == null : nuovi.costo_unit != null && r4(attuali.costo_unit) === r4(nuovi.costo_unit));
  if (uguale) return null;
  const nettoNuovo = prezzoNettoRiga({ ...nuovi, sconto_perc: riga.sconto_perc });
  return { attuali, nuovi, nettoNuovo, sottoCosto: nuovi.costo_unit != null && nettoNuovo < nuovi.costo_unit };
}
