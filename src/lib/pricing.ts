/**
 * Motore di calcolo prezzi — UNICA FONTE DI VERITÀ.
 * Usato da: scheda articolo, vista Listini, esplosione kit, righe preventivo.
 *
 * SCHEMA NUOVO (catena lineare):
 *   prezzo_scontato = listino_for × (1 - sc1/100) × ... × (1 - sc5/100)
 *   trasporto       = € OPPURE % (alternativi, coerenti tra loro):
 *                       se € → trasporto_perc = (trasporto_eur / prezzo_scontato) × 100
 *                       se % → trasporto_eur  = prezzo_scontato × trasporto_perc / 100
 *   costo_netto     = prezzo_scontato + trasporto_eur     ← COSTO VERO (base margini)
 *   prezzo_vendita  = costo_netto × (1 + ricarico/100)
 *   margine%        = (prezzo - costo_netto) / prezzo × 100
 *   ricarico%       = (prezzo - costo_netto) / costo_netto × 100
 */

export interface CostoInput {
  listino_for?: number | string | null;
  sc1?: number | string | null;
  sc2?: number | string | null;
  sc3?: number | string | null;
  sc4?: number | string | null;
  sc5?: number | string | null;
  trasporto_eur?: number | string | null;
  trasporto_perc?: number | string | null;
}

export interface CostoOutput {
  prezzo_scontato: number;
  trasporto_eur: number;
  trasporto_perc: number;
  costo_netto: number;
}

const n = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).replace(/[^0-9.,\-]/g, "").replace(",", ".");
  const x = Number(cleaned);
  return Number.isFinite(x) ? x : 0;
};

export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

export function calcCosto(input: CostoInput): CostoOutput {
  const base = n(input.listino_for);
  if (!base) {
    return { prezzo_scontato: 0, trasporto_eur: 0, trasporto_perc: 0, costo_netto: 0 };
  }
  const sc = [input.sc1, input.sc2, input.sc3, input.sc4, input.sc5].map(n);
  let ps = base;
  for (const s of sc) ps = ps * (1 - s / 100);
  ps = round4(ps);

  const te = n(input.trasporto_eur);
  const tp = n(input.trasporto_perc);
  let trasportoEur = 0;
  let trasportoPerc = 0;
  if (te > 0) {
    trasportoEur = round4(te);
    trasportoPerc = ps > 0 ? round4((te / ps) * 100) : 0;
  } else if (tp > 0) {
    trasportoPerc = round4(tp);
    trasportoEur = ps > 0 ? round4((ps * tp) / 100) : 0;
  }

  const netto = round4(ps + trasportoEur);
  return {
    prezzo_scontato: ps,
    trasporto_eur: trasportoEur,
    trasporto_perc: trasportoPerc,
    costo_netto: netto,
  };
}

export function prezzoFromRicarico(costoNetto: number, ricarico: number): number {
  return round2(n(costoNetto) * (1 + n(ricarico) / 100));
}

export function ricaricoFromPrezzo(costoNetto: number, prezzo: number): number {
  const c = n(costoNetto);
  if (!c) return 0;
  return round2(((n(prezzo) - c) / c) * 100);
}

export function margineFromPrezzo(costoNetto: number, prezzo: number): number {
  const p = n(prezzo);
  if (!p) return 0;
  return round2(((p - n(costoNetto)) / p) * 100);
}

export function applyRicaricoDelta(costoNetto: number, ricarico: number, delta: number) {
  const newRic = n(ricarico) + n(delta);
  const prezzo = prezzoFromRicarico(costoNetto, newRic);
  return {
    ricarico: round2(newRic),
    prezzo,
    margine: margineFromPrezzo(costoNetto, prezzo),
  };
}
