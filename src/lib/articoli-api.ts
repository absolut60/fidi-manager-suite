import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Articolo = Database["public"]["Tables"]["articoli"]["Row"];
export type ArticoloInsert = Database["public"]["Tables"]["articoli"]["Insert"];
export type ArticoloUpdate = Database["public"]["Tables"]["articoli"]["Update"];
export type StatoArticolo = Database["public"]["Enums"]["stato_articolo"];
export type FasciaListino = Database["public"]["Enums"]["fascia_listino"];
export type ListinoAcquisto = Database["public"]["Tables"]["listini_acquisto"]["Row"];
export type ListinoAcquistoInsert = Database["public"]["Tables"]["listini_acquisto"]["Insert"];
export type ListinoVendita = Database["public"]["Tables"]["listini_vendita"]["Row"];
export type ListinoVenditaInsert = Database["public"]["Tables"]["listini_vendita"]["Insert"];
export type Fornitore = Database["public"]["Tables"]["fornitori"]["Row"];

export const FASCE: FasciaListino[] = ["A", "B", "C", "SOCI"];

export interface ArticoliFilters {
  search?: string;
  categoria?: string | null;
  tipologia?: string | null;
  fornitore_id?: string | null;
  stato?: StatoArticolo | null;
}

export async function fetchArticoli(
  filters: ArticoliFilters,
  opts: { page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 100;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("articoli")
    .select("*, fornitore:fornitori(id, ragione_sociale)", { count: "exact" })
    .order("cod_gamma", { ascending: true, nullsFirst: false })
    .range(from, to);

  if (filters.search && filters.search.trim()) {
    const s = filters.search.trim().replace(/[%,]/g, " ");
    q = q.or(`cod_gamma.ilike.%${s}%,descrizione.ilike.%${s}%,cod_fornitore.ilike.%${s}%`);
  }
  if (filters.categoria) q = q.eq("categoria", filters.categoria);
  if (filters.tipologia) q = q.eq("tipologia", filters.tipologia);
  if (filters.fornitore_id) q = q.eq("fornitore_id", filters.fornitore_id);
  if (filters.stato) q = q.eq("stato", filters.stato);

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function fetchArticolo(id: string) {
  const { data, error } = await supabase
    .from("articoli")
    .select(
      "id, cod_gamma, cod_fornitore, fornitore_id, descrizione, um, categoria, tipologia, componente, stato, note, note_acquisto, created_at, updated_at, peso_unit, qta_cliente, qta_fornitore, fornitore:fornitori(id, ragione_sociale)",
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchFornitori(): Promise<Fornitore[]> {
  const { data, error } = await supabase
    .from("fornitori")
    .select("*")
    .order("ragione_sociale");
  if (error) throw error;
  return data ?? [];
}

export async function fetchArticoliFacets() {
  const { data, error } = await supabase
    .from("articoli")
    .select("categoria, tipologia")
    .limit(5000);
  if (error) throw error;
  const categorie = new Set<string>();
  const tipologie = new Set<string>();
  for (const r of data ?? []) {
    if (r.categoria) categorie.add(r.categoria);
    if (r.tipologia) tipologie.add(r.tipologia);
  }
  return {
    categorie: [...categorie].sort(),
    tipologie: [...tipologie].sort(),
  };
}

export async function updateArticolo(id: string, patch: ArticoloUpdate) {
  const { data, error } = await supabase
    .from("articoli")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchListiniAcquisto(articolo_id: string): Promise<ListinoAcquisto[]> {
  const { data, error } = await supabase
    .from("listini_acquisto")
    .select("*")
    .eq("articolo_id", articolo_id)
    .order("data_validita", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function insertListinoAcquisto(row: ListinoAcquistoInsert) {
  const { data, error } = await supabase
    .from("listini_acquisto")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteListinoAcquisto(id: string) {
  const { error } = await supabase.from("listini_acquisto").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchListiniVendita(articolo_id: string): Promise<ListinoVendita[]> {
  const { data, error } = await supabase
    .from("listini_vendita")
    .select("*")
    .eq("articolo_id", articolo_id);
  if (error) throw error;
  return data ?? [];
}

export async function upsertListinoVendita(row: ListinoVenditaInsert) {
  const { data: existing } = await supabase
    .from("listini_vendita")
    .select("id")
    .eq("articolo_id", row.articolo_id)
    .eq("fascia", row.fascia)
    .maybeSingle();
  if (existing) {
    const { data, error } = await supabase
      .from("listini_vendita")
      .update(row)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from("listini_vendita")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export {
  calcCosto,
  round2,
  prezzoFromRicarico,
  ricaricoFromPrezzo,
  margineFromPrezzo,
} from "./pricing";

import { calcCosto as _calcCosto } from "./pricing";
export function calcCostoNetto(l: Partial<ListinoAcquisto>) {
  return _calcCosto(l);
}
