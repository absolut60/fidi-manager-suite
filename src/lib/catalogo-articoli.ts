// Filtri e parametri dell'elenco articoli Gamma (FM63 Fetta 3).
// Prezzo, listino della sede e giacenze li decide solo SQL (cerca_articoli + _prezzo_vendita_articoli).
import { parametriRicerca, type ScelteCascata } from "./filtri-catalogo-articoli";
export const VALORE_LOGISTICA = "__logistica__";
export const ORDINAMENTI_ARTICOLI = ["codice", "descrizione", "marca", "famiglia", "prezzo", "giacenza_sede", "giacenza_logistica", "stato"] as const;
export type OrdinamentoArticoli = (typeof ORDINAMENTI_ARTICOLI)[number];
export const LISTINI_GLOBALI = [10, 20, 30] as const;

export const FILTRI_ARTICOLI = {
  search: "", famiglie: [] as string[], coppie: [] as string[], marche: [] as string[],
  /** Solo filtri salvati prima di FM65 F3: convertiti in coppie all'apertura, mai inviati alla ricerca. */
  sottofamiglie: [] as string[],
  fornitori: [] as string[], stati: [] as string[], disponibileIn: [] as string[], listino: 10,
  ordina: "codice" as string, dir: "asc" as string, page: 1,
};
export type FiltriArticoli = typeof FILTRI_ARTICOLI;

export function ordinamentoArticoliValido(ordina: unknown, dir: unknown): { ordina: OrdinamentoArticoli; direzione: "asc" | "desc" } {
  return { ordina: (ORDINAMENTI_ARTICOLI as readonly unknown[]).includes(ordina) ? ordina as OrdinamentoArticoli : "codice", direzione: dir === "desc" ? "desc" : "asc" };
}
/** Listino scelto valido solo per l'utente globale (10/20/30, mai 9); per la sede lo ignora il server. */
export function listinoValido(listino: unknown): number {
  return (LISTINI_GLOBALI as readonly unknown[]).includes(listino) ? listino as number : 10;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parametriArticoli(f: FiltriArticoli) {
  const disp = Array.isArray(f.disponibileIn) ? f.disponibileIn : [];
  const ord = ordinamentoArticoliValido(f.ordina, f.dir);
  const cascata = parametriRicerca({ famiglie: f.famiglie, coppie: Array.isArray(f.coppie) ? f.coppie : [], marche: f.marche });
  return { testo: f.search.trim(), famiglie: cascata.famiglie, sottofamiglie: [] as string[],
    marche: cascata.marche, fornitori: f.fornitori, stati: f.stati,
    disponibile_in: disp.filter(v => UUID.test(v)), disponibile_logistica: disp.includes(VALORE_LOGISTICA),
    listino: listinoValido(f.listino), _ordina: ord.ordina, _direzione: ord.direzione,
    limite: 100, offset: (Math.max(1, Math.floor(f.page)) - 1) * 100,
    coppie: cascata.coppie, solo_gamma: false };
}
export function prezzoArticolo(prezzo: number | null) {
  return prezzo === null ? "—" : prezzo.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
export function quantitaArticolo(q: number | null, um?: string | null) {
  return q === null ? "—" : q.toLocaleString("it-IT", { maximumFractionDigits: 3 }) + (um ? ` ${um}` : "");
}
export const STATI_ARTICOLI = [
  { valore: "in_uso", label: "In uso" }, { valore: "in_esaurimento", label: "In esaurimento" },
  { valore: "solo_preventivatore", label: "Solo preventivatore" },
];

/** FM65 F4: parametri di cerca_articoli per la ricerca articolo del preventivo (30 righe Gamma per codice). */
export function parametriArticoliPreventivo(testo: string, scelte?: Partial<ScelteCascata>) {
  const c = parametriRicerca({ famiglie: scelte?.famiglie ?? [], coppie: scelte?.coppie ?? [], marche: scelte?.marche ?? [] });
  return {
    testo: testo.trim(), famiglie: c.famiglie, sottofamiglie: [] as string[], marche: c.marche, fornitori: [] as string[],
    stati: ["in_uso", "in_esaurimento"], disponibile_in: [] as string[], disponibile_logistica: false,
    _ordina: "codice", _direzione: "asc", limite: 30, offset: 0,
    coppie: c.coppie, solo_gamma: true, // FM65 F1: righe non Gamma escluse prima del limite
  };
}
/** FM65 F4: la ricerca del preventivo parte con almeno un filtro, altrimenti con almeno 2 caratteri. */
export function ricercaPreventivoAttiva(testo: string, scelte: ScelteCascata) {
  return scelte.famiglie.length + scelte.coppie.length + scelte.marche.length > 0 || testo.trim().length >= 2;
}
