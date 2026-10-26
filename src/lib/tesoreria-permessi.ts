import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * Chi gestisce la tesoreria (bonifici di acconto delle richieste interne):
 * registra il bonifico eseguito e riceve gli avvisi. Decisione di Andrea, FM48.
 * Gemello SQL: `public.auth_puo_gestire_tesoreria()` (migrazione
 * `0078_fm48_richieste_bonifico_acconto.sql`). Tenere allineati.
 */
export const RUOLI_TESORERIA = ["tesoreria", "amministratore"] as const satisfies readonly AppRole[];

export function puoGestireTesoreria(roles: readonly string[] | null | undefined): boolean {
  if (!roles) return false;
  return roles.some((r) => (RUOLI_TESORERIA as readonly string[]).includes(r));
}
