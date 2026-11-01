/**
 * Passi del ricalcolo del fido teorico (fonte unica per il job Inngest automatico
 * e per il pulsante "Ricalcola fido teorico ora"):
 * avvia → blocchi → finalizza → aggiorna_alert_fidi → notifiche (interruttore DB) → origine.
 *
 * Ogni passo è una chiamata separata: le RPC passano dal Data API, dove vale il
 * limite di 8 secondi per istruzione; per questo i blocchi sono da 500 clienti
 * (1000 clienti superavano il limite dopo FM55 fetta 3).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const DIMENSIONE_BLOCCO_FIDO_TEORICO = 500;

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

/** Restituisce l'ultimo id elaborato, oppure null quando non ci sono altri clienti. */
export async function passoBlocco(dopoId: string | null): Promise<string | null> {
  const res = await supabaseAdmin.rpc(
    "ricalcola_fido_teorico_blocco",
    { _dopo_id: dopoId, _dimensione: DIMENSIONE_BLOCCO_FIDO_TEORICO } as never,
  );
  if (res.error) throw errore("blocco", res.error);
  return (res.data as unknown as string | null) ?? null;
}

export async function passoFinalizza(): Promise<void> {
  const { error } = await supabaseAdmin.rpc("ricalcola_fido_teorico_finalizza");
  if (error) throw errore("finalizzazione", error);
}

export async function passoAlertFidi(): Promise<unknown> {
  const { data, error } = await supabaseAdmin.rpc("aggiorna_alert_fidi" as never);
  if (error) throw errore("alert fidi", error);
  return data as unknown;
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
