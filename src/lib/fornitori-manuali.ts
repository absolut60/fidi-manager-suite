import type { SupabaseClient } from "@supabase/supabase-js";

/** Chiave di confronto del nome fornitore: identica all'indice unico parziale (lower(trim(nome))). */
export function chiaveNomeFornitore(nome: string): string {
  return nome.trim().toLowerCase();
}

/**
 * Fonte unica: cerca tra i fornitori manuali per nome (lower/trim) e, se manca,
 * lo inserisce come manuale. Ritorna il messaggio di errore o null.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assicuraFornitoreManualeCon(client: SupabaseClient<any>, nome: string): Promise<string | null> {
  const n = nome.trim();
  if (!n) return null;
  const { data, error } = await client.from("fornitori").select("id, nome").eq("origine", "manuale").ilike("nome", n.replace(/[\\%_]/g, (c) => `\\${c}`));
  if (error) return error.message;
  if ((data ?? []).some((f: { nome: string }) => chiaveNomeFornitore(f.nome) === chiaveNomeFornitore(n))) return null;
  const { error: insErr } = await client.from("fornitori").insert({ nome: n, origine: "manuale" });
  // 23505 = inserito nel frattempo da un altro utente: va bene così.
  if (insErr && insErr.code !== "23505") return insErr.message;
  return null;
}
