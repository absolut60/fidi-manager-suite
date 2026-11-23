import { supabase } from "@/integrations/supabase/client";
import { testoPerFiltroOr } from "./ricerca-sicura";
import type { LeadPreventivo } from "./soggetto-preventivo";

export const LEAD_PREVENTIVO_SELECT = "id,ragione_sociale,nome,cognome,telefono,email,store_id,agente_codice,condizione_pagamento_cod,listino_rif,macrocategoria_rif,categoria_rif,sede:stores(nome)";
/** Solo client utente, RLS: ogni parola può stare anche in nome/cognome separati. */
export async function cercaLeadPreventivo(testo: string): Promise<LeadPreventivo[]> {
  let q = supabase.from("lead").select(LEAD_PREVENTIVO_SELECT).order("ragione_sociale").limit(50);
  for (const token of testo.trim().split(/\s+/).filter(Boolean)) {
    const t = testoPerFiltroOr(token);
    q = q.or(["ragione_sociale", "nome", "cognome", "telefono", "email"].map(c => `${c}.ilike.%${t}%`).join(","));
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
