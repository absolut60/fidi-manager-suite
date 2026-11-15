/**
 * FM75 F5a — fonte unica delle leve prezzo showroom (pura, nessuna UI).
 * Una leva è solo un modo di SCRIVERE prezzo_unit/sconti_gamma: il netto resta prezzoNettoRiga
 * (riga-preventivo.ts), margini compresi. Nessun secondo motore prezzi.
 */
import { MAX_SCONTI_GAMMA, prezzoNettoRiga } from "@/lib/riga-preventivo";

export type LevaPrezzoShowroom = "ricarico" | "sconto_listino" | "prezzo_manuale";

export interface InputLeva {
  leva: LevaPrezzoShowroom;
  costoUnit?: number | null;
  listinoFornitore?: number | null;
  /** Cascata nella convenzione di sconti_gamma (positivo = sconto, negativo = maggiorazione). */
  cascata?: readonly number[] | null;
  ricaricoPerc?: number | null;
  prezzoManuale?: number | null;
}

export interface PatchLeva {
  prezzo_unit: number;
  sconti_gamma: number[];
  ricarico: number | null;
  leva_prezzo: LevaPrezzoShowroom;
  fonte_prezzo: "manuale";
}

const round4 = (v: number) => Math.round((v + Number.EPSILON * Math.sign(v)) * 10000) / 10000;
const valido = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** Ricarico % implicito di un prezzo netto rispetto al costo unitario (null senza costo positivo). */
export function ricaricoImplicito(prezzoNetto: number, costoUnit: number | null | undefined): number | null {
  if (!valido(costoUnit) || costoUnit <= 0) return null;
  return round4((prezzoNetto / costoUnit - 1) * 100);
}

/** Applica una leva. null se mancano i dati che la leva richiede (costo/ricarico, listino, prezzo). */
export function applicaLeva(i: InputLeva): PatchLeva | null {
  const base = { leva_prezzo: i.leva, fonte_prezzo: "manuale" as const };
  if (i.leva === "ricarico") {
    if (!valido(i.costoUnit) || !valido(i.ricaricoPerc)) return null;
    return { ...base, prezzo_unit: round4(i.costoUnit * (1 + i.ricaricoPerc / 100)), sconti_gamma: [], ricarico: i.ricaricoPerc };
  }
  if (i.leva === "sconto_listino") {
    if (!valido(i.listinoFornitore)) return null;
    const sconti_gamma = [...(i.cascata ?? [])];
    const netto = prezzoNettoRiga({ prezzo_unit: i.listinoFornitore, sconti_gamma });
    return { ...base, prezzo_unit: round4(i.listinoFornitore), sconti_gamma, ricarico: ricaricoImplicito(netto, i.costoUnit) };
  }
  if (!valido(i.prezzoManuale)) return null;
  const prezzo = round4(i.prezzoManuale);
  return { ...base, prezzo_unit: prezzo, sconti_gamma: [], ricarico: ricaricoImplicito(prezzo, i.costoUnit) };
}

/**
 * Legge la cascata commerciale del listino fornitore e la restituisce nella convenzione di sconti_gamma.
 * - Notazione con segni (se compare almeno un "-"/"−"): "-" = sconto, "+" = maggiorazione;
 *   un primo termine senza segno vale sconto. "-45+5" → [45, -5] (listino 100 → netto 57,75).
 * - Notazione Gamma (nessun "-"): ogni termine è uno sconto. "45" → [45]; "45+5" → [45, 5].
 * Virgola decimale ammessa, spazi ignorati, zeri tolti. null se non valida o oltre MAX_SCONTI_GAMMA termini.
 */
export function parseCascata(testo: string): number[] | null {
  const t = testo.replace(/[−–]/g, "-").replace(/\s/g, "").replace(/,/g, ".");
  if (!t) return [];
  const conSegni = t.includes("-");
  const termini = t.match(/[+-]?[^+-]*/g)?.filter((x) => x !== "") ?? [];
  const valori: number[] = [];
  for (const termine of termini) {
    const m = /^([+-]?)(\d+(?:\.\d+)?)$/.exec(termine);
    if (!m) return null;
    const v = Number(m[2]);
    if (v === 0) continue;
    valori.push(conSegni && m[1] === "+" ? -v : v);
  }
  return valori.length > MAX_SCONTI_GAMMA ? null : valori;
}

/**
 * Testo nella notazione con segni ("-" sconto, "+" maggiorazione), inversa di parseCascata:
 * [45, −5] → "-45+5"; [45, 5] → "-45-5"; [] → "". Decimali con virgola (it-IT).
 */
export function formatCascata(cascata: readonly (number | string | null)[] | null | undefined): string {
  return (cascata ?? []).map(Number).filter((v) => Number.isFinite(v) && v !== 0)
    .map((v) => `${v > 0 ? "-" : "+"}${Math.abs(v).toLocaleString("it-IT", { maximumFractionDigits: 4, useGrouping: false })}`)
    .join("");
}
