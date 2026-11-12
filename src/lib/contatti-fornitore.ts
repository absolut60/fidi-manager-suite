// FM62 G6: referenti del fornitore. Stessa tabella `contatti` di clienti e lead
// (una sola scheda persona); lettura via RLS (auth_ha_accesso_fornitori),
// collega/scollega solo via RPC (auth_puo_gestire_fornitori).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isEmailValida } from "@/lib/email-validazione";

export const chiaveContattiFornitore = (fornitoreId: string) => ["contatti-fornitore", fornitoreId] as const;

export type ContattoFornitore = {
  id: string; nome: string; cognome: string | null; ruolo: string | null; email: string | null;
  telefono: string | null; cellulare: string | null; principale: boolean | null;
  cliente_id: string | null; lead_id: string | null; fornitore_id: string | null;
  privacy_firmata: boolean | null; data_firma: string | null;
  luogo_nascita: string | null; data_nascita: string | null; codice_fiscale: string | null; residenza: string | null;
  consenso_profilazione: boolean | null; consenso_marketing_media: boolean | null; consenso_marketing_diretto: boolean | null;
};
const COLONNE = "id, nome, cognome, ruolo, email, telefono, cellulare, principale, cliente_id, lead_id, fornitore_id, privacy_firmata, data_firma, luogo_nascita, data_nascita, codice_fiscale, residenza, consenso_profilazione, consenso_marketing_media, consenso_marketing_diretto";

export function useContattiFornitore(fornitoreId: string) {
  return useQuery({
    queryKey: chiaveContattiFornitore(fornitoreId),
    queryFn: async () => {
      const { data, error } = await supabase.from("contatti").select(COLONNE)
        .eq("fornitore_id", fornitoreId).order("principale", { ascending: false }).order("cognome").order("nome");
      if (error) throw new Error(error.message);
      return (data ?? []) as ContattoFornitore[];
    },
  });
}

export const nomeContatto = (c: { nome?: string | null; cognome?: string | null }) =>
  [c.nome, c.cognome].map(v => v?.trim()).filter(Boolean).join(" ") || "Contatto";

/** Le persone del Riepilogo: principali prima, al massimo `max`. */
export function personePrincipali<T extends { principale?: boolean | null }>(contatti: T[], max = 3): T[] {
  return [...contatti].sort((a, b) => Number(!!b.principale) - Number(!!a.principale)).slice(0, max);
}

/** Suggerimenti "+ Nome" per l'email al fornitore: solo email valide, una per indirizzo. */
export function suggerimentiContattiEmail(contatti: { nome?: string | null; cognome?: string | null; email?: string | null }[]) {
  const visti = new Set<string>();
  const out: { etichetta: string; valore: string }[] = [];
  for (const c of contatti) {
    const e = c.email?.trim();
    if (!e || !isEmailValida(e)) continue;
    const k = e.toLowerCase();
    if (visti.has(k)) continue;
    visti.add(k);
    out.push({ etichetta: nomeContatto(c), valore: e });
  }
  return out;
}

export type ContattoCollegabile = { id: string; nome: string | null; cognome: string | null; ruolo: string | null; email: string | null; telefono: string | null; cellulare: string | null; azienda: string | null; del_cliente_collegato: boolean | null };

export async function cercaContattiCollegabili(fornitoreId: string, testo: string): Promise<ContattoCollegabile[]> {
  const { data, error } = await supabase.rpc("cerca_contatti_collegabili_fornitore", { _fornitore_id: fornitoreId, _testo: testo.trim() || undefined });
  if (error) throw new Error(error.message.includes("Accesso non consentito") ? "Accesso non consentito" : error.message);
  return (data ?? []) as ContattoCollegabile[];
}
export async function collegaContattoFornitore(contattoId: string, fornitoreId: string) {
  const { error } = await supabase.rpc("collega_contatto_fornitore", { _contatto_id: contattoId, _fornitore_id: fornitoreId });
  if (error) throw new Error(error.message);
}
/** "scollegato" se la persona resta a un cliente/lead, "eliminato" se era solo del fornitore. */
export async function scollegaContattoFornitore(contattoId: string, fornitoreId: string): Promise<"scollegato" | "eliminato"> {
  const { data, error } = await supabase.rpc("scollega_contatto_fornitore", { _contatto_id: contattoId, _fornitore_id: fornitoreId });
  if (error) throw new Error(error.message);
  return data === "eliminato" ? "eliminato" : "scollegato";
}
/** Testo della conferma di "Scollega": dice se la persona verrà eliminata. */
export function testoConfermaScollega(c: { cliente_id: string | null; lead_id: string | null }): string {
  return c.cliente_id || c.lead_id
    ? "La persona resta nella scheda del cliente/lead: viene tolta solo da questo fornitore."
    : "La persona è collegata solo a questo fornitore: verrà eliminata definitivamente, con i suoi consensi privacy.";
}
