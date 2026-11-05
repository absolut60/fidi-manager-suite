/**
 * Chi può collegare/aggiornare i dati Cerved di un cliente.
 * Gemello SQL: public.auth_puo_aggiornare_cerved() — tenere allineati.
 */
export const RUOLI_AGGIORNANO_CERVED = ["amministratore", "amministrazione", "recupero_crediti"] as const;

export function puoAggiornareCerved(roles: string[]): boolean {
  return roles.some((r) => (RUOLI_AGGIORNANO_CERVED as readonly string[]).includes(r));
}
