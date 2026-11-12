import type { SupabaseClient } from "@supabase/supabase-js";

/** Chiave di confronto del nome fornitore: identica all'indice unico parziale (lower(trim(nome))). */
export function chiaveNomeFornitore(nome: string): string {
  return nome.trim().toLowerCase();
}

/**
 * Fonte unica: cerca tra i fornitori manuali per nome (lower/trim) e, se manca,
 * lo inserisce come manuale tramite public.assicura_fornitore_manuale (FM64:
 * i richiedenti non leggono più la tabella fornitori). Ritorna il messaggio di errore o null.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assicuraFornitoreManualeCon(client: SupabaseClient<any>, nome: string): Promise<string | null> {
  const n = nome.trim();
  if (!n) return null;
  const { error } = await client.rpc("assicura_fornitore_manuale", { _nome: n });
  return error ? error.message : null;
}
