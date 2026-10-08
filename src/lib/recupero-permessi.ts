// Regola unica: chi può inviare comunicazioni di recupero al cliente
// (sollecito email, email libera, lettera PDF, invio massivo).
// Gemello SQL: public.auth_puo_inviare_recupero(). Se cambia uno, cambia l'altro.

export const RUOLI_INVIO_RECUPERO = ["recupero_crediti", "amministratore"] as const;

export function puoInviareComunicazioniRecupero(roles: readonly string[]): boolean {
  return RUOLI_INVIO_RECUPERO.some((r) => roles.includes(r));
}
