import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import type { Database } from "@/integrations/supabase/types";
import type { CantiereRow } from "@/lib/cantieri";
import { eliminaConEsito } from "@/lib/esito-eliminazione";
import { campiPrezzoDaMotore, prezzoNettoRiga, type PrezzoClienteGamma } from "@/lib/riga-preventivo";

export type CantiereListinoRow = Database["public"]["Tables"]["cantiere_listini_speciali"]["Row"];
export type CantiereListinoInput = Pick<CantiereListinoRow, "cantiere_id" | "cod_gamma" | "descrizione" | "prezzo_vendita_speciale" | "sconti" | "maggiorazione_perc" | "costo_netto_speciale" | "um_scelta" | "note"> & { id?: string };
export const chiavePrezziCantiere = (id: string) => ["prezzi-cantiere", id] as const;
export const opzioniPrezziCantiere = (id: string) => ({ queryKey: chiavePrezziCantiere(id), queryFn: () => getCantiereListini(id), staleTime: Infinity });
export const chiaveConteggioPrezziCantiere = (id: string) => ["prezzi-cantiere-conteggio", id] as const;
export const chiaveConteggiPrezziCantieri = ["prezzi-cantiere-conteggio"] as const;
type LettoreConteggi = (ids: string[]) => Promise<Array<{ cantiere_id: string }>>;
/** One RLS read per 500 IDs; paginate rows too, so the Data API cap never truncates counts. */
export async function contaPrezziCantieri(ids: readonly string[], leggi: LettoreConteggi = async blocco => {
  const righe: Array<{ cantiere_id: string }> = [];
  for (let da = 0; ; da += 1000) {
    const { data, error } = await supabase.from("cantiere_listini_speciali").select("cantiere_id").in("cantiere_id", blocco).order("id").range(da, da + 999);
    if (error) throw error;
    righe.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return righe;
  }
}): Promise<Record<string, number>> {
  const unici = [...new Set(ids)].filter(Boolean);
  const conteggi: Record<string, number> = Object.fromEntries(unici.map(id => [id, 0]));
  for (let da = 0; da < unici.length; da += 500) {
    for (const r of await leggi(unici.slice(da, da + 500))) {
      if (Object.hasOwn(conteggi, r.cantiere_id)) conteggi[r.cantiere_id] += 1;
    }
  }
  return conteggi;
}
export function useConteggiPrezziCantieri(ids: readonly string[], enabled = true) {
  const unici = [...new Set(ids)].filter(Boolean).sort();
  return useQuery({ queryKey: [...chiaveConteggiPrezziCantieri, "batch", unici], queryFn: () => contaPrezziCantieri(unici), enabled: enabled && unici.length > 0 });
}
export function testoPrezziDedicati(n: number): string {
  return `${n} ${n === 1 ? "prezzo dedicato" : "prezzi dedicati"}`;
}
export async function getCantiereListini(cantiereId: string): Promise<CantiereListinoRow[]> {
  const { data, error } = await supabase.from("cantiere_listini_speciali").select("*").eq("cantiere_id", cantiereId).order("created_at").order("id");
  if (error) throw error;
  return data ?? [];
}
export async function upsertCantiereListino(input: CantiereListinoInput): Promise<CantiereListinoRow> {
  const { id, ...payload } = input;
  // INSERT, never upsert: selecting an existing code must not overwrite its manual price.
  const query = id
    ? supabase.from("cantiere_listini_speciali").update(payload).eq("id", id).eq("cantiere_id", input.cantiere_id)
    : supabase.from("cantiere_listini_speciali").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}
export const deleteCantiereListino = (id: string) => eliminaConEsito("cantiere_listini_speciali", id);
export async function contaPrezziCantiere(id: string): Promise<number> {
  const { count, error } = await supabase.from("cantiere_listini_speciali").select("id", { count: "exact", head: true }).eq("cantiere_id", id);
  if (error) throw error;
  return count ?? 0;
}
export async function puoModificareCantiereDb(c: Pick<CantiereRow, "cliente_id" | "lead_id" | "agente_codice" | "created_by">): Promise<boolean> {
  // Generated RPC args omit SQL nullability. Keep actual NULLs: empty IDs change the predicate.
  const args = { _cliente_id: c.cliente_id, _lead_id: c.lead_id, _agente_codice: c.agente_codice, _created_by: c.created_by ?? null };
  const { data, error } = await supabase.rpc("auth_puo_modificare_cantiere", args as unknown as Database["public"]["Functions"]["auth_puo_modificare_cantiere"]["Args"]);
  if (error) throw error;
  return data === true;
}
export const chiaveCantieriModificabili = ["cantieri-modificabili"] as const;
export async function cantieriModificabili(ids: readonly string[]): Promise<string[]> {
  const unici = [...new Set(ids)].filter(Boolean);
  if (!unici.length) return [];
  const { data, error } = await supabase.rpc("cantieri_modificabili", { _ids: unici });
  if (error) throw error;
  return data ?? [];
}
export function useCantieriModificabili(ids: readonly string[], singolo?: CantiereRow | null, enabled = true) {
  const { user } = useAuth();
  const unici = [...new Set(ids)].filter(Boolean).sort();
  return useQuery({
    queryKey: [...chiaveCantieriModificabili, user?.id, unici, singolo ? [singolo.cliente_id, singolo.lead_id, singolo.agente_codice, singolo.created_by] : null],
    enabled: enabled && unici.length > 0 && !!user,
    queryFn: async () => new Set(singolo
      ? await puoModificareCantiereDb(singolo) ? [singolo.id] : []
      : await cantieriModificabili(unici)),
  });
}
/** Customer engine values are proposals only. Missing price never invents one. */
export function propostaPrezzoCantiere(p?: PrezzoClienteGamma | null) {
  const campi = campiPrezzoDaMotore(p, 1, 0);
  return {
    prezzo_vendita_speciale: campi.prezzo_unit,
    sconti: campi.sconti_gamma,
    maggiorazione_perc: campi.maggiorazione_perc,
    listino_cliente: p?.prezzo_base == null ? null : prezzoNettoRiga(campi),
    costo_ultimo: p?.costo_ultimo ?? null,
  };
}
export async function unitaPrezziCantiere(codici: string[]) {
  if (!codici.length) return [];
  const { data, error } = await supabase.from("articoli_gamma").select("codice,um,um2,fattore_conversione,costo_ultimo").in("codice", [...new Set(codici)]);
  if (error) throw error;
  return data ?? [];
}

/** Count is user-RLS scoped; only an explicit selection can trigger a toast. */
export function mostraAvvisoPrezziCantiere(conteggio: number | undefined, origine: "etichetta" | "scelta" | "apertura" = "etichetta"): boolean {
  return origine !== "apertura" && conteggio != null && conteggio > 0;
}
