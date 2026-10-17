// Regola unica: chi può inviare comunicazioni di recupero al cliente
// (sollecito email, email libera, lettera PDF, invio massivo).
// Gemello SQL: public.auth_puo_inviare_recupero(). Se cambia uno, cambia l'altro.

export const RUOLI_INVIO_RECUPERO = ["recupero_crediti", "amministratore"] as const;

export function puoInviareComunicazioniRecupero(roles: readonly string[]): boolean {
  return RUOLI_INVIO_RECUPERO.some((r) => roles.includes(r));
}

// Tipi di azione di recupero che un agente "puro" può registrare.
// Gemello SQL: policy INSERT "Store manager e agente inseriscono azioni sui propri clienti"
// su public.azioni_recupero (migrazione 0044, FM45). Se cambia uno, cambia l'altro.
// (La policy vieta all'agente anche l'esito 'piano_rientro'.)
export const TIPI_AZIONE_AGENTE = ["nota", "promemoria", "telefonata"] as const;
const RUOLI_TUTTI_I_TIPI = ["amministratore", "amministrazione", "direzione", "recupero_crediti"] as const;

/** null = tutti i tipi consentiti; altrimenti l'elenco dei soli tipi ammessi. */
export function tipiAzioneConsentiti(roles: readonly string[]): readonly string[] | null {
  const soloAgente = roles.includes("agente") && !RUOLI_TUTTI_I_TIPI.some((r) => roles.includes(r));
  return soloAgente ? TIPI_AZIONE_AGENTE : null;
}

export function tipoAzioneConsentito(roles: readonly string[], tipo: string): boolean {
  const ammessi = tipiAzioneConsentiti(roles);
  return ammessi === null || ammessi.includes(tipo);
}
