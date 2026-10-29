/** Valore speciale dei filtri a scelta multipla: "colonna vuota" (NULL). */
export const VALORE_NESSUNO = "__none__";

/**
 * Fonte unica dei filtri di lista a scelta multipla su query Supabase.
 * - elenco vuoto = nessun filtro;
 * - "__none__" = colonna NULL, in OR con gli altri valori;
 * - senza "__none__" → `.in`; solo "__none__" → `.is(col, null)`.
 */
export function filtroElenco<Q extends { in: (c: string, v: string[]) => Q; is: (c: string, v: null) => Q; or: (f: string) => Q }>(q: Q, colonna: string, valori: string[]): Q {
  if (valori.length === 0) return q;
  const senza = valori.includes(VALORE_NESSUNO);
  const altri = valori.filter((v) => v !== VALORE_NESSUNO);
  if (senza && altri.length === 0) return q.is(colonna, null);
  if (!senza) return q.in(colonna, altri);
  const elenco = altri.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",");
  return q.or(`${colonna}.in.(${elenco}),${colonna}.is.null`);
}
