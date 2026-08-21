import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { calcCosto, round2 } from "./pricing";
import { calcIncidenzaFromDriver, round4, type TipoDriver } from "./incidenza";

export type Kit = Database["public"]["Tables"]["kit"]["Row"];
export type KitInsert = Database["public"]["Tables"]["kit"]["Insert"];
export type KitUpdate = Database["public"]["Tables"]["kit"]["Update"];
export type KitFamiglia = Database["public"]["Enums"]["kit_famiglia"];
export type KitComponente = Database["public"]["Tables"]["kit_componenti"]["Row"];
export type KitComponenteInsert = Database["public"]["Tables"]["kit_componenti"]["Insert"];
export type KitComponenteUpdate = Database["public"]["Tables"]["kit_componenti"]["Update"];
export type FasciaListino = Database["public"]["Enums"]["fascia_listino"];

export interface ArticoloConListini {
  id: string;
  cod_gamma: string | null;
  descrizione: string;
  um: string | null;
  peso_unit: number | null;
  qta_fornitore: number | null;
  qta_cliente: number | null;
  listini_acquisto: Database["public"]["Tables"]["listini_acquisto"]["Row"][];
  listini_vendita: Database["public"]["Tables"]["listini_vendita"]["Row"][];
}

export interface KitConComponenti extends Kit {
  componenti: (KitComponente & { articolo: ArticoloConListini | null })[];
}

export async function fetchKits(): Promise<Kit[]> {
  const { data, error } = await supabase
    .from("kit")
    .select("*")
    .order("famiglia")
    .order("nome");
  if (error) throw error;
  return data ?? [];
}

const KIT_SELECT = `
  *,
  componenti:kit_componenti (
    *,
    articolo:articoli (
      id, cod_gamma, descrizione, um, peso_unit, qta_fornitore, qta_cliente,
      listini_acquisto:listini_acquisto(*),
      listini_vendita:listini_vendita(*)
    )
  )
`;

export async function fetchKitsWithComponenti(): Promise<KitConComponenti[]> {
  const { data, error } = await supabase
    .from("kit")
    .select(KIT_SELECT)
    .order("famiglia")
    .order("nome");
  if (error) throw error;
  const list = (data ?? []) as unknown as KitConComponenti[];
  for (const k of list) {
    k.componenti.sort((a, b) => Number(a.ordine ?? 0) - Number(b.ordine ?? 0));
  }
  return list;
}

export async function fetchKit(id: string): Promise<KitConComponenti> {
  const { data, error } = await supabase
    .from("kit")
    .select(KIT_SELECT)
    .eq("id", id)
    .single();
  if (error) throw error;
  const kit = data as unknown as KitConComponenti;
  kit.componenti.sort((a, b) => Number(a.ordine ?? 0) - Number(b.ordine ?? 0));
  return kit;
}

export async function createKit(row: KitInsert): Promise<Kit> {
  const { data, error } = await supabase.from("kit").insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateKit(id: string, patch: KitUpdate): Promise<Kit> {
  const { data, error } = await supabase
    .from("kit")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteKit(id: string) {
  const { error } = await supabase.from("kit").delete().eq("id", id);
  if (error) throw error;
}

export async function duplicateKit(id: string, newName?: string): Promise<Kit> {
  const orig = await fetchKit(id);
  const { id: _id, created_at: _c, updated_at: _u, componenti, ...rest } = orig;
  const newKit = await createKit({ ...rest, nome: newName ?? `${orig.nome} (copia)` });
  if (componenti.length) {
    const rows: KitComponenteInsert[] = componenti.map((c) => ({
      kit_id: newKit.id,
      articolo_id: c.articolo_id,
      ruolo: c.ruolo,
      lato: c.lato,
      strato: c.strato,
      tipo_driver: c.tipo_driver,
      valore_driver: c.valore_driver,
      incidenza: c.incidenza,
      ordine: c.ordine,
    }));
    const { error } = await supabase.from("kit_componenti").insert(rows);
    if (error) throw error;
  }
  return newKit;
}

export async function insertComponente(row: KitComponenteInsert) {
  const { data, error } = await supabase
    .from("kit_componenti")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateComponente(id: string, patch: KitComponenteUpdate) {
  const { data, error } = await supabase
    .from("kit_componenti")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteComponente(id: string) {
  const { error } = await supabase.from("kit_componenti").delete().eq("id", id);
  if (error) throw error;
}

export function getCostoNettoCorrente(art: ArticoloConListini | null | undefined): number {
  if (!art || !art.listini_acquisto?.length) return 0;
  const sorted = [...art.listini_acquisto].sort((a, b) => {
    const da = a.data_validita ?? a.created_at ?? "";
    const db = b.data_validita ?? b.created_at ?? "";
    return db.localeCompare(da);
  });
  const top = sorted[0];
  if (top.costo_netto != null) return Number(top.costo_netto);
  return calcCosto(top).costo_netto;
}

export function getPrezzoVendita(
  art: ArticoloConListini | null | undefined,
  fascia: FasciaListino,
): number {
  if (!art) return 0;
  const lv = art.listini_vendita?.find((l) => l.fascia === fascia);
  return Number(lv?.prezzo ?? 0);
}

export interface RigaCalcolata {
  incidenza_effettiva: number;
  costo_unit: number;
  vendita_unit: number;
  costo_riga: number;
  vendita_riga: number;
  peso_riga: number;
}

export function calcolaRigaKit(
  c: KitComponente,
  art: ArticoloConListini | null | undefined,
  fascia: FasciaListino,
): RigaCalcolata {
  const incOverride = c.incidenza == null ? null : Number(c.incidenza);
  const incDriver = calcIncidenzaFromDriver({
    tipo_driver: c.tipo_driver as TipoDriver | null,
    valore_driver: c.valore_driver,
    qta_confezione: art?.qta_fornitore ?? art?.qta_cliente ?? null,
  });
  const incidenza =
    incOverride != null && !Number.isNaN(incOverride) ? incOverride : incDriver ?? 0;

  const costo_unit = getCostoNettoCorrente(art);
  const vendita_unit = getPrezzoVendita(art, fascia);
  const peso_unit = Number(art?.peso_unit ?? 0);

  return {
    incidenza_effettiva: round4(incidenza),
    costo_unit: round2(costo_unit),
    vendita_unit: round2(vendita_unit),
    costo_riga: round2(costo_unit * incidenza),
    vendita_riga: round2(vendita_unit * incidenza),
    peso_riga: round4(peso_unit * incidenza),
  };
}

export interface TotaliKit {
  costo_mq: number;
  prezzo_mq: number;
  margine_perc: number;
  kg_mq: number;
}

export function calcolaTotaliKit(
  componenti: (KitComponente & { articolo: ArticoloConListini | null })[],
  fascia: FasciaListino,
): TotaliKit {
  let costo = 0;
  let prezzo = 0;
  let peso = 0;
  for (const c of componenti) {
    const r = calcolaRigaKit(c, c.articolo, fascia);
    costo += r.costo_riga;
    prezzo += r.vendita_riga;
    peso += r.peso_riga;
  }
  const margine = prezzo > 0 ? ((prezzo - costo) / prezzo) * 100 : 0;
  return {
    costo_mq: round2(costo),
    prezzo_mq: round2(prezzo),
    margine_perc: round2(margine),
    kg_mq: round4(peso),
  };
}
