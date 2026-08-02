import { supabase } from "@/integrations/supabase/client";

/**
 * Creazione contatto-persona: unica via applicativa.
 * Ritorna l'id del contatto creato (serve al flusso firma privacy).
 * La normalizzazione di email/telefoni è a carico del trigger DB
 * `fn_normalizza_contatti`, che si applica da solo.
 */
export type CreaContattoPersonaInput = {
  cliente_id?: string | null;
  lead_id?: string | null;
  nome: string;
  cognome?: string | null;
  email?: string | null;
  telefono?: string | null;
  cellulare?: string | null;
  codice_fiscale?: string | null;
  ruolo?: string | null;
};

function t(v?: string | null): string | null {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
}

export async function creaContattoPersona(
  input: CreaContattoPersonaInput,
): Promise<{ id: string }> {
  const nome = input.nome.trim();
  if (!nome) throw new Error("Il nome del contatto è obbligatorio");
  if (!input.cliente_id && !input.lead_id) {
    throw new Error("Il contatto deve appartenere a un cliente o a un lead");
  }

  const { data, error } = await supabase
    .from("contatti")
    .insert({
      cliente_id: input.cliente_id ?? null,
      lead_id: input.lead_id ?? null,
      nome,
      cognome: t(input.cognome),
      email: t(input.email),
      telefono: t(input.telefono),
      cellulare: t(input.cellulare),
      codice_fiscale: t(input.codice_fiscale),
      ruolo: t(input.ruolo),
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Creazione contatto non riuscita");
  return { id: data.id };
}
