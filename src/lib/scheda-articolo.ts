import type { ArticoloUpdate } from "./articoli-api";

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