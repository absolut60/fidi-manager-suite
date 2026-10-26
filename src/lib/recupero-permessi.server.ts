// Guardia server per l'invio di comunicazioni di recupero al cliente.
// Regola unica nel DB: public.auth_puo_inviare_recupero() (gemello TS: src/lib/recupero-permessi.ts).
// Va chiamata con il client dell'utente (context.supabase), mai con il service role.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function assertPuoInviareRecupero(supabase: SupabaseClient<Database>): Promise<void> {
  const { data, error } = await supabase.rpc("auth_puo_inviare_recupero");
  if (error || data !== true) {
    throw new Error("L'invio delle comunicazioni di recupero è riservato al Recupero crediti.");
  }
}

// Guardia server per la gestione legale. Regola unica nel DB:
// public.auth_puo_gestire_legale() (gemello TS: puoGestireLegale in src/lib/recupero-permessi.ts).
export async function assertPuoGestireLegale(supabase: SupabaseClient<Database>): Promise<void> {
  const { data, error } = await supabase.rpc("auth_puo_gestire_legale");
  if (error || data !== true) {
    throw new Error("La gestione legale è riservata al Recupero crediti.");
  }
}
