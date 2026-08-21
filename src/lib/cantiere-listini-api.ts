import { supabase } from "@/integrations/supabase/client";
import { calcCosto } from "@/lib/pricing";
import type { FasciaListino } from "@/lib/articoli-api";

export interface CantiereListinoRow {
  id: string;
  cantiere_id: string;
  cod_gamma: string;
  descrizione: string;
  um: string;
  categoria: string;
  costo_netto_standard: number | null;
  prezzo_standard: number | null;
  costo_netto_speciale: number | null;
  prezzo_vendita_speciale: number | null;
  note: string | null;
}

export interface CantiereListinoInput {
  id?: string;
  cantiere_id: string;
  cod_gamma: string;
  costo_netto_speciale: number | null;
  prezzo_vendita_speciale: number | null;
  note: string | null;
}

export interface ListinoSpecialeCantiere {
  id: string;
  cod_gamma: string;
  descrizione: string | null;
  um: string | null;
  categoria: string | null;
  costo_netto_standard: number | null;
  prezzo_standard: number | null;
  costo_netto_speciale: number | null;
  prezzo_vendita_speciale: number | null;
  note: string | null;
  updated_at: string;
  cantiere_id: string;
  cantiere_nome: string;
  cliente_id: string;
  cliente_nome: string;
  fascia_cliente: FasciaListino | null;
}

export interface ArticoloPrezziStandard {
  articolo_id: string;
  cod_gamma: string;
  descrizione: string;
  um: string;
  categoria: string | null;
  listino_for: string | null;
  costo_netto: number | null;
  prezzo_standard: number | null;
  margine_standard: number | null;
}

function piuRecente<T extends { data_validita?: string | null; created_at?: string | null }>(
  rows: T[] | null | undefined,
): T | null {
  if (!rows || rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const da = a.data_validita ?? a.created_at ?? "";
    const db = b.data_validita ?? b.created_at ?? "";
    return db.localeCompare(da);
  })[0];
}

/** Tutti i listini speciali di un cantiere, arricchiti con dati articolo + prezzi standard. */
export async function getCantiereListini(
  cantiereId: string,
  fasciaCliente: FasciaListino,
): Promise<CantiereListinoRow[]> {
  const { data: rows, error } = await supabase
    .from("cantiere_listini_speciali")
    .select("*")
    .eq("cantiere_id", cantiereId)
    .order("cod_gamma");
  if (error) throw error;
  const list = rows ?? [];
  if (list.length === 0) return [];

  const codici = Array.from(new Set(list.map((r) => r.cod_gamma)));
  const { data: articoli, error: errA } = await supabase
    .from("articoli")
    .select(
      "id, cod_gamma, descrizione, um, categoria, listini_acquisto(*), listini_vendita(*)",
    )
    .in("cod_gamma", codici);
  if (errA) throw errA;

  const byCod = new Map<string, (typeof articoli)[number]>();
  for (const a of articoli ?? []) {
    if (a.cod_gamma) byCod.set(a.cod_gamma, a);
  }

  return list.map((r) => {
    const a = byCod.get(r.cod_gamma);
    const la = piuRecente(a?.listini_acquisto);
    const costoStd = la
      ? calcCosto(la).costo_netto
      : (la as { costo_netto?: number } | null)?.costo_netto ?? null;
    const lv = a?.listini_vendita?.find((x) => x.fascia === fasciaCliente);
    return {
      id: r.id,
      cantiere_id: r.cantiere_id,
      cod_gamma: r.cod_gamma,
      descrizione: a?.descrizione ?? "—",
      um: a?.um ?? "",
      categoria: a?.categoria ?? "",
      costo_netto_standard: costoStd ?? null,
      prezzo_standard: lv?.prezzo ?? null,
      costo_netto_speciale: r.costo_netto_speciale === null ? null : Number(r.costo_netto_speciale),
      prezzo_vendita_speciale:
        r.prezzo_vendita_speciale === null ? null : Number(r.prezzo_vendita_speciale),
      note: r.note,
    };
  });
}

export async function upsertCantiereListino(input: CantiereListinoInput): Promise<void> {
  const payload = {
    cantiere_id: input.cantiere_id,
    cod_gamma: input.cod_gamma,
    costo_netto_speciale: input.costo_netto_speciale,
    prezzo_vendita_speciale: input.prezzo_vendita_speciale,
    note: input.note,
  };
  if (input.id) {
    const { error } = await supabase
      .from("cantiere_listini_speciali")
      .update(payload)
      .eq("id", input.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("cantiere_listini_speciali")
    .upsert(payload, { onConflict: "cantiere_id,cod_gamma" });
  if (error) throw error;
}

export async function deleteCantiereListino(id: string): Promise<void> {
  const { error } = await supabase.from("cantiere_listini_speciali").delete().eq("id", id);
  if (error) throw error;
}

/** Articolo + prezzi standard pre-compilati per il dialog "Aggiungi articolo". */
export async function getArticoloConPrezziStandard(
  codGamma: string,
  fasciaCliente: FasciaListino,
): Promise<ArticoloPrezziStandard | null> {
  const { data, error } = await supabase
    .from("articoli")
    .select(
      "id, cod_gamma, descrizione, um, categoria, listini_acquisto(*), listini_vendita(*)",
    )
    .eq("cod_gamma", codGamma)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const la = piuRecente(data.listini_acquisto);
  const costo = la ? calcCosto(la).costo_netto : null;
  const lv = data.listini_vendita?.find((x) => x.fascia === fasciaCliente);
  const prezzo = lv?.prezzo ?? null;
  let margine: number | null = null;
  if (prezzo && costo && prezzo > 0) margine = ((prezzo - costo) / prezzo) * 100;
  return {
    articolo_id: data.id,
    cod_gamma: data.cod_gamma ?? codGamma,
    descrizione: data.descrizione,
    um: data.um ?? "",
    categoria: data.categoria,
    listino_for: la?.listino_for ?? null,
    costo_netto: costo,
    prezzo_standard: prezzo,
    margine_standard: margine,
  };
}

/** Vista globale: tutti i listini speciali cantiere con join cantiere/cliente/articolo. */
export async function getAllListiniSpecialiCantieri(): Promise<ListinoSpecialeCantiere[]> {
  const { data: rows, error } = await supabase
    .from("cantiere_listini_speciali")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const list = rows ?? [];
  if (list.length === 0) return [];

  const codici = Array.from(new Set(list.map((r) => r.cod_gamma)));
  const cantiereIds = Array.from(new Set(list.map((r) => r.cantiere_id)));

  const [{ data: articoli, error: errA }, { data: cantieri, error: errC }] = await Promise.all([
    supabase
      .from("articoli")
      .select("id, cod_gamma, descrizione, um, categoria, listini_acquisto(*), listini_vendita(*)")
      .in("cod_gamma", codici),
    supabase
      .from("cantieri")
      .select("id, nome, cliente:clienti(id, ragione_sociale, fascia_listino_default)")
      .in("id", cantiereIds),
  ]);
  if (errA) throw errA;
  if (errC) throw errC;

  const byCod = new Map<string, (typeof articoli)[number]>();
  for (const a of articoli ?? []) if (a.cod_gamma) byCod.set(a.cod_gamma, a);
  const byCantiere = new Map<string, (typeof cantieri)[number]>();
  for (const c of cantieri ?? []) byCantiere.set(c.id, c);

  return list.map((r) => {
    const a = byCod.get(r.cod_gamma);
    const la = piuRecente(a?.listini_acquisto);
    const costoStd = la ? calcCosto(la).costo_netto : null;
    const c = byCantiere.get(r.cantiere_id);
    const cliente = (c as { cliente?: { id: string; ragione_sociale: string; fascia_listino_default: FasciaListino | null } } | undefined)?.cliente ?? null;
    const fascia = cliente?.fascia_listino_default ?? null;
    const lv = fascia ? a?.listini_vendita?.find((x) => x.fascia === fascia) : null;
    return {
      id: r.id,
      cod_gamma: r.cod_gamma,
      descrizione: a?.descrizione ?? null,
      um: a?.um ?? null,
      categoria: a?.categoria ?? null,
      costo_netto_standard: costoStd ?? null,
      prezzo_standard: lv?.prezzo ?? null,
      costo_netto_speciale: r.costo_netto_speciale === null ? null : Number(r.costo_netto_speciale),
      prezzo_vendita_speciale: r.prezzo_vendita_speciale === null ? null : Number(r.prezzo_vendita_speciale),
      note: r.note,
      updated_at: r.updated_at,
      cantiere_id: r.cantiere_id,
      cantiere_nome: c?.nome ?? "—",
      cliente_id: cliente?.id ?? "",
      cliente_nome: cliente?.ragione_sociale ?? "—",
      fascia_cliente: fascia,
    };
  });
}
