import type { CampiSempliciKit } from './kit-regole';
import { formatNumeroIt, parseNumeroIt } from './numero-it';

export const AIUTO_CALCOLA_DALLA_RIGA = "Usalo quando la quantità dipende da un'altra riga del kit. Il calcolo parte dalla quantità di quella riga, per singolo pezzo, e poi applica passo, lati e confezione di questa riga. Esempi: i tasselli si calcolano dai metri di guida (riga guide ÷ passo 0,5 m); le viti dai metri di montante (riga montanti ÷ passo 0,2 m ÷ confezione 1000 × lati). Lascia 'Nessuna' per le righe che non dipendono da altre (lastre, isolante, stucco, nastro).";

/** Solo visualizzazione: il valore originale rimane disponibile durante la modifica. */
export function testoNumeroKit(valore: number | null | undefined, editing: boolean): string {
  return valore == null ? '' : editing ? String(valore).replace('.', ',') : formatNumeroIt(valore, { maxDecimals: 4 });
}

export const CAMPI_SEMPLICI_KIT = [
  { codice: 'n_pezzi', etichetta: 'N. pezzi', aiuto: 'numero di pezzi per una unità base del kit' },
  { codice: 'passo', etichetta: 'Passo (m)', aiuto: 'passo della riga in metri, es. 0,6' },
  { codice: 'passo_2', etichetta: 'Passo 2 (m)', aiuto: 'secondo passo della riga in metri, se necessario' },
  { codice: 'consumo', etichetta: 'Consumo/mq', aiuto: 'consumo dell’articolo per metro quadrato' },
  { codice: 'lati', etichetta: 'Lati', aiuto: 'numero di lati su cui si usa l’articolo' },
  { codice: 'confezione', etichetta: 'Confezione', aiuto: 'solo se in Gamma l’unità è la confezione: viti CO da 1000, sacco da 10 kg, rotolo da 90 ml' },
  { codice: 'sfrido', etichetta: 'Sfrido', aiuto: 'quantità aggiunta dopo il calcolo' },
  { codice: 'riga_rif', etichetta: 'Calcola dalla riga', aiuto: AIUTO_CALCOLA_DALLA_RIGA },
] as const;
export type CampoSempliceKit = keyof CampiSempliciKit;

export function numeroCampoKit(campo: CampoSempliceKit | 'incidenza', testo: string): number | null {
  if (!testo.trim()) return null;
  const n = parseNumeroIt(testo);
  if (n == null) throw new Error('Scrivi un numero valido, es. 0,6.');
  if (['passo', 'passo_2', 'confezione'].includes(campo) && n <= 0) throw new Error('Il valore deve essere maggiore di zero.');
  if (['n_pezzi', 'consumo', 'lati', 'peso_unitario'].includes(campo) && n < 0) throw new Error('Il valore non può essere negativo.');
  if (campo === 'riga_rif' && (!Number.isInteger(n) || n < 1)) throw new Error('Scegli un numero di riga intero da 1.');
  return n;
}

/** Validazione al confine API; non calcola quantità o pesi. */
export function normalizzaPatchSempliceKit<T extends Partial<CampiSempliciKit>>(patch: T): T {
  const risultato = { ...patch };
  for (const campo of [...CAMPI_SEMPLICI_KIT.map(c => c.codice), 'peso_unitario'] as const) {
    if (!Object.hasOwn(patch, campo)) continue;
    const valore = patch[campo];
    Object.assign(risultato, { [campo]: numeroCampoKit(campo, valore == null ? '' : String(valore)) });
  }
  return risultato;
}

export function prossimoOrdineKit(righe: readonly { ordine: number }[]): number {
  return Math.max(0, ...righe.map(r => r.ordine)) + 1;
}