/**
 * FM65 — Fonte unica del calcolo della riga preventivo (formula Gamma).
 * Regola: docs/regole/prezzi-preventivo.md. Nessun altro file calcola l'importo di riga.
 *
 * netto   = prezzo_unit × Π(1 − s/100 per s in sconti_gamma) × (1 + maggiorazione_perc/100) × (1 − sconto_perc/100)
 * importo = round2(quantita × netto × segno)   (Gamma arrotonda solo l'importo di riga)
 * Il netto NON viene arrotondato (si mostra a 4 decimali).
 */
import { round2 } from "./pricing";

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
  return round2(num(r.quantita) * prezzoNettoRiga(r) * segnoRiga(r.segno));
}

/** Margine % sul prezzo netto (con segno), dato il costo totale della riga. */
export function marginePercRiga(r: ImportoRigaInput & { costo?: number | string | null }): number {
  const q = num(r.quantita);
  const netto = prezzoNettoRiga(r) * segnoRiga(r.segno);
  const costoUnit = q > 0 ? num(r.costo) / q : 0;
  return netto !== 0 ? round2(((netto - costoUnit) / netto) * 100) : 0;
}
