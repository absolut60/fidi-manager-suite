import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Intestazione del soggetto titolare del rapporto per pagine pubbliche e PDF di prova.
 * Un contatto può appartenere a un CLIENTE (cliente_id valorizzato) oppure a un
 * LEAD non ancora convertito (cliente_id NULL, lead_id valorizzato).
 * Fonte unica per getContattoPerConsensi, salvaConsensiMarketing e getContattoPerRecesso.
 */
export type IntestazioneSoggetto = {
  ragione_sociale: string;
  partita_iva: string | null;
  codice_fiscale: string | null;
  indirizzo: string | null;
  citta: string | null;
  origine: "cliente" | "lead" | "nessuna";
};

const VUOTA: IntestazioneSoggetto = {
  ragione_sociale: "",
  partita_iva: null,
  codice_fiscale: null,
  indirizzo: null,
  citta: null,
  origine: "nessuna",
};

export async function risolviIntestazioneSoggetto(contatto: {
  cliente_id: string | null;
  lead_id?: string | null;
}): Promise<IntestazioneSoggetto> {
  if (contatto.cliente_id) {
    const { data } = await supabaseAdmin
      .from("clienti")
      .select("ragione_sociale, partita_iva, codice_fiscale, indirizzo, citta")
      .eq("id", contatto.cliente_id)
      .maybeSingle();
    if (data) {
      return {
        ragione_sociale: data.ragione_sociale ?? "",
        partita_iva: data.partita_iva ?? null,
        codice_fiscale: data.codice_fiscale ?? null,
        indirizzo: data.indirizzo ?? null,
        citta: data.citta ?? null,
        origine: "cliente",
      };
    }
    return VUOTA;
  }

  if (contatto.lead_id) {
    const { data } = await supabaseAdmin
      .from("lead")
      .select("ragione_sociale, nome, cognome, partita_iva, codice_fiscale, indirizzo, citta")
      .eq("id", contatto.lead_id)
      .maybeSingle();
    if (data) {
      const denominazione =
        data.ragione_sociale?.trim() ||
        `${data.nome ?? ""} ${data.cognome ?? ""}`.trim();
      return {
        ragione_sociale: denominazione,
        partita_iva: data.partita_iva ?? null,
        codice_fiscale: data.codice_fiscale ?? null,
        indirizzo: data.indirizzo ?? null,
        citta: data.citta ?? null,
        origine: "lead",
      };
    }
  }

  return VUOTA;
}
