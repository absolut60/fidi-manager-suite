/**
 * FM44: i controlli server per amministratori richiedono anche il secondo fattore (sessione aal2).
 * Fonte unica lato server, gemella del ramo amministratore di public.has_role() / auth_mfa_ok().
 * `claims` = context.claims di requireSupabaseAuth.
 */
export const MESSAGGIO_SERVE_CODICE = "Inserisci il codice della verifica in due passaggi per continuare.";

export function sessioneAal2(claims: unknown): boolean {
  return (claims as { aal?: unknown } | null | undefined)?.aal === "aal2";
}

export function assertSessioneAal2(claims: unknown): void {
  if (!sessioneAal2(claims)) throw new Error(MESSAGGIO_SERVE_CODICE);
}

/** Ruoli validi per i controlli: senza aal2 il ruolo amministratore non conta (come has_role nel DB). */
export function ruoliEffettivi<T extends string>(ruoli: readonly T[], claims: unknown): T[] {
  return sessioneAal2(claims) ? [...ruoli] : ruoli.filter((r) => r !== "amministratore");
}
