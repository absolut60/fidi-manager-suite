/**
 * Chiavi di cache del riferimento richiesta (fetchFidoTeoricoPerRichiesta).
 * Forme di dato diverse = prefissi diversi: la richiesta singola salva un numero,
 * la proposta massiva una Map. Con lo stesso prefisso e un solo cliente selezionato
 * le chiavi coincidevano e la massiva riceveva un numero ("F.get is not a function").
 */
export const chiaveRiferimentoRichiestaSingola = (userId: string | null | undefined, clienteId: string) =>
  ["fido-teorico-per-richiesta-singola", userId ?? null, clienteId] as const;

export const chiaveRiferimentoRichiestaMassiva = (userId: string | null | undefined, clienteIds: string[]) =>
  ["fido-teorico-per-richiesta-massivo", userId ?? null, [...clienteIds].sort().join(",")] as const;
