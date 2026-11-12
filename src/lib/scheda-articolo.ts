import type { ArticoloUpdate } from "./articoli-api";
import type { Database } from "@/integrations/supabase/types";

export type RigaDisponibilitaArticolo = Database["public"]["Functions"]["disponibilita_articolo"]["Returns"][number];
// Sum only the RPC's aggregate levels, never its deposit detail a second time.
export function totaleDisponibilitaArticolo(rows: RigaDisponibilitaArticolo[]) {
  return rows.filter((r) => r.livello === "sede" || r.livello === "logistica_comune")
    .reduce((totale, r) => totale + Number(r.disponibilita ?? 0), 0);
}
export function contaPreventiviArticolo(rows: { blocchi_preventivo: { preventivo_id: string } | null }[]) {
  return new Set(rows.flatMap((r) => r.blocchi_preventivo?.preventivo_id ? [r.blocchi_preventivo.preventivo_id] : [])).size;
}
export function ordinaFornitoriArticolo<T extends { preferenziale: boolean; fornitore: { ragione_sociale: string } | null; codice_articolo_fornitore: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(b.preferenziale) - Number(a.preferenziale)
    || (a.fornitore?.ragione_sociale ?? "").localeCompare(b.fornitore?.ragione_sociale ?? "", "it-IT")
    || a.codice_articolo_fornitore.localeCompare(b.codice_articolo_fornitore, "it-IT"));
}

export const ORDINE_LISTINI_ARTICOLO = [10, 20, 30, 9] as const;
export const CAMPI_TECNICI_ARTICOLO = ["categoria", "tipologia", "componente", "qta_cliente", "qta_fornitore", "peso_unit", "note_acquisto", "note"] as const;
export type TecniciArticolo = Pick<ArticoloUpdate, typeof CAMPI_TECNICI_ARTICOLO[number]>;

// Explicit allowlist: technical saves must never carry Gamma or legacy-price fields.
export function patchTecniciArticolo(form: TecniciArticolo): TecniciArticolo {
  return Object.fromEntries(CAMPI_TECNICI_ARTICOLO.map((campo) => [campo, form[campo] ?? null]));
}

export function numeroAcquistoArticolo(value: number | null | undefined, euro = false) {
  if (value == null || value === 0) return "—";
  return value.toLocaleString("it-IT", { minimumFractionDigits: euro ? 2 : 0, maximumFractionDigits: 6 }) + (euro ? " €" : "");
}