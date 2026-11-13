/**
 * FM65 — Fonte unica del calcolo della riga preventivo (formula Gamma).
 * Regola: docs/regole/prezzi-preventivo.md. Nessun altro file calcola l'importo di riga.
 *
 * netto   = prezzo_unit × Π(1 − s/100 per s in sconti_gamma) × (1 + maggiorazione_perc/100) × (1 − sconto_perc/100)
 * importo = round2(quantita × netto × segno)   (Gamma arrotonda solo l'importo di riga)
 * Il netto NON viene arrotondato (si mostra a 4 decimali).
 */

import { inUnita, unitaArticolo } from "./scheda-articolo";

export type UnitaGammaRiga = { um: string | null; um2: string | null; fattore_conversione: number | null };

/** Presentation and edits only: persisted quantities/prices/costs always remain UM1. */
export function rigaInUnita(
  riga: ImportoRigaInput & { incidenza?: number | null; costo?: number | null; um?: string | null; um_scelta?: string | null },
  gamma?: UnitaGammaRiga | null,
  patch: { quantita?: number | null; incidenza?: number | null; prezzo_unit?: number | null; costo_unit?: number | null } = {},
) {
  const u = unitaArticolo(gamma ?? { um: riga.um ?? null, um2: null, fattore_conversione: null });
  const secondaria = u.convertibile && riga.um_scelta === "um2";
  const scelta = secondaria ? "secondaria" : "primaria";
  const converti = (v: number | null | undefined, tipo: "quantita" | "prezzo", inversa = false) =>
    inUnita(v, inversa ? (tipo === "quantita" ? "prezzo" : "quantita") : tipo, scelta, u.fattore);
  const patchUm1: { quantita?: number | null; incidenza?: number | null; prezzo_unit?: number | null; costo?: number | null } = {};
  if ("quantita" in patch) patchUm1.quantita = converti(patch.quantita, "quantita", true);
  if ("incidenza" in patch) patchUm1.incidenza = converti(patch.incidenza, "quantita", true);
  if ("prezzo_unit" in patch) patchUm1.prezzo_unit = converti(patch.prezzo_unit, "prezzo", true);
  if ("costo_unit" in patch) patchUm1.costo = patch.costo_unit == null ? null : costoRiga(converti(patch.costo_unit, "prezzo", true), riga.quantita);
  const q = num(riga.quantita);
  return {
    ...u, secondaria, um: secondaria ? u.um2 : u.um1,
    quantita: converti(riga.quantita == null ? null : num(riga.quantita), "quantita"),
    incidenza: converti(riga.incidenza, "quantita"),
    prezzo_unit: converti(riga.prezzo_unit == null ? null : num(riga.prezzo_unit), "prezzo"),
    netto: converti(prezzoNettoRiga(riga), "prezzo"),
    costo_unit: converti(riga.costo == null ? null : q > 0 ? num(riga.costo) / q : num(riga.costo), "prezzo"),
    patchUm1,
  };
}

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

/** Quantità di riga in UM1, arrotondata a due decimali. */
export function quantitaDaIncidenza(incidenza: number | null | undefined, Qb: number | null | undefined): number | null {
  return incidenza == null || num(Qb) <= 0 ? null : round2Importo(num(incidenza) * num(Qb));
}

/** Incidenza a quattro decimali; null significa che il blocco non consente il calcolo. */
export function incidenzaDaQuantita(quantita: number | null | undefined, Qb: number | null | undefined): number | null {
  if (quantita == null || num(Qb) <= 0) return null;
  const x = num(quantita) / num(Qb);
  return Math.sign(x) * Math.round(Number((Math.abs(x) * 10000).toPrecision(15))) / 10000 || 0;
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
/** I gruppi dei kit non hanno né articolo del catalogo tecnico né codice Gamma. */
export function isIntestazioneKit(r: { tipo_riga?: string | null; articolo_id?: string | null; articolo_codice?: string | null }): boolean {
  return r.tipo_riga === "da_kit" && !r.articolo_id && !r.articolo_codice;
}

export function isRigaValorizzata(r: { tipo_riga?: string | null; articolo_id?: string | null; articolo_codice?: string | null }): boolean {
  return TIPI_VALORIZZATI.has(r.tipo_riga ?? "manuale") && !isIntestazioneKit(r);
}

/** Stessa formula per il piede del blocco e del preventivo, sugli importi netti. */
export function margineTotaliRighe(totali: { totale: number; costo: number }): { euro: number; perc: number } {
  const euro = totali.totale - totali.costo;
  return { euro: round2Importo(euro), perc: totali.totale > 0 ? euro / totali.totale * 100 : 0 };
}

/** Peso Gamma in UM1; null segnala un dato assente, senza sostituirlo col peso tecnico. */
export function pesoRigaGamma(pesoNetto: number | string | null | undefined, quantita: number | string | null | undefined): number | null {
  return pesoNetto == null ? null : num(pesoNetto) * num(quantita);
}

const CAMPI_IMPORTO = ["quantita", "prezzo_unit", "sconti_gamma", "maggiorazione_perc", "sconto_perc", "segno", "costo"] as const;

type RigaBase = {
  tipo_riga?: string | null;
  articolo_id?: string | null; articolo_codice?: string | null;
  quantita?: number | null; prezzo_unit?: number | null; sconto_perc?: number | null;
  sconti_gamma?: number[] | null; maggiorazione_perc?: number | null; segno?: number | null; costo?: number | null;
  incidenza?: number | null; peso?: number | null; peso_gamma_unit?: number | null;
};

/**
 * Aggiunge al patch l'importo ricalcolato (fonte unica). Se cambia la quantità e il costo
 * non è nel patch, il costo totale segue la quantità mantenendo il costo unitario.
 */
export function patchConImporto<P extends Partial<RigaBase>>(riga: RigaBase, patch: P, Qb?: number | null): P & { importo?: number; costo?: number | null; quantita?: number | null; incidenza?: number | null; peso?: number | null } {
  const tipo = patch.tipo_riga ?? riga.tipo_riga;
  if (!tipo || !isRigaValorizzata({ ...riga, ...patch, tipo_riga: tipo })) return patch;
  const out: P & { importo?: number; costo?: number | null; quantita?: number | null; incidenza?: number | null; peso?: number | null } = { ...patch };
  if ("incidenza" in patch) {
    const q = quantitaDaIncidenza(patch.incidenza, Qb);
    if (q != null) out.quantita = q;
  } else if ("quantita" in patch) {
    if (patch.quantita != null) out.quantita = round2Importo(num(patch.quantita));
    const inc = incidenzaDaQuantita(out.quantita, Qb);
    if (inc != null) out.incidenza = inc;
  }
  if (!CAMPI_IMPORTO.some((k) => k in out)) return out;
  if ("quantita" in out && !("costo" in patch) && riga.costo != null) {
    const qVecchia = num(riga.quantita);
    if (qVecchia > 0) out.costo = costoRiga(num(riga.costo) / qVecchia, out.quantita);
  }
  if ("quantita" in out && !("peso" in patch)) {
    if (riga.articolo_codice && "peso_gamma_unit" in riga) {
      out.peso = pesoRigaGamma(riga.peso_gamma_unit, out.quantita);
    } else if (riga.peso != null && num(riga.quantita) > 0) {
      out.peso = num(riga.peso) / num(riga.quantita) * num(out.quantita);
    }
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
    attuali.prezzo_unit != null && nuovi.prezzo_unit != null && r4(attuali.prezzo_unit) === r4(nuovi.prezzo_unit) &&
    stessiSconti(attuali.sconti_gamma, nuovi.sconti_gamma) &&
    r4(attuali.maggiorazione_perc) === r4(nuovi.maggiorazione_perc) &&
    (attuali.costo_unit == null ? nuovi.costo_unit == null : nuovi.costo_unit != null && r4(attuali.costo_unit) === r4(nuovi.costo_unit));
  if (uguale) return null;
  const nettoNuovo = prezzoNettoRiga({ ...nuovi, sconto_perc: riga.sconto_perc });
  return { attuali, nuovi, nettoNuovo, sottoCosto: nuovi.costo_unit != null && nettoNuovo < nuovi.costo_unit };
}
