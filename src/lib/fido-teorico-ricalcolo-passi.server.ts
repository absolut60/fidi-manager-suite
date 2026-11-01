/**
 * Passi del ricalcolo del fido teorico (fonte unica per il job Inngest automatico
 * e per il pulsante "Ricalcola fido teorico ora"):
 * avvia → blocchi → finalizza → aggiorna_alert_fidi → notifiche (interruttore DB) → origine.
 *
 * Ogni passo è una chiamata separata: le RPC passano dal Data API, dove vale il
 * limite di 8 secondi per istruzione. Blocchi da 200 clienti e riprova automatica
 * sui timeout (fido-teorico-ricalcolo-riprova.ts): il tempo di un blocco è variabile.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  DIMENSIONE_BLOCCO_FIDO_TEORICO,
  bloccoConRiprova,
  rpcConRiprova,
  type ClienteRpc,
} from "@/lib/fido-teorico-ricalcolo-riprova";

export { DIMENSIONE_BLOCCO_FIDO_TEORICO };

const client = supabaseAdmin as unknown as ClienteRpc;

function errore(passo: string, e: { message: string }): Error {
  return new Error(`Ricalcolo fido teorico, passo "${passo}": ${e.message}`);
}

export async function passoAvvia(): Promise<{ totaleClienti: number; blocchiPrevisti: number }> {
  const { error } = await supabaseAdmin.rpc("ricalcola_fido_teorico_avvia");
  if (error) throw errore("preparazione", error);
  const { count, error: e2 } = await supabaseAdmin.from("clienti").select("id", { count: "exact", head: true });
  if (e2) throw errore("conteggio clienti", e2);
  const totale = count ?? 0;
  return { totaleClienti: totale, blocchiPrevisti: Math.max(1, Math.ceil(totale / DIMENSIONE_BLOCCO_FIDO_TEORICO)) };
}

/** Restituisce l'ultimo id elaborato, oppure null quando non ci sono altri clienti. Riprova sui timeout. */
export async function passoBlocco(dopoId: string | null): Promise<string | null> {
  return bloccoConRiprova(client, dopoId);
}

/** Da chiamare solo dopo che tutti i blocchi sono andati a buon fine. Riprova sui timeout. */
export async function passoFinalizza(): Promise<void> {
  await rpcConRiprova(client, "finalizzazione", "ricalcola_fido_teorico_finalizza");
}

/** Da chiamare solo dopo la finalizzazione. Riprova sui timeout. */
export async function passoAlertFidi(): Promise<unknown> {
  return rpcConRiprova(client, "alert fidi", "aggiorna_alert_fidi");
}

/** Nessuna scrittura se l'interruttore DB delle notifiche non è esattamente 'true'. */
export async function passoNotificheAlertFidi(): Promise<unknown> {
  const { data, error } = await supabaseAdmin.rpc("invia_notifiche_alert_fidi" as never);
  if (error) throw errore("notifiche alert fidi", error);
  return data as unknown;
}

export async function passoRegistraOrigine(origine: "automatico" | "manuale"): Promise<void> {
  const { error } = await supabaseAdmin.from("configurazioni").upsert(
    {
      chiave: "fido_teorico_ultimo_ricalcolo_origine",
      valore: origine,
      descrizione: "Origine dell'ultimo ricalcolo del fido teorico (automatico | manuale)",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "chiave" },
  );
  if (error) throw errore("registrazione origine", error);
}
