import { copiaNotePreventivo } from "./preventivi-note";
import { supabase } from "@/integrations/supabase/client";
import { campiPrezzoDaMotore, confrontoAggiornamento, costoRiga, importoRiga, isIntestazioneKit, isRigaValorizzata, marginePercRiga, pesoRigaGamma, patchConImporto, quantitaDaIncidenza, segnoRiga, type PrezzoClienteGamma, type UnitaGammaRiga } from "./riga-preventivo";
import type { Database } from "@/integrations/supabase/types";
import { round2 } from "./pricing";
import {
  calcolaRigaKit,
  fetchKit,
  getCostoNettoCorrente,
  getPrezzoVendita,
  type ArticoloConListini,
  type FasciaListino,
} from "./kit-api";
import {
  fetchCantieri as _fetchCantieri,
  fetchAgenti as _fetchAgenti,
  type ClienteRow,
  type CantiereRow,
  type Agente,
} from "./clienti-api";
import { testoPerFiltroOr } from "@/lib/ricerca-sicura";

export type Preventivo = Database["public"]["Tables"]["preventivi"]["Row"];
export type PreventivoInsert = Database["public"]["Tables"]["preventivi"]["Insert"];
export type PreventivoUpdate = Database["public"]["Tables"]["preventivi"]["Update"];
export type Blocco = Database["public"]["Tables"]["blocchi_preventivo"]["Row"];
export type BloccoInsert = Database["public"]["Tables"]["blocchi_preventivo"]["Insert"];
export type BloccoUpdate = Database["public"]["Tables"]["blocchi_preventivo"]["Update"];
export type Riga = Database["public"]["Tables"]["righe_preventivo"]["Row"];
export type RigaInsert = Database["public"]["Tables"]["righe_preventivo"]["Insert"];
export type RigaUpdate = Database["public"]["Tables"]["righe_preventivo"]["Update"];
/** Una sola lettura batch, RLS utente: mai una richiesta per riga. */
async function fetchPesiGamma(codici: string[]): Promise<Map<string, UnitaGammaRiga & { peso_netto: number | null }>> {
  const unici = [...new Set(codici.filter(Boolean))];
  const pesi = new Map<string, UnitaGammaRiga & { peso_netto: number | null }>();
  for (let i = 0; i < unici.length; i += 500) {
    const { data, error } = await supabase.from("articoli_gamma").select("codice,peso_netto,um,um2,fattore_conversione").in("codice", unici.slice(i, i + 500));
    if (error) throw error;
    for (const r of data ?? []) pesi.set(r.codice, r);
  }
  return pesi;
}
export type TipoDoc = Database["public"]["Enums"]["tipo_doc_preventivo"];
export type StatoPreventivo = Database["public"]["Enums"]["stato_preventivo"];
export type TipoRiga = Database["public"]["Enums"]["tipo_riga_preventivo"];
export type TipoDocumento = Database["public"]["Enums"]["tipo_documento"];

export type { ClienteRow, CantiereRow, Agente } from "./clienti-api";
export const fetchAgenti = _fetchAgenti;

/** Riga restituita dalle RPC lite (anagrafica cliente senza dati credito). */
interface ClienteLiteRpc {
  id: string;
  ragione_sociale: string | null;
  partita_iva: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  fascia_listino_default: FasciaListino | null;
  codice_agente: string | null;
}

function mapLite(r: ClienteLiteRpc): ClienteRow {
  return {
    id: r.id,
    ragione_sociale: r.ragione_sociale,
    id_cliente: null,
    piva: r.partita_iva,
    fascia_listino_default: r.fascia_listino_default,
    indirizzo: r.indirizzo,
    cap: r.cap,
    citta: r.citta,
    provincia: r.provincia,
    codice_agente: r.codice_agente,
    agente: null,
    comune: r.citta ? { nome: r.citta, provincia: r.provincia } : null,
  };
}

/** Legge una singola anagrafica cliente tramite RPC lite (no RLS clienti piena). */
async function fetchClienteLite(id: string): Promise<ClienteRow | null> {
  const { data, error } = await supabase.rpc("get_cliente_lite" as never, {
    _id: id,
  } as never);
  if (error) throw error;
  const rows = (data as unknown as ClienteLiteRpc[] | null) ?? [];
  return rows[0] ? mapLite(rows[0]) : null;
}

export const fetchCliente = fetchClienteLite;

export type DatiClientePreventivo = Database["public"]["Functions"]["dati_cliente_preventivo"]["Returns"][number];
export async function fetchDatiClientePreventivo(id: string): Promise<DatiClientePreventivo | null> {
  const { data, error } = await supabase.rpc("dati_cliente_preventivo", { _id: id });
  if (error) throw error;
  return data?.[0] ?? null;
}

export type IndicatoreClientePreventivo = Database["public"]["Functions"]["indicatore_cliente_preventivo"]["Returns"][number];
export async function fetchIndicatoreClientePreventivo(id: string): Promise<IndicatoreClientePreventivo | null> {
  const { data, error } = await supabase.rpc("indicatore_cliente_preventivo", { _cliente_id: id });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function cercaClientiPreventivo(q: string) {
  const { data, error } = await supabase.rpc("cerca_clienti_preventivo", { _q: q });
  if (error) throw error;
  return data ?? [];
}

export async function searchClienti(q: string): Promise<ClienteRow[]> {
  const { data, error } = await supabase.rpc("get_clienti_lite_search" as never, {
    _q: q ?? "",
  } as never);
  if (error) throw error;
  return ((data as unknown as ClienteLiteRpc[] | null) ?? []).map(mapLite);
}

/** Risolve i nomi cliente per una lista di documenti con UNA chiamata RPC (a blocchi di 500 id). */
async function popolaClientiLite(items: PreventivoListItem[]): Promise<void> {
  const ids = [...new Set(items.map((i) => i.cliente_id).filter((v): v is string => !!v))];
  if (ids.length === 0) return;
  const liteRows: ClienteLiteRpc[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data, error } = await supabase.rpc("get_clienti_lite_by_ids" as never, {
      _ids: chunk,
    } as never);
    if (error) throw error;
    liteRows.push(...((data as unknown as ClienteLiteRpc[] | null) ?? []));
  }
  const map = new Map<string, { id: string; ragione_sociale: string }>();
  for (const row of liteRows) {
    const r = mapLite(row);
    map.set(r.id, { id: r.id, ragione_sociale: r.ragione_sociale ?? "—" });
  }
  for (const it of items) {
    it.cliente = it.cliente_id ? (map.get(it.cliente_id) ?? null) : null;
  }
}

export async function fetchCantieriByCliente(cliente_id: string): Promise<CantiereRow[]> {
  return _fetchCantieri(cliente_id);
}

export interface CantiereLite {
  id: string;
  nome: string;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  attivo: boolean;
  provvisorio: boolean;
}

/** Cantiere collegato al preventivo (anche archiviato), via RPC con gate preventivi: non dipende dal negozio del cliente. */
export type CantierePreventivo = CantiereRow & { cap: string | null; attivo: boolean; provvisorio: boolean };
export async function fetchCantierePreventivo(id: string): Promise<CantierePreventivo | null> {
  const { data, error } = await supabase.rpc("get_cantiere_preventivo", { _id: id });
  if (error) throw error;
  const r = data?.[0];
  if (!r) return null;
  return { id: r.id, cliente_id: r.cliente_id, nome: r.nome, indirizzo: r.indirizzo, cap: r.cap, citta: r.citta, provincia: r.provincia,
    comune: r.citta ? { nome: r.citta, provincia: r.provincia } : null, attivo: r.attivo, provvisorio: r.provvisorio };
}

export async function fetchCantieriLite(cliente_id: string): Promise<CantiereLite[]> {
  const { data, error } = await supabase.rpc("get_cantieri_lite" as never, {
    _cliente_id: cliente_id,
  } as never);
  if (error) throw error;
  return (data as unknown as CantiereLite[] | null) ?? [];
}

export const TIPI_DOC: TipoDoc[] = [
  "PREVENTIVO",
  "PROPOSTA_RAPIDA",
  "LISTA_MATERIALI",
  "LISTA_MAT_FORNITORE",
];
export const TIPI_DOC_LABEL: Record<TipoDoc, string> = {
  PREVENTIVO: "Preventivo",
  PROPOSTA_RAPIDA: "Proposta rapida",
  LISTA_MATERIALI: "Lista materiali",
  LISTA_MAT_FORNITORE: "Lista mat. fornitore",
};
export const STATI: StatoPreventivo[] = ["bozza", "inviato", "confermato"];
export const STATI_LABEL: Record<StatoPreventivo, string> = {
  bozza: "Bozza",
  inviato: "Inviato",
  confermato: "Confermato",
};
export const TIPI_RIGA: TipoRiga[] = [
  "articolo_singolo",
  "da_kit",
  "manuale",
  "sotto_totale",
  "nota",
  "separatore",
];
export const TIPI_RIGA_LABEL: Record<TipoRiga, string> = {
  articolo_singolo: "Articolo",
  da_kit: "Da kit",
  manuale: "Manuale",
  sotto_totale: "Sotto-totale",
  nota: "Nota",
  separatore: "Separatore",
};

const n = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const x = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};

export interface PreventiviFilters {
  search?: string;
  // Elenchi: vuoto o assente = nessun filtro; più valori = almeno uno.
  cliente_id?: string[];
  stato?: StatoPreventivo[];
  tipo_doc?: TipoDoc[];
  tipo?: TipoDocumento | null;
}

export interface PreventivoListItem extends Preventivo {
  cliente: { id: string; ragione_sociale: string } | null;
  cantiere: { id: string; nome: string } | null;
  blocchi?: {
    righe: { tipo_riga: string; quantita: number | null; qta_ordinata: number | null }[];
  }[];
}

export async function fetchPreventivi(f: PreventiviFilters): Promise<PreventivoListItem[]> {
  let q = supabase
    .from("preventivi")
    .select(
      `*,
       cantiere:cantieri(id, nome),
       blocchi:blocchi_preventivo(righe:righe_preventivo(tipo_riga, quantita, qta_ordinata))`,
    )
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (f.tipo) q = q.eq("tipo", f.tipo);
  if (f.cliente_id?.length) q = q.in("cliente_id", f.cliente_id);
  if (f.stato?.length) q = q.in("stato", f.stato);
  if (f.tipo_doc?.length) q = q.in("tipo_doc", f.tipo_doc);
  if (f.search?.trim()) {
    const s = testoPerFiltroOr(f.search);
    q = q.or(`numero.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  const items = (data ?? []) as unknown as PreventivoListItem[];
  await popolaClientiLite(items);
  return items;
}

/** FM65 Punto 5: filtri dell'elenco, applicati SOLO ai principali. */
export interface ElencoPreventiviFilters extends PreventiviFilters {
  creato_da?: string[];
}

export interface ElencoPreventivoItem extends Omit<PreventivoListItem, "cliente"> {
  cliente: { id: string; ragione_sociale: string; codice_gestionale: string | null } | null;
  creato_da_nome: string | null;
}

export interface ElencoPreventivi {
  /** Principali filtrati (tetto 500). */
  principali: ElencoPreventivoItem[];
  /** TUTTE le alternative dei principali trovati, senza filtri. */
  alternative: ElencoPreventivoItem[];
}

const SELECT_ELENCO = `*,
       cantiere:cantieri(id, nome),
       blocchi:blocchi_preventivo(righe:righe_preventivo(tipo_riga, quantita, qta_ordinata))`;

export async function fetchElencoPreventivi(f: ElencoPreventiviFilters): Promise<ElencoPreventivi> {
  let q = supabase
    .from("preventivi")
    .select(SELECT_ELENCO)
    .is("alternativa_di", null)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (f.tipo) q = q.eq("tipo", f.tipo);
  if (f.cliente_id?.length) q = q.in("cliente_id", f.cliente_id);
  if (f.stato?.length) q = q.in("stato", f.stato);
  if (f.tipo_doc?.length) q = q.in("tipo_doc", f.tipo_doc);
  if (f.creato_da?.length) q = q.in("creato_da", f.creato_da);
  if (f.search?.trim()) {
    const s = testoPerFiltroOr(f.search);
    const parti = [`numero.ilike.%${s}%`, `titolo.ilike.%${s}%`];
    const clienti = await cercaClientiPreventivo(f.search.trim());
    const ids = clienti
      .filter((c) => (c.codice_gestionale ?? "").toLowerCase().includes(f.search!.trim().toLowerCase()))
      .map((c) => c.id);
    if (ids.length) parti.push(`cliente_id.in.(${ids.join(",")})`);
    q = q.or(parti.join(","));
  }
  const { data, error } = await q;
  if (error) throw error;
  const principali = (data ?? []) as unknown as ElencoPreventivoItem[];
  const alternative: ElencoPreventivoItem[] = [];
  const idsPrincipali = principali.map((p) => p.id);
  for (let i = 0; i < idsPrincipali.length; i += 200) {
    const { data: alt, error: e2 } = await supabase
      .from("preventivi")
      .select(SELECT_ELENCO)
      .in("alternativa_di", idsPrincipali.slice(i, i + 200));
    if (e2) throw e2;
    alternative.push(...((alt ?? []) as unknown as ElencoPreventivoItem[]));
  }
  const tutti = [...principali, ...alternative];
  await Promise.all([popolaClientiElenco(tutti), popolaNomiCreatoDa(tutti)]);
  return { principali, alternative };
}

async function popolaClientiElenco(items: ElencoPreventivoItem[]): Promise<void> {
  const ids = [...new Set(items.map((i) => i.cliente_id).filter((v): v is string => !!v))];
  const map = new Map<string, { id: string; ragione_sociale: string; codice_gestionale: string | null }>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await supabase.rpc("get_clienti_elenco_preventivi", {
      _ids: ids.slice(i, i + 500),
    });
    if (error) throw error;
    for (const r of data ?? []) {
      map.set(r.id, { id: r.id, ragione_sociale: r.ragione_sociale ?? "—", codice_gestionale: r.codice_gestionale ?? null });
    }
  }
  for (const it of items) it.cliente = it.cliente_id ? (map.get(it.cliente_id) ?? null) : null;
}

async function popolaNomiCreatoDa(items: ElencoPreventivoItem[]): Promise<void> {
  const ids = new Set(items.map((i) => i.creato_da).filter((v): v is string => !!v));
  const map = new Map<string, string>();
  if (ids.size) {
    const { data, error } = await supabase.rpc("get_nomi_utenti" as never);
    if (error) throw error;
    for (const p of (data as unknown as { id: string; nome: string | null; cognome: string | null }[] | null) ?? []) {
      if (!ids.has(p.id)) continue;
      const nome = [p.nome, p.cognome].filter(Boolean).join(" ").trim();
      if (nome) map.set(p.id, nome);
    }
  }
  for (const it of items) it.creato_da_nome = it.creato_da ? (map.get(it.creato_da) ?? null) : null;
}

export interface PrezzoSpecialeCantiere {
  cod_gamma: string;
  costo_netto_speciale: number | null;
  prezzo_vendita_speciale: number | null;
}

export type PrezziSpecialiMap = Map<
  string,
  { costo: number | null; prezzo: number | null }
>;

export function buildPrezziSpecialiMap(list: PrezzoSpecialeCantiere[]): PrezziSpecialiMap {
  const m: PrezziSpecialiMap = new Map();
  for (const s of list) {
    if (!s.cod_gamma) continue;
    m.set(s.cod_gamma, {
      costo: s.costo_netto_speciale == null ? null : Number(s.costo_netto_speciale),
      prezzo: s.prezzo_vendita_speciale == null ? null : Number(s.prezzo_vendita_speciale),
    });
  }
  return m;
}

export function statoPrezzoSpecialeRiga(
  row: { prezzo_unit: number | null; costo: number | null; quantita: number | null },
  cod_gamma: string | null | undefined,
  map: PrezziSpecialiMap | null | undefined,
): {
  stato: "attivo" | "modificato";
  special: { costo: number | null; prezzo: number | null };
} | null {
  if (!map || !cod_gamma) return null;
  const sp = map.get(cod_gamma);
  if (!sp) return null;
  if (sp.costo == null && sp.prezzo == null) return null;
  const q = Number(row.quantita ?? 0);
  const costoUnit = q > 0 ? Number(row.costo ?? 0) / q : Number(row.costo ?? 0);
  const prezzoUnit = Number(row.prezzo_unit ?? 0);
  const EPS = 0.015;
  const costoOk = sp.costo == null || Math.abs(costoUnit - sp.costo) <= EPS;
  const prezzoOk = sp.prezzo == null || Math.abs(prezzoUnit - sp.prezzo) <= EPS;
  return { stato: costoOk && prezzoOk ? "attivo" : "modificato", special: sp };
}

export interface PreventivoConDettagli extends Preventivo {
  cliente: ClienteRow | null;
  cantiere: CantierePreventivo | null;
  agente: { id: string; nome: string } | null;
  blocchi: BloccoConRighe[];
  prezziSpeciali: PrezzoSpecialeCantiere[];
}

export interface BloccoConRighe extends Blocco {
  righe: (Riga & {
    peso_gamma_unit?: number | null;
    unita_gamma?: UnitaGammaRiga | null;
    articolo: {
      id: string;
      cod_gamma: string | null;
      descrizione: string;
      um: string | null;
      peso_unit: number | null;
    } | null;
  })[];
}

const BLOCCHI_SELECT = `
  *,
  righe:righe_preventivo (
    *,
    articolo:articoli (id, cod_gamma, descrizione, um, peso_unit)
  )
`;

async function fetchPrezziSpecialiCantiere(cantiere_id: string | null): Promise<PrezzoSpecialeCantiere[]> {
  if (!cantiere_id) return [];
  const { data, error } = await supabase
    .from("cantiere_listini_speciali")
    .select("cod_gamma, costo_netto_speciale, prezzo_vendita_speciale")
    .eq("cantiere_id", cantiere_id);
  if (error) throw error;
  return (data ?? []).filter((r) => r.cod_gamma) as PrezzoSpecialeCantiere[];
}

export async function fetchPreventivo(id: string): Promise<PreventivoConDettagli> {
  const { data, error } = await supabase
    .from("preventivi")
    .select(`*, blocchi:blocchi_preventivo(${BLOCCHI_SELECT})`)
    .eq("id", id)
    .single();
  if (error) throw error;
  const p = data as unknown as PreventivoConDettagli;
  const pesi = await fetchPesiGamma(p.blocchi.flatMap((b) => b.righe.map((r) => r.articolo_codice ?? "")));
  p.blocchi.sort((a, b) => Number(a.ordine ?? 0) - Number(b.ordine ?? 0));
  for (const b of p.blocchi) {
    for (const r of b.righe) {
      if (r.articolo_codice) {
        r.peso_gamma_unit = pesi.get(r.articolo_codice)?.peso_netto ?? null;
        r.unita_gamma = pesi.get(r.articolo_codice) ?? null;
      }
    }
    b.righe.sort((a, b2) => Number(a.ordine ?? 0) - Number(b2.ordine ?? 0));
  }
  p.cliente = p.cliente_id ? await fetchClienteLite(p.cliente_id) : null;
  if (p.cantiere_id) {
    p.cantiere = await fetchCantierePreventivo(p.cantiere_id);
  } else {
    p.cantiere = null;
  }
  p.agente = null;
  if (p.agente_codice) {
    const { data: ag } = await supabase
      .from("agenti")
      .select("codice, descrizione")
      .eq("codice", p.agente_codice)
      .maybeSingle();
    const agRow = ag as unknown as { codice: string; descrizione: string } | null;
    if (agRow) p.agente = { id: agRow.codice, nome: agRow.descrizione };
  }
  p.prezziSpeciali = await fetchPrezziSpecialiCantiere(p.cantiere_id);
  return p;
}

export async function anteprimaProssimoNumero(
  anno?: number,
  tipo: TipoDocumento = "preventivo",
): Promise<string> {
  const a = anno ?? new Date().getFullYear();
  const rpcName = tipo === "ordine" ? "anteprima_numero_ordine" : "anteprima_numero_preventivo";
  const prefix = tipo === "ordine" ? "ORD" : "PRV";
  const { data, error } = await supabase.rpc(rpcName, { p_anno: a });
  if (error) throw error;
  return `${prefix}-${data}/${String(a).slice(-2)}`;
}

async function assegnaProssimoNumero(anno: number, tipo: TipoDocumento = "preventivo"): Promise<string> {
  const rpcName = tipo === "ordine" ? "prossimo_numero_ordine" : "prossimo_numero_preventivo";
  const prefix = tipo === "ordine" ? "ORD" : "PRV";
  const { data, error } = await supabase.rpc(rpcName, { p_anno: anno });
  if (error) throw error;
  return `${prefix}-${data}/${String(anno).slice(-2)}`;
}

export async function createPreventivo(
  row: PreventivoInsert,
): Promise<{ preventivo: Preventivo; numeroRiassegnato: string | null }> {
  const anno = new Date().getFullYear();
  const tipo: TipoDocumento = (row.tipo as TipoDocumento) ?? "preventivo";
  let numero = (row.numero ?? "").trim();
  if (!numero) {
    numero = await assegnaProssimoNumero(anno, tipo);
  }
  let reassignedTo: string | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const payload = { ...row, numero };
    const { data, error } = await supabase
      .from("preventivi")
      .insert(payload)
      .select()
      .single();
    if (!error) {
      return { preventivo: data, numeroRiassegnato: reassignedTo };
    }
    const isDup =
      error.code === "23505" ||
      /preventivi_numero_unique|duplicate key/i.test(error.message ?? "");
    if (!isDup) {
      console.error("[createPreventivo] Supabase error:", error);
      throw new Error(
        `${error.message}${error.details ? ` — ${error.details}` : ""}${error.hint ? ` (hint: ${error.hint})` : ""}${error.code ? ` [${error.code}]` : ""}`,
      );
    }
    numero = await assegnaProssimoNumero(anno, tipo);
    reassignedTo = numero;
  }
  throw new Error("Impossibile assegnare un numero libero dopo 5 tentativi");
}

export async function updatePreventivo(id: string, patch: PreventivoUpdate): Promise<Preventivo> {
  const { data, error } = await supabase
    .from("preventivi")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePreventivo(id: string) {
  const { error } = await supabase.from("preventivi").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Principale a cui collegare una nuova alternativa: da un principale il suo id,
 * da un'alternativa il suo principale (mai alternativa di alternativa).
 */
export function principaleDiAlternativa(src: { id: string; alternativa_di?: string | null }): string {
  return src.alternativa_di ?? src.id;
}

/**
 * Duplica un preventivo: testata + blocchi + righe.
 * NB: la copia degli ALLEGATI è rimandata allo strato di integrazione allegati
 * (si userà il sistema allegati polimorfico di FidiManager). Per ora il duplicato
 * NON copia gli allegati.
 */
export async function duplicaPreventivo(
  sourceId: string,
  options: { mode?: "stesso_cliente" | "nuovo_cliente" | "alternativa"; nuovoClienteId?: string | null } = {},
): Promise<{ id: string; numero: string; allegatiFalliti: string[] }> {
  const mode = options.mode ?? "stesso_cliente";
  const nuovoCliente = mode === "nuovo_cliente";
  const src = await fetchPreventivo(sourceId);
  if (src.tipo !== "preventivo") {
    throw new Error("Solo i preventivi possono essere duplicati");
  }

  let nuovoClienteRow: { id: string; codice_agente: string | null; fascia_listino_default: FasciaListino | null } | null = null;
  if (nuovoCliente) {
    if (!options.nuovoClienteId) {
      throw new Error("Seleziona un cliente per il duplicato");
    }
    // TODO: valutare lite anche qui
    const { data, error } = await supabase
      .from("clienti")
      .select("id, codice_agente, fascia_listino_default")
      .eq("id", options.nuovoClienteId)
      .single();
    if (error) throw error;
    nuovoClienteRow = data;
  }

  const oggi = new Date().toISOString().slice(0, 10);
  if (nuovoCliente && !nuovoClienteRow) throw new Error("Cliente del duplicato non trovato");
  const { preventivo: nuovo } = await createPreventivo({
    data: oggi,
    validita: src.validita,
    cliente_id: nuovoCliente ? nuovoClienteRow?.id : src.cliente_id,
    cantiere_id: nuovoCliente ? null : src.cantiere_id,
    agente_codice: nuovoCliente ? nuovoClienteRow?.codice_agente : src.agente_codice,
    filiale: nuovoCliente ? null : src.filiale,
    fascia_listino: src.fascia_listino, // FM65: colonna non più usata per i prezzi
    tipo_doc: src.tipo_doc,
    stato: "bozza",
    iva_perc: src.iva_perc,
    sconto_piede_perc: src.sconto_piede_perc,
    note: src.note,
    titolo: src.titolo,
    condizione_pagamento_cod: src.condizione_pagamento_cod,
    alternativa_di: mode === "alternativa" ? principaleDiAlternativa(src) : null,
    tipo: "preventivo",
    preventivo_origine_id: null,
    totale_imponibile: src.totale_imponibile,
    iva_importo: src.iva_importo,
    totale: src.totale,
  });

  for (const b of src.blocchi) {
    const { data: nb, error: bErr } = await supabase
      .from("blocchi_preventivo")
      .insert({
        preventivo_id: nuovo.id,
        descrizione: b.descrizione,
        rif_capitolato: b.rif_capitolato,
        note_tecniche: b.note_tecniche,
        ordine: b.ordine,
        importo: b.importo,
        prezzo_um: b.prezzo_um,
        um_base: b.um_base,
        quantita_base: b.quantita_base,
        kit_id: b.kit_id,
      })
      .select("id")
      .single();
    if (bErr) throw bErr;

    if (b.righe.length > 0) {
      const righeIns = b.righe.map((r) => ({
        blocco_id: nb.id,
        tipo_riga: r.tipo_riga,
        articolo_id: r.articolo_id,
        descrizione: r.descrizione,
        um: r.um,
        um_scelta: r.um_scelta,
        incidenza: r.incidenza,
        quantita: r.quantita,
        prezzo_unit: r.prezzo_unit,
        sconto_perc: r.sconto_perc,
        articolo_codice: r.articolo_codice,
        sconti_gamma: r.sconti_gamma,
        maggiorazione_perc: r.maggiorazione_perc,
        segno: r.segno,
        importo: r.importo,
        costo: r.costo,
        ricarico: r.ricarico,
        margine: r.margine,
        vendita: r.vendita,
        peso: r.peso,
        ordine: r.ordine,
        qta_ordinata: 0,
        riga_origine_id: null,
      }));
      const { error: rErr } = await supabase.from("righe_preventivo").insert(righeIns);
      if (rErr) throw rErr;
    }
  }

  await copiaNotePreventivo(sourceId, nuovo.id);
  return { id: nuovo.id, numero: nuovo.numero ?? "", allegatiFalliti: [] };
}

export async function insertBlocco(row: BloccoInsert): Promise<Blocco> {
  const { data, error } = await supabase
    .from("blocchi_preventivo")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBlocco(id: string, patch: BloccoUpdate): Promise<Blocco> {
  const { data, error } = await supabase
    .from("blocchi_preventivo")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBlocco(id: string) {
  const { error } = await supabase.from("blocchi_preventivo").delete().eq("id", id);
  if (error) throw error;
}

export async function applicaScontoPiedeARighe(
  preventivo_id: string,
  perc: number,
): Promise<void> {
  const sc = Math.max(0, n(perc));
  const { data: blocchi, error: errB } = await supabase
    .from("blocchi_preventivo")
    .select("id, righe:righe_preventivo(*)")
    .eq("preventivo_id", preventivo_id);
  if (errB) throw errB;

  const updates: PromiseLike<unknown>[] = [];
  const importiPiede = new Map<string, number>();
  for (const b of (blocchi ?? []) as unknown as { id: string; righe: Riga[] }[]) {
    for (const r of b.righe ?? []) {
      if (!isRigaValorizzata(r)) continue;
      const patch = patchConImporto(r, { sconto_perc: sc });
      const importo = patch.importo ?? n(r.importo);
      importiPiede.set(r.id, importo);
      updates.push(
        supabase.from("righe_preventivo").update(patch).eq("id", r.id).then(),
      );
    }
  }
  await Promise.all(updates);

  await Promise.all(
    ((blocchi ?? []) as unknown as { id: string; righe: Riga[] }[]).map((b) => {
      let totale = 0;
      for (const r of b.righe ?? []) {
        if (!isRigaValorizzata(r)) continue;
        if (r.tipo_riga === "articolo_singolo" || r.tipo_riga === "da_kit" || r.tipo_riga === "manuale") {
          totale += importiPiede.get(r.id) ?? 0;
        } else {
          totale += n(r.importo);
        }
      }
      return supabase.from("blocchi_preventivo").update({ importo: round2(totale) }).eq("id", b.id).then();
    }),
  );
}

/** Riga candidata ad "Aggiorna listini": codice Gamma e confronto valori attuali → nuovi. */
export interface DifferenzaListino {
  riga_id: string;
  blocco_id: string;
  codice: string;
  descrizione: string | null;
  quantita: number;
  aggiungiCodice: boolean;
  confronto: NonNullable<ReturnType<typeof confrontoAggiornamento>>;
}

export interface AnalisiAggiornaListini {
  differenze: DifferenzaListino[];
  invariate: number;
  senza_prezzo: number;
  senza_codice: number;
  non_articolo: number;
}

/** FM65: confronta le righe articolo/kit con il motore prezzi del cliente (UNA chiamata). */
export async function analizzaAggiornaListini(preventivo_id: string): Promise<AnalisiAggiornaListini> {
  const prev = await fetchPreventivo(preventivo_id);
  if (!prev.cliente_id) throw new Error("Scegli prima il cliente: i prezzi arrivano dalle sue condizioni Gamma.");
  const candidate: { r: BloccoConRighe["righe"][number]; codice: string; blocco_id: string }[] = [];
  let senza_codice = 0;
  let non_articolo = 0;
  for (const b of prev.blocchi) {
    for (const r of b.righe) {
      if (isIntestazioneKit(r) || (r.tipo_riga !== "articolo_singolo" && r.tipo_riga !== "da_kit")) { non_articolo++; continue; }
      const codice = r.articolo_codice ?? r.articolo?.cod_gamma ?? null;
      if (!codice) { senza_codice++; continue; }
      candidate.push({ r, codice, blocco_id: b.id });
    }
  }
  const mappa = await fetchPrezziClienteArticoli(prev.cliente_id, candidate.map((c) => c.codice));
  const differenze: DifferenzaListino[] = [];
  let invariate = 0;
  let senza_prezzo = 0;
  for (const { r, codice, blocco_id } of candidate) {
    const p = mappa.get(codice);
    if (!p || p.prezzo_base == null) { senza_prezzo++; continue; }
    const confronto = confrontoAggiornamento(r, p);
    if (!confronto) { invariate++; continue; }
    differenze.push({
      riga_id: r.id, blocco_id, codice, descrizione: r.descrizione ?? r.articolo?.descrizione ?? null,
      quantita: n(r.quantita), aggiungiCodice: !r.articolo_codice, confronto,
    });
  }
  return { differenze, invariate, senza_prezzo, senza_codice, non_articolo };
}

/** Applica solo le righe spuntate; lo sconto extra (sconto_perc) non si tocca. */
export async function applicaAggiornaListini(preventivo_id: string, scelte: DifferenzaListino[]): Promise<{ aggiornate: number; speciali: number }> {
  const prev = await fetchPreventivo(preventivo_id);
  const righe = new Map(prev.blocchi.flatMap((b) => b.righe.map((r) => [r.id, r] as const)));
  let aggiornate = 0;
  for (const d of scelte) {
    const r = righe.get(d.riga_id);
    if (!r) continue;
    const nv = d.confronto.nuovi;
    const campi = {
      prezzo_unit: nv.prezzo_unit,
      sconti_gamma: nv.sconti_gamma,
      maggiorazione_perc: nv.maggiorazione_perc,
      costo: nv.costo_unit == null ? r.costo : costoRiga(nv.costo_unit, r.quantita),
      ...(r.articolo_codice ? {} : { articolo_codice: d.codice }),
    };
    const { error } = await supabase
      .from("righe_preventivo")
      .update(patchConImporto(r, campi))
      .eq("id", r.id);
    if (error) throw error;
    aggiornate++;
  }
  // Prezzi speciali del cantiere: applicati dopo il motore, come prima.
  const { aggiornate: speciali } = await riapplicaPrezziSpecialiCantiere(preventivo_id);
  await ricalcolaTotaliPreventivo(preventivo_id, n(prev.iva_perc));
  return { aggiornate, speciali };
}

async function ricalcolaTotaliPreventivo(preventivo_id: string, iva: number): Promise<void> {
  const { data: blocchi, error: bErr } = await supabase
    .from("blocchi_preventivo")
    .select("id, quantita_base, righe:righe_preventivo(*)")
    .eq("preventivo_id", preventivo_id);
  if (bErr) throw bErr;
  let tot = 0;
  for (const bl of ((blocchi ?? []) as unknown as { id: string; quantita_base: number | null; righe: Riga[] }[])) {
    let totale = 0;
    for (const r of bl.righe ?? []) {
      if (!isRigaValorizzata(r)) continue;
      totale += n(r.importo);
    }
    tot += round2(totale);
    const { error } = await supabase.from("blocchi_preventivo").update({ importo: round2(totale), prezzo_um: n(bl.quantita_base) > 0 ? round2(totale / n(bl.quantita_base)) : null }).eq("id", bl.id);
    if (error) throw error;
  }
  const { error: totaleErrore } = await supabase.from("preventivi").update({
    totale_imponibile: round2(tot),
    iva_importo: round2(tot * iva / 100),
    totale: round2(tot * (1 + iva / 100)),
  }).eq("id", preventivo_id);
  if (totaleErrore) throw totaleErrore;
}

export async function riapplicaPrezziSpecialiCantiere(preventivo_id: string): Promise<{
  aggiornate: number;
}> {
  const prev = await fetchPreventivo(preventivo_id);
  if (!prev.cantiere_id) return { aggiornate: 0 };
  const map = buildPrezziSpecialiMap(prev.prezziSpeciali ?? []);
  if (map.size === 0) return { aggiornate: 0 };

  let aggiornate = 0;
  const bloccoIdsDirty = new Set<string>();

  for (const b of prev.blocchi) {
    for (const r of b.righe) {
      if (isIntestazioneKit(r) || (r.tipo_riga !== "articolo_singolo" && r.tipo_riga !== "da_kit")) continue;
      const cod = r.articolo?.cod_gamma;
      if (!cod) continue;
      const sp = map.get(cod);
      if (!sp) continue;
      if (sp.costo == null && sp.prezzo == null) continue;
      const q = n(r.quantita);
      const nuovoPrezzo = sp.prezzo != null ? sp.prezzo : n(r.prezzo_unit);
      const costoUnitOld = q > 0 ? n(r.costo) / q : 0;
      const nuovoCostoUnit = sp.costo != null ? sp.costo : costoUnitOld;
      const importo = importoRiga({ ...r, prezzo_unit: nuovoPrezzo });
      const { error } = await supabase
        .from("righe_preventivo")
        .update(patchConImporto(r, {
          prezzo_unit: round2(nuovoPrezzo),
          costo: costoRiga(nuovoCostoUnit, q),
          vendita: round2(nuovoPrezzo * q),
          importo,
        }))
        .eq("id", r.id);
      if (error) throw error;
      aggiornate++;
      bloccoIdsDirty.add(b.id);
    }
  }

  if (aggiornate === 0) return { aggiornate: 0 };

  const { data: blocchi, error: bErr } = await supabase
    .from("blocchi_preventivo")
    .select("id, importo, righe:righe_preventivo(*)")
    .eq("preventivo_id", preventivo_id);
  if (bErr) throw bErr;
  for (const bl of (blocchi ?? []) as unknown as { id: string; righe: Riga[] }[]) {
    if (!bloccoIdsDirty.has(bl.id)) continue;
    let totale = 0;
    for (const r of bl.righe ?? []) {
      if (!isRigaValorizzata(r)) continue;
      totale += n(r.importo);
    }
    await supabase.from("blocchi_preventivo").update({ importo: round2(totale) }).eq("id", bl.id);
  }
  const tot = ((blocchi ?? []) as { importo: number | null }[]).reduce((s, b) => s + n(b.importo), 0);
  const iva = n(prev.iva_perc);
  await supabase.from("preventivi").update({
    totale_imponibile: round2(tot),
    iva_importo: round2(tot * iva / 100),
    totale: round2(tot * (1 + iva / 100)),
  }).eq("id", preventivo_id);

  return { aggiornate };
}

export async function addBloccoVuoto(preventivo_id: string, ordineNext: number): Promise<Blocco> {
  return insertBlocco({
    preventivo_id,
    descrizione: "Nuovo blocco",
    um_base: "mq",
    quantita_base: 0,
    ordine: ordineNext,
  });
}

export async function addBloccoDaKit(args: {
  preventivo_id: string;
  kit_id: string;
  quantita_base: number;
  ordine: number;
  cliente_id: string | null;
  sconto_piede: number;
}): Promise<Blocco> {
  if (!args.cliente_id) throw new Error("Scegli prima il cliente: i prezzi del kit arrivano dalle sue condizioni Gamma.");
  const kit = await fetchKit(args.kit_id);
  const codici = kit.componenti.map((c) => c.articolo?.cod_gamma).filter((c): c is string => !!c);
  const prezzi = await fetchPrezziClienteArticoli(args.cliente_id, codici);
  const pesi = await fetchPesiGamma(codici);

  const qBaseEff = args.quantita_base > 0 ? args.quantita_base : 1;
  const righe = kit.componenti.map((c, idx) => {
    // FASCIA_KIT_SOLO_INCIDENZA: calcolaRigaKit serve qui solo per l'incidenza; il prezzo è del motore.
    const incidenza = calcolaRigaKit(c, c.articolo, "A").incidenza_effettiva;
    const quantita = quantitaDaIncidenza(incidenza, qBaseEff) ?? 0;
    const codice = c.articolo?.cod_gamma ?? null;
    const campi = campiPrezzoDaMotore(codice ? prezzi.get(codice) : null, quantita, args.sconto_piede);
    return {
      tipo_riga: c.articolo_id == null ? "nota" as const : "da_kit" as const,
      articolo_id: c.articolo_id,
      articolo_codice: codice,
      descrizione: c.articolo?.descrizione ?? c.ruolo ?? null,
      um: c.articolo?.um ?? null,
      incidenza,
      quantita,
      segno: 1,
      vendita: null,
      peso: codice ? pesoRigaGamma(pesi.get(codice)?.peso_netto, quantita) : c.articolo_id ? round2((c.articolo?.peso_unit ?? 0) * quantita) : null,
      ordine: idx + 1,
      ...campi,
    };
  });
  const totale = round2(righe.reduce((s, r) => s + r.importo, 0));

  const blocco = await insertBlocco({
    preventivo_id: args.preventivo_id,
    kit_id: args.kit_id,
    descrizione: kit.nome,
    um_base: kit.um_base,
    quantita_base: args.quantita_base,
    prezzo_um: args.quantita_base > 0 ? round2(totale / args.quantita_base) : null,
    importo: totale,
    note_tecniche: kit.descrizione_tecnica,
    ordine: args.ordine,
  });
  if (righe.length) {
    const { error } = await supabase.from("righe_preventivo").insert(righe.map((r) => ({ ...r, blocco_id: blocco.id })));
    if (error) throw error;
  }
  return blocco;
}

export async function insertRiga(row: RigaInsert): Promise<Riga> {
  const { data, error } = await supabase
    .from("righe_preventivo")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRiga(id: string, patch: RigaUpdate): Promise<Riga> {
  const { data: corrente, error: letturaErrore } = await supabase.from("righe_preventivo")
    .select("*, blocco:blocchi_preventivo(quantita_base,preventivo_id)").eq("id", id).single();
  if (letturaErrore) throw letturaErrore;
  const codice = patch.articolo_codice ?? corrente.articolo_codice;
  const cambiaQuantita = "quantita" in patch || "incidenza" in patch;
  const pesi = codice && cambiaQuantita ? await fetchPesiGamma([codice]) : null;
  const riga = { ...corrente, ...(pesi && codice ? { peso_gamma_unit: pesi.get(codice)?.peso_netto ?? null } : {}) };
  const calcolata = patchConImporto(riga, patch, corrente.blocco?.quantita_base);
  const { data, error } = await supabase.from("righe_preventivo")
    .update(calcolata).eq("id", id).select().single();
  if (error) throw error;
  if (corrente.blocco?.preventivo_id) {
    const { data: prev, error: prevErrore } = await supabase.from("preventivi").select("iva_perc")
      .eq("id", corrente.blocco.preventivo_id).single();
    if (prevErrore) throw prevErrore;
    await ricalcolaTotaliPreventivo(corrente.blocco.preventivo_id, n(prev.iva_perc));
  }
  return data;
}

/**
 * FM65 R2b: salvataggio di una modifica di cella già calcolata a schermo
 * (patchConImporto sulla riga in cache, che contiene già i dati Gamma della riga).
 * Nessuna rilettura della riga né dei dati Gamma; poi totali di blocco e preventivo.
 */
export async function salvaPatchRigaCalcolata(id: string, calcolata: RigaUpdate, preventivo_id: string, iva: number): Promise<void> {
  const { error } = await supabase.from("righe_preventivo").update(calcolata).eq("id", id);
  if (error) throw error;
  await ricalcolaTotaliPreventivo(preventivo_id, iva);
}

export async function deleteRiga(id: string) {
  const { error } = await supabase.from("righe_preventivo").delete().eq("id", id);
  if (error) throw error;
}

export async function ricalcolaBloccoSuNuovaQuantita(
  blocco_id: string,
  nuovaQuantitaBase: number | null,
  righe: Riga[],
): Promise<void> {
  const qBase = n(nuovaQuantitaBase);
  const aggiornate: { id: string; importo: number }[] = [];
  const pesi = qBase > 0 ? await fetchPesiGamma(righe.filter((r) => isRigaValorizzata(r) && r.incidenza != null).map((r) => r.articolo_codice ?? "")) : null;

  await Promise.all(
    righe.map(async (r) => {
      if (!isRigaValorizzata(r)) return;
      const nuovaQta = quantitaDaIncidenza(r.incidenza, qBase);
      if (nuovaQta == null) return;
      const corrente = r.articolo_codice ? { ...r, peso_gamma_unit: pesi?.get(r.articolo_codice)?.peso_netto ?? null } : r;
      const patch = patchConImporto(corrente, { incidenza: r.incidenza }, qBase);
      const { error } = await supabase.from("righe_preventivo").update(patch).eq("id", r.id);
      if (error) throw error;
      const nuovoImporto = patch.importo ?? n(r.importo);
      aggiornate.push({ id: r.id, importo: nuovoImporto });
    }),
  );

  let totale = 0;
  for (const r of righe) {
    if (!isRigaValorizzata(r)) continue;
    const a = aggiornate.find((x) => x.id === r.id);
    if (a) { totale += a.importo; continue; }
    totale += n(r.importo);
  }
  totale = round2(totale);
  const prezzoUm = qBase > 0 ? round2(totale / qBase) : null;

  const patch: BloccoUpdate = {
    quantita_base: nuovaQuantitaBase,
    importo: totale,
    prezzo_um: prezzoUm,
  };
  const { error } = await supabase.from("blocchi_preventivo").update(patch).eq("id", blocco_id);
  if (error) throw error;
  const { data: blocco, error: bloccoErrore } = await supabase.from("blocchi_preventivo")
    .select("preventivo_id, preventivo:preventivi(iva_perc)").eq("id", blocco_id).single();
  if (bloccoErrore) throw bloccoErrore;
  await ricalcolaTotaliPreventivo(blocco.preventivo_id, n(blocco.preventivo?.iva_perc));
}

export async function reorderRighe(updates: { id: string; ordine: number }[]) {
  await Promise.all(
    updates.map((u) =>
      supabase.from("righe_preventivo").update({ ordine: u.ordine }).eq("id", u.id),
    ),
  );
}

export async function reorderBlocchi(updates: { id: string; ordine: number }[]) {
  await Promise.all(
    updates.map((u) =>
      supabase.from("blocchi_preventivo").update({ ordine: u.ordine }).eq("id", u.id),
    ),
  );
}

export interface RigaCalc {
  importo: number;
  costo: number;
  vendita: number;
  margine_perc: number;
  peso: number;
}

export function calcolaRiga(r: Partial<Riga> & { peso_gamma_unit?: number | null }): RigaCalc {
  const tipo = r.tipo_riga ?? "manuale";
  if (tipo !== "sotto_totale" && !isRigaValorizzata(r)) {
    return { importo: 0, costo: 0, vendita: 0, margine_perc: 0, peso: 0 };
  }
  const segno = segnoRiga(r.segno);
  const q = n(r.quantita);
  const p = n(r.prezzo_unit);
  const riga = { ...r, quantita: q, prezzo_unit: p };
  const importo = importoRiga(riga);
  const costo = round2(n(r.costo) || 0);
  const venditaSnapshot = r.vendita == null ? round2(q * p * segno) : round2(n(r.vendita));
  const margine = marginePercRiga(riga);
  return {
    importo,
    costo,
    vendita: venditaSnapshot,
    margine_perc: round2(margine),
    peso: r.articolo_codice ? n(pesoRigaGamma(r.peso_gamma_unit, q)) : round2(n(r.peso) || 0),
  };
}

export interface RigaCalcolata extends RigaCalc {
  importoEffettivo: number;
}

export function calcolaBlocco(righe: Riga[]): {
  righe: { id: string; calc: RigaCalcolata }[];
  totale: number;
  costo: number;
  peso: number;
} {
  let runningSegment = 0;
  let totaleBlocco = 0;
  let costoBlocco = 0;
  let pesoBlocco = 0;
  const out: { id: string; calc: RigaCalcolata }[] = [];

  for (const r of righe) {
    const c = calcolaRiga(r);
    if (r.tipo_riga === "sotto_totale") {
      out.push({
        id: r.id,
        calc: { ...c, importoEffettivo: round2(runningSegment) },
      });
      runningSegment = 0;
      continue;
    }
    if (!isRigaValorizzata(r)) {
      out.push({ id: r.id, calc: { ...c, importoEffettivo: 0 } });
      continue;
    }
    runningSegment += c.importo;
    totaleBlocco += c.importo;
    costoBlocco += c.costo;
    pesoBlocco += c.peso;
    out.push({ id: r.id, calc: { ...c, importoEffettivo: c.importo } });
  }

  return {
    righe: out,
    totale: round2(totaleBlocco),
    costo: round2(costoBlocco),
    peso: round2(pesoBlocco),
  };
}

export interface TotaliPreventivo {
  imponibile: number;
  imponibile_lordo: number;
  sconto_perc: number;
  importo_sconto: number;
  imponibile_netto: number;
  iva: number;
  totale: number;
}

export function calcolaTotaliPreventivo(
  blocchi: { righe: Riga[]; quantita_base?: number | null; prezzo_um?: number | null; importo?: number | null }[],
  iva_perc = 22,
  sconto_piede_perc = 0,
): TotaliPreventivo {
  let imponibileLordo = 0;
  for (const b of blocchi) {
    if (b.righe?.length) {
      imponibileLordo += calcolaBlocco(b.righe).totale;
    } else if (b.importo != null) {
      imponibileLordo += n(b.importo);
    } else if (b.quantita_base != null && b.prezzo_um != null) {
      imponibileLordo += n(b.quantita_base) * n(b.prezzo_um);
    }
  }
  imponibileLordo = round2(imponibileLordo);
  const scontoPerc = Math.max(0, n(sconto_piede_perc));
  const importoSconto = round2((imponibileLordo * scontoPerc) / 100);
  const imponibileNetto = round2(imponibileLordo - importoSconto);
  const iva = round2((imponibileNetto * n(iva_perc)) / 100);
  return {
    imponibile: imponibileNetto,
    imponibile_lordo: imponibileLordo,
    sconto_perc: scontoPerc,
    importo_sconto: importoSconto,
    imponibile_netto: imponibileNetto,
    iva,
    totale: round2(imponibileNetto + iva),
  };
}

export function fractionalOrder(prev: number | null, next: number | null): number {
  if (prev == null && next == null) return 1;
  if (prev == null) return (next as number) - 1;
  if (next == null) return prev + 1;
  return (prev + next) / 2;
}

export interface SelezioneTrasformazione {
  blocco_id: string;
  righe: { riga_id: string; quantita: number }[];
}

export async function trasformaPreventivoInOrdine(
  preventivoId: string,
  selezione: SelezioneTrasformazione[],
): Promise<string> {
  const { data, error } = await supabase.rpc("trasforma_preventivo_in_ordine", {
    p_preventivo_id: preventivoId,
    p_selezione: selezione as unknown as never,
  });
  if (error) throw error;
  return data as string;
}

export async function fetchOrdiniCollegati(preventivoId: string): Promise<PreventivoListItem[]> {
  const { data, error } = await supabase
    .from("preventivi")
    .select("*, cantiere:cantieri(id, nome)")
    .eq("tipo", "ordine")
    .eq("preventivo_origine_id", preventivoId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const items = (data ?? []) as unknown as PreventivoListItem[];
  await popolaClientiLite(items);
  return items;
}

export async function fetchPreventivoOrigine(
  preventivoOrigineId: string,
): Promise<{ id: string; numero: string | null } | null> {
  const { data, error } = await supabase
    .from("preventivi")
    .select("id, numero")
    .eq("id", preventivoOrigineId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// FM65: condizioni Gamma del cliente (sola lettura) e prezzo dal motore. Il TS non ricalcola prezzi.
export type CondizioniPreventivoCliente = Database["public"]["Functions"]["condizioni_preventivo_cliente"]["Returns"][number];
export async function fetchCondizioniPreventivoCliente(cliente_id: string): Promise<CondizioniPreventivoCliente | null> {
  const { data, error } = await supabase.rpc("condizioni_preventivo_cliente", { _cliente_id: cliente_id });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function fetchPrezzoClienteArticolo(cliente_id: string, codice: string) {
  const { data, error } = await supabase.rpc("prezzi_preventivo_cliente", { _cliente_id: cliente_id, _codici: [codice] });
  if (error) throw error;
  return data?.[0] ?? null;
}

/** FM65: prezzi del motore per più codici in UNA chiamata (max 500), indicizzati per codice. */
export async function fetchPrezziClienteArticoli(cliente_id: string, codici: string[]): Promise<Map<string, PrezzoClienteGamma & { um: string | null }>> {
  const unici = Array.from(new Set(codici.filter(Boolean)));
  const out = new Map<string, PrezzoClienteGamma & { um: string | null }>();
  if (unici.length === 0) return out;
  const { data, error } = await supabase.rpc("prezzi_preventivo_cliente", { _cliente_id: cliente_id, _codici: unici });
  if (error) throw error;
  for (const r of data ?? []) out.set(r.articolo_codice, r);
  return out;
}

/** FM65 punto 4: riepilogo articolo per il cliente del preventivo (sola lettura, una riga). Il prezzo di vendita resta in prezzi_preventivo_cliente. */
export type RiepilogoArticoloPreventivo = Database["public"]["Functions"]["riepilogo_articolo_preventivo"]["Returns"][number];
export async function fetchRiepilogoArticoloPreventivo(clienteId: string, codice: string): Promise<RiepilogoArticoloPreventivo | null> {
  const { data, error } = await supabase.rpc("riepilogo_articolo_preventivo", { _cliente_id: clienteId, _codice: codice });
  if (error) throw error;
  return data?.[0] ?? null;
}
