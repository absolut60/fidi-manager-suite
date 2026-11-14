import { supabase } from "@/integrations/supabase/client";
import { testoPerFiltroOr } from "./ricerca-sicura";
import { campiLeadRapido, type LeadPreventivo, type inputLeadRapido } from "./soggetto-preventivo";
import type { z } from "zod";

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
export async function creaLeadPreventivo(input: z.input<typeof inputLeadRapido>): Promise<LeadPreventivo> {
  const { data: sessione, error: erroreUtente } = await supabase.auth.getUser();
  if (erroreUtente || !sessione.user) throw new Error("Accesso richiesto");
  const [{ data: ruoli, error: erroreRuoli }, { data: profilo, error: erroreProfilo }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", sessione.user.id),
    supabase.from("profili").select("codice_agente").eq("id", sessione.user.id).single(),
  ]);
  if (erroreRuoli) throw erroreRuoli;
  if (erroreProfilo) throw erroreProfilo;
  const agente = ruoli?.some(r => r.role === "agente") ? profilo.codice_agente : null;
  const { data, error } = await supabase.from("lead").insert(campiLeadRapido(input, agente)).select(LEAD_PREVENTIVO_SELECT).single();
  if (error) throw error;
  return data;
}