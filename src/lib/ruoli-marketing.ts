import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

/** Ruoli abilitati all'intera sezione Marketing (segmenti, campagne, invii). */
export const MARKETING_ROLES = new Set<string>([
  "amministratore",
  "amministrazione",
  "direzione",
  "marketing",
]);

export function puoAccedereMarketing(roles: readonly (AppRole | string)[]): boolean {
  return roles.some((r) => MARKETING_ROLES.has(r as string));
}
