import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type ErroreEliminazione = { code?: string; message: string };
type QueryEliminazione = PromiseLike<{ error: ErroreEliminazione | null; count: number | null }> & {
  eq: (colonna: string, valore: string) => QueryEliminazione;
  in: (colonna: string, valori: readonly string[]) => QueryEliminazione;
  not: (colonna: string, operatore: string, valore: null) => QueryEliminazione;
};
export type EsitoEliminazione =
  | { tipo: "eliminato"; eliminati?: number }
  | { tipo: "collegato" }
  | { tipo: "permessi" }
  | { tipo: "parziale"; eliminati: number; richiesti: number }
  | { tipo: "errore"; messaggio: string };

export function classificaEsitoEliminazione(error: ErroreEliminazione | null, conteggio: number | null, richiesti = 1): EsitoEliminazione {
  if (error?.code === "23503") return { tipo: "collegato" };
  if (error?.code === "42501") return { tipo: "permessi" };
  if (error) return { tipo: "errore", messaggio: error.message };
  if (!conteggio || richiesti <= 0) return { tipo: "permessi" };
  if (conteggio === richiesti) return { tipo: "eliminato" };
  return { tipo: "parziale", eliminati: conteggio, richiesti };
}

export async function eliminaConEsito(
  tabella: keyof Database["public"]["Tables"],
  id: string | readonly string[] | { richiesti: number; filtro: (query: QueryEliminazione) => QueryEliminazione },
  vincolo?: { preventivo_id: string },
  client: SupabaseClient<Database> = supabase,
): Promise<EsitoEliminazione> {
  const filtro = typeof id === "object" && !Array.isArray(id) && "filtro" in id ? id : null;
  const ids = filtro ? [] : [...new Set(typeof id === "string" ? [id] : Array.isArray(id) ? id : [])];
  if (!filtro && !ids.length) return { tipo: "permessi" };
  try {
    const query = filtro ? filtro.filtro(client.from(tabella).delete({ count: "exact" })) : vincolo && tabella === "preventivi_note"
      ? client.from("preventivi_note").delete({ count: "exact" }).in("id", ids).eq("preventivo_id", vincolo.preventivo_id)
      : client.from(tabella).delete({ count: "exact" }).in("id", ids);
    const { error, count } = await query;
    const esito = classificaEsitoEliminazione(error, count, filtro?.richiesti ?? ids.length);
    return esito.tipo === "eliminato" ? { ...esito, eliminati: count ?? 0 } : esito;
  } catch (error) {
    return { tipo: "errore", messaggio: error instanceof Error ? error.message : "Errore di connessione" };
  }
}

export function messaggioEsitoEliminazione(esito: EsitoEliminazione, cosa: string): string {
  if (esito.tipo === "collegato") {
    if (cosa === "questo cantiere") return "Il cantiere è usato in uno o più preventivi e non si può eliminare. Se non serve più, aprilo e togli la spunta «Cantiere attivo».";
    return `${cosa.charAt(0).toUpperCase()}${cosa.slice(1)} è collegato ad altri dati e non si può eliminare.`;
  }
  if (esito.tipo === "permessi") return `Non hai i permessi per eliminare ${cosa}.`;
  if (esito.tipo === "parziale") return `Eliminati ${esito.eliminati} su ${esito.richiesti}: per gli altri non hai i permessi.`;
  if (esito.tipo === "errore") return `Eliminazione non riuscita: ${esito.messaggio}`;
  return "";
}

export function messaggioEliminazioneCantiere(esito: Exclude<EsitoEliminazione, { tipo: "eliminato" }>): string {
  return messaggioEsitoEliminazione(esito, "questo cantiere");
}
