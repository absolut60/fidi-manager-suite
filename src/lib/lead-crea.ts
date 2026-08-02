import { supabase } from "@/integrations/supabase/client";
import type { LeadFonte, LeadPriorita, LeadTipo } from "@/lib/lead-costanti";

/**
 * Creazione lead: unica via applicativa.
 * Replica la logica storicamente inline nel dialog "Nuovo lead":
 * insert su `lead` (stato "nuovo") + riga di storico stato_da:null → stato_a:"nuovo".
 */
export type CreaLeadInput = {
  tipo_soggetto?: "azienda" | "persona_fisica";
  ragione_sociale?: string | null;
  nome?: string | null;
  cognome?: string | null;
  partita_iva?: string | null;
  codice_fiscale?: string | null;
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

/** Trim + null se vuoto: stessa normalizzazione del dialog. */
function t(v?: string | null): string | null {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
}

export async function creaLead(input: CreaLeadInput): Promise<{ id: string }> {
  const payload = {
    tipo_soggetto: input.tipo_soggetto ?? "azienda",
    ragione_sociale: t(input.ragione_sociale),
    nome: t(input.nome),
    cognome: t(input.cognome),
    partita_iva: t(input.partita_iva),
    codice_fiscale: t(input.codice_fiscale),
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
  };

  const { data, error } = await supabase.from("lead").insert(payload).select("id").single();
  if (error) throw error;
  if (!data) throw new Error("Creazione lead non riuscita");

  await supabase.from("lead_storico").insert({
    lead_id: data.id,
    stato_da: null,
    stato_a: "nuovo",
    operatore_id: input.createdBy ?? null,
    nota: input.notaStorico ?? "Lead creato",
  });

  return { id: data.id };
}
