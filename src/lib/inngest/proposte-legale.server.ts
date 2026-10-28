// FONTE UNICA della notifica "proposta_legale" (messa in mora ripetuta → proposta
// di passaggio al legale). Usata dal job sollecito-massivo e dall'invio singolo
// (inviaEmailRecupero). Destinatari: getDestinatariRecuperoCrediti.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDestinatariRecuperoCrediti } from "./destinatari-recupero.server";
import { formatEuro } from "@/lib/fidi";

export type PropostaLegale = { id: string; ragione_sociale: string; negozio: string | null; totale: number };

/**
 * Inserisce una notifica per ogni utente del recupero crediti e segna
 * notificato_at sulle righe clienti_scaduto60_ingressi. Lancia in caso di errore.
 * Restituisce il numero di destinatari notificati.
 */
export async function notificaProposteLegale(
  proposte: readonly PropostaLegale[],
  metadata: Record<string, unknown>,
): Promise<number> {
  if (!proposte.length) return 0;
  const destinatari = await getDestinatariRecuperoCrediti();
  const ids = proposte.map((p) => p.id);
  if (destinatari.length) {
    const n = proposte.length;
    const righe = proposte
      .slice(0, 5)
      .map((p) => `${p.ragione_sociale}${p.negozio ? ` (${p.negozio})` : ""} — ${formatEuro(p.totale)}`);
    if (n > 5) righe.push(`e altri ${n - 5}`);
    const { error } = await supabaseAdmin.from("notifiche").insert(
      destinatari.map((uid) => ({
        user_id: uid,
        tipo: "proposta_legale",
        titolo: `${n} ${n === 1 ? "cliente" : "clienti"} da valutare per il legale — messa in mora ripetuta`,
        messaggio: righe.join("\n"),
        link: "/recupero-agenzia",
        metadata: { ...metadata, ingressi: ids },
      })) as never,
    );
    if (error) throw new Error(`insert notifiche: ${error.message}`);
  } else {
    console.warn(`[proposte-legale] nessun destinatario recupero_crediti per ${ids.length} proposte legale`);
  }
  const { error: eM } = await supabaseAdmin
    .from("clienti_scaduto60_ingressi" as never)
    .update({ notificato_at: new Date().toISOString() } as never)
    .in("id", ids);
  if (eM) throw new Error(`marca notificati: ${(eM as { message: string }).message}`);
  return destinatari.length;
}
