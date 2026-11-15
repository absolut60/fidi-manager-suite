import { campiRiferimentoPreventivo, type RiferimentoPreventivo } from "./condizioni-riferimento";
import { puoConsultarePreventivi } from "./permessi-preventivi";

export type CondizioniCommercialiLead = RiferimentoPreventivo & { condizione_pagamento_cod: string | null };

/** Sezione nascosta: nessuno dei quattro campi entra nella scrittura dell'anagrafica. */
export function campiCondizioniCommercialiLead(roles: readonly string[], attivo: boolean, valori: CondizioniCommercialiLead): Partial<CondizioniCommercialiLead> {
  if (!puoConsultarePreventivi(roles)) return {};
  const riferimento = campiRiferimentoPreventivo(attivo, valori);
  if (!riferimento) throw new Error("Completa listino, macrocategoria e categoria di riferimento, oppure spegni il riferimento");
  return { ...riferimento, condizione_pagamento_cod: valori.condizione_pagamento_cod?.trim() || null };
}