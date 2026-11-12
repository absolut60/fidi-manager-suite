import type { ArticoloUpdate } from "./articoli-api";
import type { Database } from "@/integrations/supabase/types";

export type RigaDisponibilitaArticolo = Database["public"]["Functions"]["disponibilita_articolo"]["Returns"][number];
export type RigaListinoArticolo = Database["public"]["Functions"]["listini_articolo_visibili"]["Returns"][number];
/**
 * FM63: one stock reading for header and panels. Uses GIACENZA (not disponibilità);
 * logistics is always separate and never added to the sites. `sede` is the user's own
 * site when storeId is given, otherwise the sum of all sites. Own site is listed first.
 */
export function giacenzeArticolo(rows: RigaDisponibilitaArticolo[], storeId: string | null) {
  const tutte = rows.filter((r) => r.livello === "sede");
  const propria = storeId ? tutte.find((r) => r.store_id === storeId) ?? null : null;
  const sedi = [...tutte].sort((a, b) => Number(b.store_id === storeId && !!storeId) - Number(a.store_id === storeId && !!storeId)
    || Number(b.giacenza ?? 0) - Number(a.giacenza ?? 0) || (a.nome ?? "").localeCompare(b.nome ?? "", "it-IT"));
  const log = rows.filter((r) => r.livello === "logistica_comune");
  return {
    sede: storeId ? Number(propria?.giacenza ?? 0) : tutte.reduce((t, r) => t + Number(r.giacenza ?? 0), 0),
    sedi,
    logistica: log.length ? log.reduce((t, r) => t + Number(r.giacenza ?? 0), 0) : null,
  };
}
/** FM63: groups the rows of listini_articolo_visibili (the only price source) by price list; no price is recomputed here. */
export function listiniVisibiliArticolo(rows: RigaListinoArticolo[], globale: boolean) {
  const codici = [...new Set(rows.map((r) => r.listino))].sort((a, b) => a - b);
  return codici.map((listino) => {
    const righe = rows.filter((r) => r.listino === listino);
    const principale = (globale ? righe.find((r) => r.store_id == null) : righe[0]) ?? righe[0];
    return { listino, descrizione: principale.listino_descrizione, principale, depositi: globale ? righe.filter((r) => r.fonte === "deposito") : [] };
  });
}
/** Header price: own row for site users, base L10 for global users. */
export function venditaInEvidenza(gruppi: ReturnType<typeof listiniVisibiliArticolo>, globale: boolean) {
  return (globale ? gruppi.find((g) => g.listino === 10) : undefined) ?? gruppi[0] ?? null;
}
export function contaPreventiviArticolo(rows: { blocchi_preventivo: { preventivo_id: string } | null }[]) {
  return new Set(rows.flatMap((r) => r.blocchi_preventivo?.preventivo_id ? [r.blocchi_preventivo.preventivo_id] : [])).size;
}
export function ordinaFornitoriArticolo<T extends { preferenziale: boolean; fornitore: { ragione_sociale: string | null } | null; codice_articolo_fornitore: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(b.preferenziale) - Number(a.preferenziale)
    || (a.fornitore?.ragione_sociale ?? "").localeCompare(b.fornitore?.ragione_sociale ?? "", "it-IT")
    || a.codice_articolo_fornitore.localeCompare(b.codice_articolo_fornitore, "it-IT"));
}

export const TAB_SCHEDA_ARTICOLO = ["panoramica", "vendita", "acquisto", "disponibilita", "fornitori", "sistema-made"] as const;
export type TabSchedaArticolo = typeof TAB_SCHEDA_ARTICOLO[number];
export function tabSchedaArticolo(value: string): TabSchedaArticolo {
  return TAB_SCHEDA_ARTICOLO.find((tab) => tab === value) ?? "panoramica";
}
export const CAMPI_TECNICI_ARTICOLO = ["categoria", "tipologia", "componente", "qta_cliente", "qta_fornitore", "peso_unit", "note_acquisto", "note"] as const;
export type TecniciArticolo = Pick<ArticoloUpdate, typeof CAMPI_TECNICI_ARTICOLO[number]>;

// Explicit allowlist: technical saves must never carry Gamma or legacy-price fields.
export function patchTecniciArticolo(form: TecniciArticolo): TecniciArticolo {
  return Object.fromEntries(CAMPI_TECNICI_ARTICOLO.map((campo) => [campo, form[campo] ?? null]));
}

export function numeroAcquistoArticolo(value: number | null | undefined, euro = false) {
  if (value == null || value === 0) return "—";
  return value.toLocaleString("it-IT", { minimumFractionDigits: euro ? 4 : 0, maximumFractionDigits: euro ? 4 : 6 }) + (euro ? " €" : "");
}
/**
 * FM63 Fetta 4 — unità di misura Gamma (regola in docs/regole/unita-di-misura.md).
 * Giacenze, ordini, disponibilità e prezzi/costi Gamma sono nell'unità PRIMARIA (um).
 * fattore_conversione = quante UM1 stanno in 1 UM2: quantità UM2 = UM1 ÷ fattore, prezzo UM2 = prezzo UM1 × fattore.
 * Unico punto del codice che converte.
 */
export type UnitaScelta = "primaria" | "secondaria";
export function unitaArticolo(a: { um: string | null; um2: string | null; fattore_conversione: number | null }) {
  const um1 = a.um?.trim() || null;
  const um2 = a.um2?.trim() || null;
  const fattore = Number(a.fattore_conversione ?? 0);
  const convertibile = !!um2 && um2 !== um1 && Number.isFinite(fattore) && fattore > 0 && fattore !== 1;
  return { um1, um2, fattore, convertibile, um2Diversa: !!um2 && um2 !== um1 };
}
export function inUnita(valore: number | null | undefined, tipo: "quantita" | "prezzo", unita: UnitaScelta, fattore: number): number | null {
  if (valore == null) return null;
  if (unita === "primaria" || !(fattore > 0)) return valore;
  return tipo === "quantita" ? valore / fattore : valore * fattore;
}
/** Quantità con unità: massimo 3 decimali. */
export function quantitaConUnita(v: number | null | undefined, um: string | null) {
  if (v == null) return "—";
  return v.toLocaleString("it-IT", { maximumFractionDigits: 3, useGrouping: "always" } as unknown as Intl.NumberFormatOptions) + (um ? ` ${um}` : "");
}
/** Prezzo/costo con unità: sempre 4 decimali (regola FM63). */
export function prezzoConUnita(v: number | null | undefined, um: string | null) {
  if (v == null) return "—";
  return v.toLocaleString("it-IT", { minimumFractionDigits: 4, maximumFractionDigits: 4, useGrouping: "always" } as unknown as Intl.NumberFormatOptions) + (um ? ` €/${um}` : " €");
}
export function unitaSceltaDaUrl(um: unknown): UnitaScelta { return um === 2 || um === "2" ? "secondaria" : "primaria"; }
