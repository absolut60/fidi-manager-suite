/**
 * Fonte unica per leggere TUTTE le righe di una query dal database a blocchi
 * (il server restituisce al massimo 1000 righe per richiesta).
 *
 * `costruisci(da, a)` deve restituire la query completa di filtri e di un
 * ordinamento STABILE (con `id` come ultimo criterio) già limitata con `.range(da, a)`.
 * Qualsiasi errore di un blocco viene rilanciato: mai liste parziali silenziose.
 */
export const DIMENSIONE_BLOCCO_LETTURA = 1000;

export async function leggiTutteLeRighe<T>(
  costruisci: (da: number, a: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  dimensione = DIMENSIONE_BLOCCO_LETTURA,
): Promise<T[]> {
  const out: T[] = [];
  for (let da = 0; ; da += dimensione) {
    const { data, error } = await costruisci(da, da + dimensione - 1);
    if (error) throw error;
    const blocco = data ?? [];
    out.push(...blocco);
    if (blocco.length < dimensione) break;
  }
  return out;
}
