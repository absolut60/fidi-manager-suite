import { supabase } from "@/integrations/supabase/client";
import { inviaEmailComunicazioneRichiesta } from "@/lib/comunicazioni-richiesta.functions";

export type DestinatarioComunicazione = "richiedente" | "approvatore" | "tutti";

export const DESTINATARIO_LABEL: Record<DestinatarioComunicazione, string> = {
  richiedente: "Richiedente",
  approvatore: "Approvatore",
  tutti: "Tutti",
};

/**
 * Sistema unificato di invio comunicazioni su richiesta fido.
 * - Salva il messaggio nello storico (comunicazioni_richiesta) tramite RPC SECURITY DEFINER.
 * - Crea notifiche in-app (tabella notifiche) per i destinatari giusti.
 * - Invia email (best-effort, non bloccante) tramite server function.
 *
 * I destinatari vengono risolti server-side dalla RPC, in base al ruolo:
 *   - "richiedente"  -> created_by della richiesta
 *   - "approvatore"  -> tutti gli approvatori liv1/2/3 + admin + amministrazione + direzione
 *   - "tutti"        -> entrambi
 */
export async function inviaComunicazioneRichiesta(opts: {
  richiestaId: string;
  destinatario: DestinatarioComunicazione;
  testo: string;
  autoreId: string;
  autoreEmail?: string | null;
}): Promise<{ comunicazioneId: string; destinatariCount: number }> {
  const { richiestaId, destinatario, testo } = opts;
  const testoTrim = testo.trim();
  if (!testoTrim) throw new Error("Testo vuoto");

  // 1) Insert + notifiche in-app via RPC (atomico, security definer)
  const { data, error } = await (supabase as any).rpc("invia_comunicazione_richiesta", {
    _richiesta_id: richiestaId,
    _destinatario: destinatario,
    _testo: testoTrim,
  });
  if (error) throw error;

  const result = data as {
    comunicazione_id: string;
    destinatari_user_ids: string[];
    cliente: string;
  };
  const destinatariIds = result?.destinatari_user_ids ?? [];

  // 2) Email best-effort dal server (FM41 fetta 1): non bloccante, non rompe il save.
  if (destinatariIds.length > 0 && result?.comunicazione_id) {
    inviaEmailComunicazioneRichiesta({
      data: { comunicazioneId: result.comunicazione_id, destinatariIds },
    }).catch((e) => console.error("Errore email comunicazione:", e));
  }

  return {
    comunicazioneId: result?.comunicazione_id,
    destinatariCount: destinatariIds.length,
  };
}

/**
 * Marca tutte le comunicazioni di una richiesta come lette dall'utente corrente.
 * Usa la RPC SECURITY DEFINER che gestisce l'array letto_da senza richiedere RLS UPDATE.
 */
export async function marcaComunicazioniLette(richiestaId: string): Promise<void> {
  await (supabase as any).rpc("marca_comunicazioni_lette", { _richiesta_id: richiestaId });
}
