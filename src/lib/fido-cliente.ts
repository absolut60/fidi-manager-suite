/**
 * UNICO punto di verita' per il "Fido attuale" di un cliente.
 *
 * Il fido attuale del cliente = `clienti.fido_gestionale` (dato di sincronia
 * dal gestionale). NON usare `fido_aziendale_concesso`: quello e' l'ultimo
 * fido approvato lato azienda e puo' divergere dal dato gestionale.
 *
 * Usare SEMPRE questi helper ovunque venga mostrato il "fido attuale" del
 * cliente (form richiesta singola, proposta massiva, lista richieste, coda
 * approvazioni, scheda cliente). Cosi' il valore non puo' piu' divergere
 * da una vista all'altra.
 */
export const FIDO_CLIENTE_FIELD = "fido_gestionale" as const;

/** Frammento di select PostgREST da inserire dentro `clienti(...)`. */
export const FIDO_CLIENTE_SELECT = "fido_gestionale";

type ClienteFidoSource = { fido_gestionale?: number | string | null } | null | undefined;

/** Restituisce il fido attuale del cliente come number (0 se mancante). */
export function getFidoAttuale(cliente: ClienteFidoSource): number {
  return Number(cliente?.fido_gestionale ?? 0);
}
