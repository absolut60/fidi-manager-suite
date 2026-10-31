export const PRECALCOLO_POLL_MS = 15_000;
export const PRECALCOLO_POLL_MAX_MS = 10 * 60_000;

/** Solo attesa del ricalcolo: nessun avvio o modifica dei dati. */
export function intervalloAttesaPrecalcolo(pronto: boolean, inizio: number | null, ora: number): number | false {
  if (!pronto || inizio === null || ora - inizio >= PRECALCOLO_POLL_MAX_MS) return false;
  return PRECALCOLO_POLL_MS;
}