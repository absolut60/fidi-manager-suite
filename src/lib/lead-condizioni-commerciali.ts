import { campiRiferimentoPreventivo, type RiferimentoPreventivo } from "./condizioni-riferimento";
import { puoConsultarePreventivi } from "./permessi-preventivi";

export type CondizioniCommercialiLead = RiferimentoPreventivo & { condizione_pagamento_cod: string | null };

/** Le quattro condizioni sono richieste soltanto nella creazione dal documento. */
export function condizioniLeadMancanti(origine: "preventivo" | "altro", valori: CondizioniCommercialiLead): string[] {
  if (origine !== "preventivo") return [];
  return [
    valori.listino_rif == null ? "listino di riferimento" : null,
    !valori.macrocategoria_rif?.trim() ? "macrocategoria di riferimento" : null,
    !valori.categoria_rif?.trim() ? "categoria di riferimento" : null,
    !valori.condizione_pagamento_cod?.trim() ? "condizione di pagamento" : null,
  ].filter((v): v is string => v !== null);
}

/** Sezione nascosta: nessuno dei quattro campi entra nella scrittura dell'anagrafica. */
export function campiCondizioniCommercialiLead(roles: readonly string[], attivo: boolean, valori: CondizioniCommercialiLead): Partial<CondizioniCommercialiLead> {
  if (!puoConsultarePreventivi(roles)) return {};
  const riferimento = campiRiferimentoPreventivo(attivo, valori);
  if (!riferimento) throw new Error("Completa listino, macrocategoria e categoria di riferimento, oppure spegni il riferimento");
  return { ...riferimento, condizione_pagamento_cod: valori.condizione_pagamento_cod?.trim() || null };
}