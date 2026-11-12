export const FILTRI_ARTICOLI = {
  search: "", famiglie: [] as string[], sottofamiglie: [] as string[], marche: [] as string[],
  fornitori: [] as string[], stati: [] as string[], soloDisponibili: false, listino: 10, page: 1,
};
export type FiltriArticoli = typeof FILTRI_ARTICOLI;
export function parametriArticoli(f: FiltriArticoli) {
  return { testo: f.search.trim(), famiglie: f.famiglie, sottofamiglie: f.sottofamiglie,
    marche: f.marche, fornitori: f.fornitori, stati: f.stati, solo_disponibili: f.soloDisponibili,
    listino: [9,10,20,30].includes(f.listino) ? f.listino : 10,
    limite: 100, offset: (Math.max(1, Math.floor(f.page)) - 1) * 100 };
}
export function prezzoArticolo(prezzo: number | null) {
  return prezzo === null ? "—" : prezzo.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
export const STATI_ARTICOLI = [
  { valore: "in_uso", label: "In uso" }, { valore: "in_esaurimento", label: "In esaurimento" },
  { valore: "solo_preventivatore", label: "Solo preventivatore" },
];