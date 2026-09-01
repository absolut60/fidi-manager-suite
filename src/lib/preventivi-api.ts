import { supabase } from "@/integrations/supabase/client";
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

export type Preventivo = Database["public"]["Tables"]["preventivi"]["Row"];
export type PreventivoInsert = Database["public"]["Tables"]["preventivi"]["Insert"];
export type PreventivoUpdate = Database["public"]["Tables"]["preventivi"]["Update"];
export type Blocco = Database["public"]["Tables"]["blocchi_preventivo"]["Row"];
export type BloccoInsert = Database["public"]["Tables"]["blocchi_preventivo"]["Insert"];
export type BloccoUpdate = Database["public"]["Tables"]["blocchi_preventivo"]["Update"];
export type Riga = Database["public"]["Tables"]["righe_preventivo"]["Row"];
export type RigaInsert = Database["public"]["Tables"]["righe_preventivo"]["Insert"];
export type RigaUpdate = Database["public"]["Tables"]["righe_preventivo"]["Update"];
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

export async function searchClienti(q: string): Promise<ClienteRow[]> {
  const { data, error } = await supabase.rpc("get_clienti_lite_search" as never, {
    _q: q ?? "",
  } as never);
  if (error) throw error;
  return ((data as unknown as ClienteLiteRpc[] | null) ?? []).map(mapLite);
}

/** Risolve i nomi cliente per una lista di documenti usando la RPC lite. */
async function popolaClientiLite(items: PreventivoListItem[]): Promise<void> {
  const ids = [...new Set(items.map((i) => i.cliente_id).filter((v): v is string => !!v))];
  if (ids.length === 0) return;
  const rows = await Promise.all(ids.map((id) => fetchClienteLite(id)));
  const map = new Map<string, { id: string; ragione_sociale: string }>();
  for (const r of rows) {
    if (r) map.set(r.id, { id: r.id, ragione_sociale: r.ragione_sociale ?? "—" });
  }
  for (const it of items) {
    it.cliente = it.cliente_id ? (map.get(it.cliente_id) ?? null) : null;
  }
}

export async function fetchCantieriByCliente(cliente_id: string): Promise<CantiereRow[]> {
  return _fetchCantieri(cliente_id);
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
  cliente_id?: string | null;
  stato?: StatoPreventivo | null;
  tipo_doc?: TipoDoc | null;
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
       cliente:clienti(id, ragione_sociale),
       cantiere:cantieri(id, nome),
       blocchi:blocchi_preventivo(righe:righe_preventivo(tipo_riga, quantita, qta_ordinata))`,
    )
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (f.tipo) q = q.eq("tipo", f.tipo);
  if (f.cliente_id) q = q.eq("cliente_id", f.cliente_id);
  if (f.stato) q = q.eq("stato", f.stato);
  if (f.tipo_doc) q = q.eq("tipo_doc", f.tipo_doc);
  if (f.search?.trim()) {
    const s = f.search.trim().replace(/[%,]/g, " ");
    q = q.or(`numero.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as PreventivoListItem[];
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
  cantiere: CantiereRow | null;
  agente: { id: string; nome: string } | null;
  blocchi: BloccoConRighe[];
  prezziSpeciali: PrezzoSpecialeCantiere[];
}

export interface BloccoConRighe extends Blocco {
  righe: (Riga & {
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
  p.blocchi.sort((a, b) => Number(a.ordine ?? 0) - Number(b.ordine ?? 0));
  for (const b of p.blocchi) {
    b.righe.sort((a, b2) => Number(a.ordine ?? 0) - Number(b2.ordine ?? 0));
  }
  p.cliente = p.cliente_id ? await _fetchCliente(p.cliente_id) : null;
  if (p.cantiere_id && p.cliente_id) {
    const cants = await _fetchCantieri(p.cliente_id);
    p.cantiere = cants.find((c) => c.id === p.cantiere_id) ?? null;
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
 * Duplica un preventivo: testata + blocchi + righe.
 * NB: la copia degli ALLEGATI è rimandata allo strato di integrazione allegati
 * (si userà il sistema allegati polimorfico di FidiManager). Per ora il duplicato
 * NON copia gli allegati.
 */
export async function duplicaPreventivo(
  sourceId: string,
  options: { mode?: "stesso_cliente" | "nuovo_cliente"; nuovoClienteId?: string | null } = {},
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
    const { data, error } = await supabase
      .from("clienti")
      .select("id, codice_agente, fascia_listino_default")
      .eq("id", options.nuovoClienteId)
      .single();
    if (error) throw error;
    nuovoClienteRow = data as unknown as typeof nuovoClienteRow;
  }

  const oggi = new Date().toISOString().slice(0, 10);
  const { preventivo: nuovo } = await createPreventivo({
    data: oggi,
    validita: src.validita,
    cliente_id: nuovoCliente ? nuovoClienteRow!.id : src.cliente_id,
    cantiere_id: nuovoCliente ? null : src.cantiere_id,
    agente_codice: nuovoCliente ? nuovoClienteRow!.codice_agente : src.agente_codice,
    filiale: nuovoCliente ? null : src.filiale,
    fascia_listino: nuovoCliente ? (nuovoClienteRow!.fascia_listino_default ?? src.fascia_listino) : src.fascia_listino,
    tipo_doc: src.tipo_doc,
    stato: "bozza",
    iva_perc: src.iva_perc,
    sconto_piede_perc: src.sconto_piede_perc,
    note: src.note,
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
        incidenza: r.incidenza,
        quantita: r.quantita,
        prezzo_unit: r.prezzo_unit,
        sconto_perc: r.sconto_perc,
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
  for (const b of (blocchi ?? []) as unknown as { id: string; righe: Riga[] }[]) {
    for (const r of b.righe ?? []) {
      if (r.tipo_riga !== "articolo_singolo" && r.tipo_riga !== "da_kit" && r.tipo_riga !== "manuale") continue;
      const q = n(r.quantita);
      const p = n(r.prezzo_unit);
      const segno = (r.segno ?? 1) === -1 ? -1 : 1;
      const importo = round2(q * p * (1 - sc / 100) * segno);
      updates.push(
        supabase.from("righe_preventivo").update({ sconto_perc: sc, importo }).eq("id", r.id).then(),
      );
    }
  }
  await Promise.all(updates);

  await Promise.all(
    ((blocchi ?? []) as unknown as { id: string; righe: Riga[] }[]).map((b) => {
      let totale = 0;
      for (const r of b.righe ?? []) {
        if (r.tipo_riga === "nota" || r.tipo_riga === "separatore" || r.tipo_riga === "sotto_totale") continue;
        if (r.tipo_riga === "articolo_singolo" || r.tipo_riga === "da_kit" || r.tipo_riga === "manuale") {
          const q = n(r.quantita);
          const p = n(r.prezzo_unit);
          const segno = (r.segno ?? 1) === -1 ? -1 : 1;
          totale += q * p * (1 - sc / 100) * segno;
        } else {
          totale += n(r.importo);
        }
      }
      return supabase.from("blocchi_preventivo").update({ importo: round2(totale) }).eq("id", b.id).then();
    }),
  );
}

export async function aggiornaListiniPreventivo(preventivo_id: string): Promise<{
  aggiornate: number;
  saltate_manuali: number;
  senza_listino: number;
  speciali_applicati: number;
}> {
  const prev = await fetchPreventivo(preventivo_id);
  const fascia = prev.fascia_listino;
  if (!fascia) {
    throw new Error("Imposta la fascia di listino del preventivo prima di aggiornare i listini.");
  }

  const articoloIds = new Set<string>();
  for (const b of prev.blocchi) {
    for (const r of b.righe) {
      if (r.articolo_id && (r.tipo_riga === "articolo_singolo" || r.tipo_riga === "da_kit")) {
        articoloIds.add(r.articolo_id);
      }
    }
  }

  const articoliMap = new Map<string, ArticoloConListini>();
  if (articoloIds.size > 0) {
    const { data, error } = await supabase
      .from("articoli")
      .select(`id, cod_gamma, descrizione, um, peso_unit, qta_fornitore, qta_cliente,
        listini_acquisto:listini_acquisto(*),
        listini_vendita:listini_vendita(*)`)
      .in("id", Array.from(articoloIds));
    if (error) throw error;
    for (const a of (data ?? []) as unknown as ArticoloConListini[]) {
      articoliMap.set(a.id, a);
    }
  }

  let aggiornate = 0;
  let saltate_manuali = 0;
  let senza_listino = 0;

  const prezziSpecialiMap = buildPrezziSpecialiMap(prev.prezziSpeciali ?? []);
  let speciali_applicati = 0;

  for (const b of prev.blocchi) {
    for (const r of b.righe) {
      if (r.tipo_riga === "nota" || r.tipo_riga === "separatore" || r.tipo_riga === "sotto_totale") {
        continue;
      }
      if (r.tipo_riga === "manuale") { saltate_manuali++; continue; }
      if (r.tipo_riga !== "articolo_singolo" && r.tipo_riga !== "da_kit") continue;
      if (!r.articolo_id) { saltate_manuali++; continue; }
      const art = articoliMap.get(r.articolo_id);
      if (!art) { senza_listino++; continue; }
      let vendita_unit = getPrezzoVendita(art, fascia);
      let costo_unit = getCostoNettoCorrente(art);
      const sp_cant = art.cod_gamma ? prezziSpecialiMap.get(art.cod_gamma) : undefined;
      if (sp_cant) {
        if (sp_cant.costo != null) costo_unit = sp_cant.costo;
        if (sp_cant.prezzo != null) vendita_unit = sp_cant.prezzo;
        speciali_applicati++;
      }
      if (!vendita_unit) senza_listino++;
      const q = n(r.quantita);
      const segno = (r.segno ?? 1) === -1 ? -1 : 1;
      const importo = round2(q * vendita_unit * segno);
      const { error: upErr } = await supabase
        .from("righe_preventivo")
        .update({
          prezzo_unit: round2(vendita_unit),
          sconto_perc: 0,
          costo: round2(costo_unit * q),
          vendita: round2(vendita_unit * q),
          peso: round2(Number(art.peso_unit ?? 0) * q),
          importo,
        })
        .eq("id", r.id);
      if (upErr) throw upErr;
      aggiornate++;
    }
  }

  const sp = n(prev.sconto_piede_perc);
  if (sp > 0) {
    await applicaScontoPiedeARighe(preventivo_id, sp);
  } else {
    const { data: blocchi, error: bErr } = await supabase
      .from("blocchi_preventivo")
      .select("id, righe:righe_preventivo(*)")
      .eq("preventivo_id", preventivo_id);
    if (bErr) throw bErr;
    for (const bl of ((blocchi ?? []) as unknown as { id: string; righe: Riga[] }[])) {
      let totale = 0;
      for (const r of bl.righe ?? []) {
        if (r.tipo_riga === "nota" || r.tipo_riga === "separatore" || r.tipo_riga === "sotto_totale") continue;
        totale += n(r.importo);
      }
      const { error: ubErr } = await supabase
        .from("blocchi_preventivo")
        .update({ importo: round2(totale) })
        .eq("id", bl.id);
      if (ubErr) throw ubErr;
    }
  }

  const { data: blocchi2, error: b2Err } = await supabase
    .from("blocchi_preventivo")
    .select("importo")
    .eq("preventivo_id", preventivo_id);
  if (b2Err) throw b2Err;
  const tot = (blocchi2 ?? []).reduce((s, b) => s + n((b as { importo: number | null }).importo), 0);
  const iva = n(prev.iva_perc);
  await supabase.from("preventivi").update({
    totale_imponibile: round2(tot),
    iva_importo: round2(tot * iva / 100),
    totale: round2(tot * (1 + iva / 100)),
  }).eq("id", preventivo_id);

  return { aggiornate, saltate_manuali, senza_listino, speciali_applicati };
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
      if (r.tipo_riga !== "articolo_singolo" && r.tipo_riga !== "da_kit") continue;
      const cod = r.articolo?.cod_gamma;
      if (!cod) continue;
      const sp = map.get(cod);
      if (!sp) continue;
      if (sp.costo == null && sp.prezzo == null) continue;
      const q = n(r.quantita);
      const segno = (r.segno ?? 1) === -1 ? -1 : 1;
      const sc = n(r.sconto_perc);
      const nuovoPrezzo = sp.prezzo != null ? sp.prezzo : n(r.prezzo_unit);
      const costoUnitOld = q > 0 ? n(r.costo) / q : 0;
      const nuovoCostoUnit = sp.costo != null ? sp.costo : costoUnitOld;
      const importo = round2(q * nuovoPrezzo * (1 - sc / 100) * segno);
      const { error } = await supabase
        .from("righe_preventivo")
        .update({
          prezzo_unit: round2(nuovoPrezzo),
          costo: round2(nuovoCostoUnit * q),
          vendita: round2(nuovoPrezzo * q),
          importo,
        })
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
      if (r.tipo_riga === "nota" || r.tipo_riga === "separatore" || r.tipo_riga === "sotto_totale") continue;
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
  fascia: FasciaListino;
  ordine: number;
}): Promise<Blocco> {
  const kit = await fetchKit(args.kit_id);
  const totali = kit.componenti.reduce(
    (acc, c) => {
      const r = calcolaRigaKit(c, c.articolo, args.fascia);
      acc.prezzo += r.vendita_riga;
      acc.costo += r.costo_riga;
      return acc;
    },
    { prezzo: 0, costo: 0 },
  );

  const blocco = await insertBlocco({
    preventivo_id: args.preventivo_id,
    kit_id: args.kit_id,
    descrizione: kit.nome,
    um_base: kit.um_base,
    quantita_base: args.quantita_base,
    prezzo_um: round2(totali.prezzo),
    importo: round2(totali.prezzo * args.quantita_base),
    note_tecniche: kit.descrizione_tecnica,
    ordine: args.ordine,
  });

  const qBaseEff = args.quantita_base > 0 ? args.quantita_base : 1;
  const righeRows: RigaInsert[] = kit.componenti.map((c, idx) => {
    const r = calcolaRigaKit(c, c.articolo, args.fascia);
    const incidenza = r.incidenza_effettiva;
    const quantita = round2(incidenza * qBaseEff);
    return {
      blocco_id: blocco.id,
      tipo_riga: "da_kit",
      articolo_id: c.articolo_id,
      descrizione: c.articolo?.descrizione ?? c.ruolo ?? null,
      um: c.articolo?.um ?? null,
      incidenza,
      quantita,
      prezzo_unit: r.vendita_unit,
      sconto_perc: 0,
      segno: 1,
      importo: round2(r.vendita_unit * quantita),
      costo: round2(r.costo_unit * quantita),
      vendita: round2(r.vendita_unit * quantita),
      peso: round2((c.articolo?.peso_unit ?? 0) * quantita),
      ordine: idx + 1,
    };
  });
  if (righeRows.length) {
    const { error } = await supabase.from("righe_preventivo").insert(righeRows);
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
  const { data, error } = await supabase
    .from("righe_preventivo")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
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

  await Promise.all(
    righe.map(async (r) => {
      if (r.tipo_riga !== "da_kit" && r.tipo_riga !== "articolo_singolo") return;
      const inc = r.incidenza == null ? null : n(r.incidenza);
      if (inc == null) return;
      const oldQta = n(r.quantita) || 1;
      const nuovaQta = round2(inc * qBase);
      const prezzo = n(r.prezzo_unit);
      const sc = n(r.sconto_perc);
      const segno = (r.segno ?? 1) === -1 ? -1 : 1;
      const nuovoImporto = round2(prezzo * nuovaQta * (1 - sc / 100) * segno);
      const nuovoCosto = round2((n(r.costo) / oldQta) * nuovaQta);
      const nuovaVendita = round2((n(r.vendita) / oldQta) * nuovaQta);
      const nuovoPeso = round2((n(r.peso) / oldQta) * nuovaQta);
      const { error } = await supabase
        .from("righe_preventivo")
        .update({
          quantita: nuovaQta,
          importo: nuovoImporto,
          costo: nuovoCosto,
          vendita: nuovaVendita,
          peso: nuovoPeso,
        })
        .eq("id", r.id);
      if (error) throw error;
      aggiornate.push({ id: r.id, importo: nuovoImporto });
    }),
  );

  let totale = 0;
  for (const r of righe) {
    if (r.tipo_riga === "nota" || r.tipo_riga === "separatore" || r.tipo_riga === "sotto_totale") continue;
    if (r.tipo_riga === "da_kit" || r.tipo_riga === "articolo_singolo") {
      const inc = r.incidenza == null ? null : n(r.incidenza);
      if (inc != null) {
        const a = aggiornate.find((x) => x.id === r.id);
        if (a) { totale += a.importo; continue; }
      }
    }
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

export function calcolaRiga(r: Partial<Riga>): RigaCalc {
  const tipo = r.tipo_riga ?? "manuale";
  if (tipo === "nota" || tipo === "separatore") {
    return { importo: 0, costo: 0, vendita: 0, margine_perc: 0, peso: 0 };
  }
  const segno = (r.segno ?? 1) === -1 ? -1 : 1;
  const q = n(r.quantita);
  const p = n(r.prezzo_unit);
  const sc = n(r.sconto_perc);
  const importo = round2(q * p * (1 - sc / 100) * segno);
  const costo = round2(n(r.costo) || 0);
  const venditaSnapshot = r.vendita == null ? round2(q * p * segno) : round2(n(r.vendita));
  const prezzoScontatoUnit = p * (1 - sc / 100) * segno;
  const costoUnit = q > 0 ? n(r.costo) / q : 0;
  const margine =
    prezzoScontatoUnit !== 0
      ? ((prezzoScontatoUnit - costoUnit) / prezzoScontatoUnit) * 100
      : 0;
  return {
    importo,
    costo,
    vendita: venditaSnapshot,
    margine_perc: round2(margine),
    peso: round2(n(r.peso) || 0),
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
    if (r.tipo_riga === "nota" || r.tipo_riga === "separatore") {
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
    .select("*, cliente:clienti(id, ragione_sociale), cantiere:cantieri(id, nome)")
    .eq("tipo", "ordine")
    .eq("preventivo_origine_id", preventivoId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PreventivoListItem[];
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
