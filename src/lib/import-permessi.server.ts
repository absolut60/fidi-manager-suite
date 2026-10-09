/**
 * Guardie server per l'avvio degli import (FM41). Usare solo da server functions,
 * sempre con il client DELL'UTENTE (context.supabase), mai con il service role.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { puoImportareGamma } from "./import-permessi";

type Client = SupabaseClient<Database>;

export async function assertPuoImportareGamma(supabase: Client, userId: string): Promise<void> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ruoli = (data ?? []).map((r) => String(r.role));
  if (error || !puoImportareGamma(ruoli)) {
    throw new Error("L'avvio degli import è riservato ad Amministrazione — Strumenti.");
  }
}

export async function assertPuoImportareEventi(supabase: Client, userId: string): Promise<void> {
  const { data, error } = await supabase.rpc("has_eventi_flusso_access", { _user_id: userId });
  if (error || data !== true) {
    throw new Error("L'import dei partecipanti è riservato a chi gestisce gli eventi.");
  }
}

export async function assertImportazioneEsiste(
  supabase: Client,
  importazioneId: string,
  fonteAttesa?: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("importazioni")
    .select("id, fonte")
    .eq("id", importazioneId)
    .maybeSingle();
  if (error || !data || (fonteAttesa !== undefined && String(data.fonte) !== fonteAttesa)) {
    throw new Error("Importazione non trovata o non accessibile.");
  }
}
