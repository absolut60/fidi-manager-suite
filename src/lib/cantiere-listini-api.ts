import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { CantiereRow } from "@/lib/cantieri";
import { eliminaConEsito } from "@/lib/esito-eliminazione";
import { campiPrezzoDaMotore, prezzoNettoRiga, type PrezzoClienteGamma } from "@/lib/riga-preventivo";

export type CantiereListinoRow = Database["public"]["Tables"]["cantiere_listini_speciali"]["Row"];
export type CantiereListinoInput = Pick<CantiereListinoRow, "cantiere_id" | "cod_gamma" | "descrizione" | "prezzo_vendita_speciale" | "sconti" | "maggiorazione_perc" | "costo_netto_speciale" | "um_scelta" | "note"> & { id?: string };
export const chiavePrezziCantiere = (id: string) => ["prezzi-cantiere", id] as const;
export const chiaveConteggioPrezziCantiere = (id: string) => ["prezzi-cantiere-conteggio", id] as const;
export async function getCantiereListini(cantiereId: string): Promise<CantiereListinoRow[]> {
  const { data, error } = await supabase.from("cantiere_listini_speciali").select("*").eq("cantiere_id", cantiereId).order("created_at").order("id");
  if (error) throw error;
  return data ?? [];
}
export async function upsertCantiereListino(input: CantiereListinoInput): Promise<CantiereListinoRow> {
  const { id, ...payload } = input;
  // INSERT, never upsert: selecting an existing code must not overwrite its manual price.
  const query = id
    ? supabase.from("cantiere_listini_speciali").update(payload).eq("id", id).eq("cantiere_id", input.cantiere_id)
    : supabase.from("cantiere_listini_speciali").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}
export const deleteCantiereListino = (id: string) => eliminaConEsito("cantiere_listini_speciali", id);
export async function contaPrezziCantiere(id: string): Promise<number> {
  const { count, error } = await supabase.from("cantiere_listini_speciali").select("id", { count: "exact", head: true }).eq("cantiere_id", id);
  if (error) throw error;
  return count ?? 0;
}
export async function puoModificareCantiereDb(c: Pick<CantiereRow, "cliente_id" | "lead_id" | "agente_codice" | "created_by">): Promise<boolean> {
  const { data, error } = await supabase.rpc("auth_puo_modificare_cantiere", { _cliente_id: c.cliente_id, _lead_id: c.lead_id, _agente_codice: c.agente_codice, _created_by: c.created_by });
  if (error) throw error;
  return data === true;
}
/** Customer engine values are proposals only. Missing price never invents one. */
export function propostaPrezzoCantiere(p?: PrezzoClienteGamma | null) {
  const campi = campiPrezzoDaMotore(p, 1, 0);
  return {
    prezzo_vendita_speciale: campi.prezzo_unit,
    sconti: campi.sconti_gamma,
    maggiorazione_perc: campi.maggiorazione_perc,
    listino_cliente: p?.prezzo_base == null ? null : prezzoNettoRiga(campi),
    costo_ultimo: p?.costo_ultimo ?? null,
  };
}
export async function unitaPrezziCantiere(codici: string[]) {
  if (!codici.length) return [];
  const { data, error } = await supabase.from("articoli_gamma").select("codice,um,um2,fattore_conversione,costo_ultimo").in("codice", [...new Set(codici)]);
  if (error) throw error;
  return data ?? [];
}
