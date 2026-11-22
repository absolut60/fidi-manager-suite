/** Normalizzazione già usata nei form lead: nessuna verifica fiscale aggiuntiva. */
export function normalizzaTestoLead(v?: string | null): string | null {
  const s = (v ?? '').trim();
  return s.length > 0 ? s : null;
}

/** I due form lead accettano entrambi fino a 20 caratteri per P.IVA e CF. */
export const LIMITE_IDENTIFICATIVO_LEAD = 20;