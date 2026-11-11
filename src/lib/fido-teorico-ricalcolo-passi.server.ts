/**
 * Passi del ricalcolo del fido teorico (fonte unica per il job Inngest automatico
 * e per il pulsante "Ricalcola fido teorico ora"):
 * avvia → blocchi → finalizza → aggiorna_alert_fidi → origine. Gli avvisi sono
 * gestiti soltanto dal job a orario fisso, mai dal ricalcolo.
 *
 * Ogni passo è una chiamata separata: le RPC passano dal Data API, dove vale il
 * limite di 8 secondi per istruzione. Blocchi da 200 clienti e riprova automatica
 * sui timeout (fido-teorico-ricalcolo-riprova.ts): il tempo di un blocco è variabile.
 * Un solo ricalcolo alla volta: ogni passo prende/rinnova il lock (fido-teorico-ricalcolo-lock.ts),
 * rilasciato a fine sequenza o scaduto dopo 3 minuti senza avanzamento (SCADENZA_LOCK_MS).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  DIMENSIONE_BLOCCO_FIDO_TEORICO,
  bloccoConRiprova,
  rpcConRiprova,
  type ClienteRpc,
} from "@/lib/fido-teorico-ricalcolo-riprova";

import {
  LOCK_CHIAVE,
  prendiOAggiornaLock,
  rilasciaLock,
  type ArchivioLock,
  type Avanzamento,
  type OrigineRicalcolo,
} from "@/lib/fido-teorico-ricalcolo-lock";

export { DIMENSIONE_BLOCCO_FIDO_TEORICO };

/** Lock unico (fetta 4d): riga in configurazioni, scritture condizionate. */
const archivioLock: ArchivioLock = {
  async leggi() {
    const { data, error } = await supabaseAdmin
      .from("configurazioni").select("valore, updated_at").eq("chiave", LOCK_CHIAVE).maybeSingle();
    if (error) throw errore("lettura lock", error);
    return data ?? null;
  },
  async inserisci(valore, oraIso) {
    const { error } = await supabaseAdmin.from("configurazioni").insert({
      chiave: LOCK_CHIAVE, valore, updated_at: oraIso,
      descrizione: "Lock del ricalcolo fido teorico in corso (scade dopo 3 minuti senza avanzamento)",
    });
    if (!error) return true;
    if (error.code === "23505") return false;
    throw errore("presa lock", error);
  },
  async sostituisciSe(valore, oraIso, updatedAtLetto) {
    const { data, error } = await supabaseAdmin.from("configurazioni")
      .update({ valore, updated_at: oraIso })
      .eq("chiave", LOCK_CHIAVE).eq("updated_at", updatedAtLetto).select("chiave");
    if (error) throw errore("presa lock scaduto", error);
    return (data?.length ?? 0) > 0;
  },
  async aggiornaSeToken(valore, oraIso, token) {
    const { data, error } = await supabaseAdmin.from("configurazioni")
      .update({ valore, updated_at: oraIso })
      .eq("chiave", LOCK_CHIAVE).like("valore", `%"token":"${token}"%`).select("chiave");
    if (error) throw errore("aggiornamento lock", error);
    return (data?.length ?? 0) > 0;
  },
  async eliminaSeToken(token) {
    const { error } = await supabaseAdmin.from("configurazioni")
      .delete().eq("chiave", LOCK_CHIAVE).like("valore", `%"token":"${token}"%`);
    if (error) throw errore("rilascio lock", error);
  },
};

export type LockRicalcolo = { token: string; origine: OrigineRicalcolo; avviatoDa?: string | null };

/** Prende o rinnova il lock; se un altro ricalcolo è attivo lancia ErroreRicalcoloInCorso. */
export async function passoLock(lock: LockRicalcolo, avanzamento: Avanzamento, nuovoAvvio = false): Promise<void> {
  await prendiOAggiornaLock(archivioLock, { ...lock, avanzamento, nuovoAvvio });
}

export async function passoRilasciaLock(token: string): Promise<void> {
  await rilasciaLock(archivioLock, token);
}

const client = supabaseAdmin as unknown as ClienteRpc;

function errore(passo: string, e: { message: string }): Error {
  return new Error(`Ricalcolo fido teorico, passo "${passo}": ${e.message}`);
}

export async function passoAvvia(lock: LockRicalcolo): Promise<{ totaleClienti: number; blocchiPrevisti: number }> {
  await passoLock(lock, { fase: "preparazione", blocco: null, previsti: null }, true);
  const { error } = await supabaseAdmin.rpc("ricalcola_fido_teorico_avvia");
  if (error) throw errore("preparazione", error);
  const { count, error: e2 } = await supabaseAdmin.from("clienti").select("id", { count: "exact", head: true });
  if (e2) throw errore("conteggio clienti", e2);
  const totale = count ?? 0;
  const blocchiPrevisti = Math.max(1, Math.ceil(totale / DIMENSIONE_BLOCCO_FIDO_TEORICO));
  await passoLock(lock, { fase: "blocchi", blocco: null, previsti: blocchiPrevisti });
  return { totaleClienti: totale, blocchiPrevisti };
}

/** Restituisce l'ultimo id elaborato, oppure null quando non ci sono altri clienti. Riprova sui timeout. */
export async function passoBlocco(
  lock: LockRicalcolo,
  dopoId: string | null,
  numero: number,
  previsti: number | null,
): Promise<string | null> {
  await passoLock(lock, { fase: "blocchi", blocco: numero, previsti });
  return bloccoConRiprova(client, dopoId);
}

/** Da chiamare solo dopo che tutti i blocchi sono andati a buon fine. Riprova sui timeout. */
export async function passoFinalizza(lock: LockRicalcolo): Promise<void> {
  await passoLock(lock, { fase: "chiusura", blocco: null, previsti: null });
  await rpcConRiprova(client, "finalizzazione", "ricalcola_fido_teorico_finalizza");
}

/** Da chiamare solo dopo la finalizzazione. Riprova sui timeout. */
export async function passoAlertFidi(lock: LockRicalcolo): Promise<unknown> {
  await passoLock(lock, { fase: "alert", blocco: null, previsti: null });
  return rpcConRiprova(client, "alert fidi", "aggiorna_alert_fidi");
}

/** Nome leggibile di chi avvia il ricalcolo manuale (per "avviato da …"). */
export async function nomeUtente(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("profili").select("nome, cognome").eq("id", userId).maybeSingle();
  const n = [data?.nome, data?.cognome].filter(Boolean).join(" ").trim();
  return n || null;
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
