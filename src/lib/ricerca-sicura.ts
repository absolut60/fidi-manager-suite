// FM64: fonte unica per inserire testo scritto dall'utente in un filtro
// PostgREST `.or(...)` (es. `ragione_sociale.ilike.%${t}%`).
// I caratteri che hanno un significato nella sintassi del filtro
// ( , . ( ) : " \ * % ) diventano "_", il jolly di UN carattere di ilike:
// non possono aggiungere condizioni e la ricerca continua a trovare il
// testo che li contiene (es. "S.R.L." trova "S.R.L."). Lettere, numeri,
// spazi e apostrofi restano invariati ("D'ANGELO", "EDIL 2N").
export function testoPerFiltroOr(testo: string | null | undefined): string {
  return (testo ?? "").trim().replace(/[,.():"\\*%]/g, "_");
}
