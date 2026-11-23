import { supabase } from "@/integrations/supabase/client";
import type { LeadFonte, LeadPriorita, LeadTipo } from "@/lib/lead-costanti";
import { normalizzaCodiceSdi } from './codice-sdi';
import { normalizzaTestoLead as t } from './lead-anagrafica';
import { LEAD_PREVENTIVO_SELECT } from './lead-preventivo-api';
import type { LeadPreventivo } from './soggetto-preventivo';
import type { CondizioniCommercialiLead } from './lead-condizioni-commerciali';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

/**
 * Creazione lead: unica via applicativa.
 * Replica la logica storicamente inline nel dialog "Nuovo lead":
 * insert su `lead` (stato "nuovo") + riga di storico stato_da:null → stato_a:"nuovo".
 */
export type CreaLeadInput = Partial<CondizioniCommercialiLead> & {
  tipo_soggetto?: "azienda" | "persona_fisica";
  ragione_sociale?: string | null;
  nome?: string | null;
  cognome?: string | null;
  partita_iva?: string | null;
  codice_fiscale?: string | null;
  codice_sdi?: string | null;
  email?: string | null;
  telefono?: string | null;
  cellulare?: string | null;
  indirizzo?: string | null;
  citta?: string | null;
  cap?: string | null;
  provincia?: string | null;
  fonte?: LeadFonte;
  fonte_dettaglio?: string | null;
  tipo_lead?: LeadTipo;
  priorita?: LeadPriorita;
  store_id?: string | null;
  agente_codice?: string | null;
  note?: string | null;
  createdBy?: string | null;
  /** Nota registrata nello storico alla creazione. */
  notaStorico?: string;
};

export async function creaLead(input: CreaLeadInput, client: SupabaseClient<Database> = supabase): Promise<LeadPreventivo> {
  const payload = {
    tipo_soggetto: input.tipo_soggetto ?? "azienda",
    ragione_sociale: t(input.ragione_sociale),
    nome: t(input.nome),
    cognome: t(input.cognome),
    partita_iva: t(input.partita_iva),
    codice_fiscale: t(input.codice_fiscale),
    ...(input.codice_sdi !== undefined ? { codice_sdi: normalizzaCodiceSdi(input.codice_sdi) || null } : {}),
    email: t(input.email),
    telefono: t(input.telefono),
    cellulare: t(input.cellulare),
    indirizzo: t(input.indirizzo),
    citta: t(input.citta),
    cap: t(input.cap),
    provincia: t(input.provincia),
    fonte: input.fonte ?? "manuale",
    fonte_dettaglio: t(input.fonte_dettaglio),
    tipo_lead: input.tipo_lead ?? "potenziale_cliente",
    priorita: input.priorita ?? "media",
    store_id: input.store_id || null,
    agente_codice: input.agente_codice || null,
    note: t(input.note),
    stato: "nuovo" as const,
    created_by: input.createdBy ?? null,
    ...(input.listino_rif !== undefined ? { listino_rif: input.listino_rif } : {}),
    ...(input.macrocategoria_rif !== undefined ? { macrocategoria_rif: t(input.macrocategoria_rif) } : {}),
    ...(input.categoria_rif !== undefined ? { categoria_rif: t(input.categoria_rif) } : {}),
    ...(input.condizione_pagamento_cod !== undefined ? { condizione_pagamento_cod: t(input.condizione_pagamento_cod) } : {}),
  };

  const { data, error } = await client.from("lead").insert(payload).select(LEAD_PREVENTIVO_SELECT).single();
  if (error) throw error;
  if (!data) throw new Error("Creazione lead non riuscita");

  await client.from("lead_storico").insert({
    lead_id: data.id,
    stato_da: null,
    stato_a: "nuovo",
    operatore_id: input.createdBy ?? null,
    nota: input.notaStorico ?? "Lead creato",
  });

  return data;
}
