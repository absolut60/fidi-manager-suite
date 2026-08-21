import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type FasciaListino = Database["public"]["Enums"]["fascia_listino"];
export const FASCE: FasciaListino[] = ["A", "B", "C", "SOCI"];

export interface Agente {
  id: string;
  nome: string;
}

/**
 * Cliente nella forma attesa dalla UI del preventivatore, mappato dai clienti
 * di FidiManager. SOLA LETTURA: i clienti si creano/gestiscono in FidiManager.
 *   id_cliente ← codice_gestionale · piva ← partita_iva · comune ← citta/provincia
 */
export interface ClienteRow {
  id: string;
  ragione_sociale: string | null;
  id_cliente: string | null;
  piva: string | null;
  fascia_listino_default: FasciaListino | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  codice_agente: string | null;
  agente: { nome: string } | null;
  comune: { nome: string; provincia: string | null } | null;
}

export interface CantiereRow {
  id: string;
  cliente_id: string;
  nome: string | null;
  citta: string | null;
  provincia: string | null;
  indirizzo: string | null;
  comune: { nome: string; provincia: string | null } | null;
}

export interface ClientiFilters {
  search?: string;
  agente_id?: string | null;
  fascia?: FasciaListino | null;
}

interface ClienteDbPick {
  id: string;
  ragione_sociale: string | null;
  codice_gestionale: string | null;
  partita_iva: string | null;
  fascia_listino_default: FasciaListino | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  codice_agente: string | null;
  agente: string | null;
}

interface CantiereDbPick {
  id: string;
  cliente_id: string;
  nome: string | null;
  citta: string | null;
  provincia: string | null;
  indirizzo: string | null;
}

interface AgenteDbPick {
  codice: string;
  descrizione: string;
}

const CLIENTE_COLS =
  "id, ragione_sociale, codice_gestionale, partita_iva, fascia_listino_default, indirizzo, cap, citta, provincia, codice_agente, agente";

function mapCliente(r: ClienteDbPick): ClienteRow {
  return {
    id: r.id,
    ragione_sociale: r.ragione_sociale,
    id_cliente: r.codice_gestionale,
    piva: r.partita_iva,
    fascia_listino_default: r.fascia_listino_default,
    indirizzo: r.indirizzo,
    cap: r.cap,
    citta: r.citta,
    provincia: r.provincia,
    codice_agente: r.codice_agente,
    agente: r.agente ? { nome: r.agente } : null,
    comune: r.citta ? { nome: r.citta, provincia: r.provincia } : null,
  };
}

export async function fetchClienti(filters: ClientiFilters, limit = 1000): Promise<ClienteRow[]> {
  let q = supabase
    .from("clienti")
    .select(CLIENTE_COLS)
    .order("ragione_sociale", { ascending: true })
    .limit(limit);

  if (filters.search && filters.search.trim()) {
    const s = filters.search.trim().replace(/[%,]/g, " ");
    q = q.or(
      `ragione_sociale.ilike.%${s}%,codice_gestionale.ilike.%${s}%,partita_iva.ilike.%${s}%`,
    );
  }
  if (filters.agente_id) q = q.eq("codice_agente", filters.agente_id);
  if (filters.fascia) q = q.eq("fascia_listino_default", filters.fascia);

  const { data, error } = await q;
  if (error) throw error;
  return ((data as unknown as ClienteDbPick[] | null) ?? []).map(mapCliente);
}

export async function fetchCliente(id: string): Promise<ClienteRow | null> {
  const { data, error } = await supabase
    .from("clienti")
    .select(CLIENTE_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCliente(data as unknown as ClienteDbPick) : null;
}

export async function fetchCantieri(cliente_id: string): Promise<CantiereRow[]> {
  const { data, error } = await supabase
    .from("cantieri")
    .select("id, cliente_id, nome, citta, provincia, indirizzo")
    .eq("cliente_id", cliente_id)
    .order("nome", { ascending: true });
  if (error) throw error;
  return ((data as unknown as CantiereDbPick[] | null) ?? []).map((r) => ({
    id: r.id,
    cliente_id: r.cliente_id,
    nome: r.nome,
    citta: r.citta,
    provincia: r.provincia,
    indirizzo: r.indirizzo,
    comune: r.citta ? { nome: r.citta, provincia: r.provincia } : null,
  }));
}

export async function fetchAgenti(): Promise<Agente[]> {
  const { data, error } = await supabase
    .from("agenti")
    .select("codice, descrizione")
    .order("descrizione", { ascending: true });
  if (error) throw error;
  return ((data as unknown as AgenteDbPick[] | null) ?? []).map((a) => ({
    id: a.codice,
    nome: a.descrizione,
  }));
}
