import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ErroreEliminazione = { code?: string; message: string };
export type EsitoEliminazione =
  | { tipo: "eliminato" }
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
  id: string | readonly string[],
  vincolo?: { preventivo_id: string },
): Promise<EsitoEliminazione> {
  const ids = [...new Set(typeof id === "string" ? [id] : id)];
  if (!ids.length) return { tipo: "permessi" };
  try {
    const query = vincolo && tabella === "preventivi_note"
      ? supabase.from("preventivi_note").delete({ count: "exact" }).in("id", ids).eq("preventivo_id", vincolo.preventivo_id)
      : supabase.from(tabella).delete({ count: "exact" }).in("id", ids);
    const { error, count } = await query;
    return classificaEsitoEliminazione(error, count, ids.length);
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
