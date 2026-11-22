/** SDI lead: normalizzazione comune a inserimento rapido, anagrafica e salvataggio. */
export function normalizzaCodiceSdi(valore: string | null | undefined): string {
  return (valore ?? '').replace(/\s/g, '').toUpperCase().slice(0, 7);
}

/** Una lunghezza diversa da sette è solo un avviso; vuoto è ammesso. */
export function avvisoCodiceSdi(valore: string | null | undefined): boolean {
  const codice = normalizzaCodiceSdi(valore);
  return codice.length > 0 && codice.length !== 7;
}