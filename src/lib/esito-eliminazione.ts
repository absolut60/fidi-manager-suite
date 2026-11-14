import { supabase } from "@/integrations/supabase/client";

type ErroreEliminazione = { code?: string; message: string };
export type EsitoEliminazione =
  | { tipo: "eliminato" }
  | { tipo: "collegato" }
  | { tipo: "permessi" }
  | { tipo: "errore"; messaggio: string };

export function classificaEsitoEliminazione(
  error: ErroreEliminazione | null,
  righe: readonly { id: unknown }[] | null,
): EsitoEliminazione {
  if (error?.code === "23503") return { tipo: "collegato" };
  if (error?.code === "42501") return { tipo: "permessi" };
  if (error) return { tipo: "errore", messaggio: error.message };
  return { tipo: righe?.length ? "eliminato" : "permessi" };
}

export async function eliminaConEsito(
  tabella: "cantieri" | "cantiere_listini_speciali", id: string,
): Promise<EsitoEliminazione> {
  try {
    const { error, data } = await supabase.from(tabella).delete().eq("id", id).select("id");
    return classificaEsitoEliminazione(error, data);
  } catch (error) {
    return { tipo: "errore", messaggio: error instanceof Error ? error.message : "Errore di connessione" };
  }
}

export function messaggioEliminazioneCantiere(esito: Exclude<EsitoEliminazione, { tipo: "eliminato" }>): string {
  if (esito.tipo === "collegato") return "Il cantiere è usato in uno o più preventivi e non si può eliminare. Se non serve più, aprilo e togli la spunta «Cantiere attivo».";
  if (esito.tipo === "permessi") return "Non hai i permessi per eliminare questo cantiere.";
  return `Eliminazione non riuscita: ${esito.messaggio}`;
}