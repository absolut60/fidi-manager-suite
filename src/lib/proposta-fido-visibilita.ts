/**
 * Visibilità delle righe nella proposta fido massiva.
 * Le righe toccate dall'utente restano visibili (e nella stessa posizione) finché
 * non cambiano i filtri: così una riga non sparisce mentre la si modifica.
 */
export type Tri = "tutti" | "escludi" | "solo" | string;

export interface FiltriProposta<T extends string = string> {
  tipi: T[];
  pagImmediato: Tri;
  fidoZero: Tri;
  inCorso: Tri;
}

export interface RigaVisibilita<T extends string = string> {
  cliente_id: string;
  tipo: T;
  regola: string;
  fido_proposto: number;
  richiestaInCorso?: unknown;
}

export function passaFiltriProposta<T extends string>(r: RigaVisibilita<T>, f: FiltriProposta<T>): boolean {
  if (!f.tipi.includes(r.tipo)) return false;
  const inCorso = !!r.richiestaInCorso;
  if (f.inCorso === "escludi" && inCorso) return false;
  if (f.inCorso === "solo" && !inCorso) return false;
  const isPagImmediato = r.regola === "pagamento_immediato";
  if (f.pagImmediato === "escludi" && isPagImmediato) return false;
  if (f.pagImmediato === "solo" && !isPagImmediato) return false;
  const isFidoZero = Number(r.fido_proposto) === 0;
  if (f.fidoZero === "escludi" && isFidoZero) return false;
  if (f.fidoZero === "solo" && !isFidoZero) return false;
  return true;
}

export function righeVisibiliProposta<T extends string, R extends RigaVisibilita<T>>(
  righe: R[], filtri: FiltriProposta<T>, toccate: ReadonlySet<string>,
): R[] {
  return righe.filter((r) => toccate.has(r.cliente_id) || passaFiltriProposta(r, filtri));
}
