export type ValoreIndirizzo = { indirizzo: string; cap: string; citta: string; provincia: string };
export type LimitiIndirizzo = Partial<Record<keyof ValoreIndirizzo, number>>;

/** Residenza legacy: conserva via, CAP, città e provincia nell'unico campo esistente. */
export function residenzaDaIndirizzo(value: ValoreIndirizzo): string {
  return [value.indirizzo, value.cap, value.citta, value.provincia ? `(${value.provincia.toUpperCase()})` : ""].filter(Boolean).join(" ");
}

/** Limiti del modulo applicati anche ai valori restituiti dai suggerimenti. */
export function normalizzaIndirizzo(parziale: Partial<ValoreIndirizzo>, limiti: LimitiIndirizzo = {}): Partial<ValoreIndirizzo> {
  const out: Partial<ValoreIndirizzo> = {};
  for (const campo of Object.keys(parziale) as (keyof ValoreIndirizzo)[]) {
    const valore = parziale[campo];
    if (valore === undefined) continue;
    const testo = campo === "provincia" ? valore.toUpperCase() : valore;
    out[campo] = limiti[campo] === undefined ? testo : testo.slice(0, limiti[campo]);
  }
  return out;
}