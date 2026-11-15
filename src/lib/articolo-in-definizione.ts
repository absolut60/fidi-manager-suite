/**
 * FM75 F4c — fonte unica della "prontezza per Gamma" di una riga manuale showroom.
 * Si verifica solo alla trasformazione in ordine (nessun segno di stato durante la compilazione).
 */
import { isRigaValorizzata } from "@/lib/riga-preventivo";

export interface RigaPerProntezzaGamma {
  tipo_riga?: string | null;
  articolo_id?: string | null;
  articolo_codice?: string | null;
  fornitore_id?: string | null;
  codice_articolo_fornitore?: string | null;
  descrizione?: string | null;
  um?: string | null;
  costo?: number | null;
  marca?: string | null;
}

const vuoto = (s: string | null | undefined) => s == null || s.trim() === "";

/** Dati mancanti per creare l'articolo in Gamma (etichette italiane). Righe con articolo Gamma o non valorizzate → []. */
export function datiMancantiRigaGamma(riga: RigaPerProntezzaGamma): string[] {
  if (!vuoto(riga.articolo_codice) || !isRigaValorizzata(riga)) return [];
  const mancano: string[] = [];
  if (vuoto(riga.fornitore_id)) mancano.push("fornitore");
  if (vuoto(riga.codice_articolo_fornitore)) mancano.push("codice articolo fornitore");
  if (vuoto(riga.descrizione)) mancano.push("descrizione");
  if (vuoto(riga.um)) mancano.push("U.M.");
  if (riga.costo == null) mancano.push("costo");
  if (vuoto(riga.marca)) mancano.push("marca");
  return mancano;
}
