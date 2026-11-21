import { eliminaConEsito } from "./esito-eliminazione";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { ERRORE_CODICE_KIT, famigliaKitLegacy, proponiCodiceKit } from './kit-config';
import { lineaPreventivo, type LineaPreventivo } from './linee-preventivo';
import { normalizzaPatchRegoleKit, validaParametroKit, type KitParametro, type SalvataggioParametroKit } from './kit-regole-ui';
export type { KitParametro, SalvataggioParametroKit } from './kit-regole-ui';

type Tabelle = Database['public']['Tables'];
export type Kit = Pick<Tabelle['kit']['Row'], 'id' | 'codice' | 'nome' | 'linea' | 'famiglia_id' | 'um_base' | 'descrizione_tecnica' | 'specifiche' | 'created_at' | 'updated_at'>;
export type KitInsert = Pick<Tabelle['kit']['Insert'], 'nome' | 'um_base' | 'descrizione_tecnica' | 'specifiche'> & { codice: string; linea: LineaPreventivo; famiglia_id: string };
export type KitUpdate = Partial<Omit<KitInsert, 'linea'>>;
export type KitFamiglia = Tabelle['kit_famiglie']['Row'];
export type KitComponente = Omit<Tabelle['kit_componenti']['Row'], 'articolo_id'>;
export type KitComponenteInsert = Omit<Tabelle['kit_componenti']['Insert'], 'articolo_id'>;
export type KitComponenteUpdate = Omit<Tabelle['kit_componenti']['Update'], 'articolo_id'>;
export interface ArticoloKitGamma { codice: string; descrizione: string | null; um: string | null; peso_netto: number | null }
export interface KitConComponenti extends Kit { componenti: (KitComponente & { articolo: ArticoloKitGamma | null })[] }

const KIT_CAMPI = 'id,codice,nome,linea,famiglia_id,um_base,descrizione_tecnica,specifiche,created_at,updated_at' as const;
const COMPONENTE_CAMPI = 'id,kit_id,articolo_codice,codice_articolo_fornitore,descrizione,um,fornitore_id,marca,costo,listino_fornitore,note,ruolo,lato,strato,tipo_driver,valore_driver,incidenza,ordine,n_pezzi,passo,passo_2,consumo,lati,confezione,sfrido,peso_unitario,riga_rif,regola_base,regola_moltiplica,regola_dividi_1,regola_dividi_2,regola_confezione,regola_aggiunta,variante_ruolo,created_at,updated_at' as const;
const KIT_SELECT = `${KIT_CAMPI},componenti:kit_componenti(${COMPONENTE_CAMPI})` as const;

export async function fetchKitFamiglie(): Promise<KitFamiglia[]> {
  const { data, error } = await supabase.from('kit_famiglie').select('*').order('ordine').order('nome');
  if (error) throw error; return data ?? [];
}
export async function fetchKits(): Promise<Kit[]> {
  const { data, error } = await supabase.from('kit').select(KIT_CAMPI).order('codice');
  if (error) throw error; return data ?? [];
}
async function aggiungiGamma(kits: (Kit & { componenti: KitComponente[] })[]): Promise<KitConComponenti[]> {
  const codici = [...new Set(kits.flatMap(k => k.componenti.map(c => c.articolo_codice).filter((c): c is string => !!c)))];
  const gamma = new Map<string, ArticoloKitGamma>();
  for (let i=0; i<codici.length; i+=150) {
    const { data, error } = await supabase.from('articoli_gamma').select('codice,descrizione,um,peso_netto').in('codice',codici.slice(i,i+150));
    if (error) throw error; for (const a of data ?? []) gamma.set(a.codice,a);
  }
  return kits.map(k => ({ ...k, componenti: k.componenti.sort((a,b) => a.ordine-b.ordine).map(c => ({ ...c, articolo: c.articolo_codice ? gamma.get(c.articolo_codice) ?? null : null })) }));
}
export async function fetchKitsWithComponenti(): Promise<KitConComponenti[]> {
  const { data, error } = await supabase.from('kit').select(KIT_SELECT).order('codice');
  if (error) throw error;
  return aggiungiGamma((data ?? []) as unknown as (Kit & {componenti: KitComponente[]})[]);
}
export async function fetchKit(id: string): Promise<KitConComponenti> {
  const { data, error } = await supabase.from('kit').select(KIT_SELECT).eq('id',id).single();
  if (error) throw error;
  const [kit] = await aggiungiGamma([data as unknown as Kit & {componenti: KitComponente[]}]);
  if (!kit) throw new Error('Kit non trovato'); return kit;
}
export async function fetchCodiciKit(linea: LineaPreventivo): Promise<string[]> {
  const codici: string[] = [];
  for (let offset=0; ; offset+=1000) {
    const { data, error } = await supabase.from('kit').select('codice').like('codice',`${lineaPreventivo(linea).kit.prefissoCodice}-%`).order('codice').range(offset,offset+999);
    if (error) throw error; codici.push(...(data ?? []).map(k => k.codice));
    if ((data?.length ?? 0)<1000) return codici;
  }
}
export async function codiceKitUsato(codice: string, escluso?: string): Promise<boolean> {
  let q = supabase.from('kit').select('id').eq('codice',codice.trim());
  if (escluso) q=q.neq('id',escluso);
  const { data, error } = await q.limit(1);
  if (error) throw error; return !!data?.length;
}
export async function cercaGammaKit(codice: string): Promise<ArticoloKitGamma | null> {
  const { data, error } = await supabase.from('articoli_gamma').select('codice,descrizione,um,peso_netto').eq('codice',codice.trim()).maybeSingle();
  if (error) throw error; return data;
}
function erroreKit(error: { code?: string; message: string }): never {
  throw new Error(error.code === '23505' ? ERRORE_CODICE_KIT : error.message);
}
export async function createKit(row: KitInsert): Promise<Kit> {
  if (!row.codice.trim()) throw new Error('Indica il codice del kit');
  const famiglie = await fetchKitFamiglie();
  const famiglia = famiglie.find(f => f.id===row.famiglia_id && f.linea===row.linea && f.attiva);
  if (!famiglia) throw new Error('Scegli una famiglia attiva della linea');
  const { data, error } = await supabase.from('kit').insert({ ...row, codice: row.codice.trim(), famiglia: famigliaKitLegacy(famiglia.codice) }).select(KIT_CAMPI).single();
  if (error) erroreKit(error); if (!data) throw new Error('Kit non creato'); return data;
}
export async function updateKit(id: string, patch: KitUpdate): Promise<Kit> {
  if (patch.codice !== undefined && !patch.codice.trim()) throw new Error('Indica il codice del kit');
  if (patch.famiglia_id !== undefined) {
    const { data: kit, error: e } = await supabase.from('kit').select('linea').eq('id',id).single();
    if (e) throw e;
    const famiglie = await fetchKitFamiglie();
    if (!famiglie.some(f => f.id===patch.famiglia_id && f.linea===kit.linea && f.attiva)) throw new Error('Scegli una famiglia attiva della linea');
  }
  const { data, error } = await supabase.from('kit').update(patch).eq('id',id).select(KIT_CAMPI).single();
  if (error) erroreKit(error); if (!data) throw new Error('Kit non aggiornato'); return data;
}
export async function deleteKit(id: string) {
  return eliminaConEsito("kit", id);
}
export async function fetchKitParametri(kitId: string): Promise<KitParametro[]> {
  const { data, error } = await supabase.from('kit_parametri').select('*').eq('kit_id', kitId).order('ordine').order('codice');
  if (error) throw error;
  return data ?? [];
}
export async function salvaKitParametro(kitId: string, id: string | null, valori: SalvataggioParametroKit): Promise<KitParametro> {
  const row = validaParametroKit(valori);
  const query = id ? supabase.from('kit_parametri').update(row).eq('kit_id', kitId).eq('id', id)
    : supabase.from('kit_parametri').insert({ ...row, kit_id: kitId });
  const { data, error } = await query.select('*').single();
  if (error) throw new Error(error.code === '23505' ? 'Codice parametro già usato in questo kit.' : error.code === 'PGRST116' ? 'Non hai il permesso di modificare il parametro.' : error.message);
  if (!data) throw new Error('Parametro non salvato.');
  return data;
}
export async function deleteKitParametro(kitId: string, id: string) {
  return eliminaConEsito('kit_parametri', { richiesti: 1, filtro: q => q.eq('kit_id', kitId).eq('id', id) });
}
export async function riordinaKitParametri(kitId: string, parametri: readonly KitParametro[], id: string, verso: -1 | 1) {
  const indice = parametri.findIndex(p => p.id === id);
  const corrente = parametri[indice];
  const vicino = parametri[indice + verso];
  if (!corrente || !vicino) return;
  const ordinati = [...parametri];
  ordinati[indice] = vicino; ordinati[indice + verso] = corrente;
  for (const [ordine, p] of ordinati.entries()) {
    const { data, error } = await supabase.from('kit_parametri').update({ ordine }).eq('kit_id', kitId).eq('id', p.id).select('id').single();
    if (error || !data) throw new Error('Ordine dei parametri non completato. Ricarica la scheda e riprova.');
  }
}
export async function duplicateKit(id: string, newName?: string): Promise<Kit> {
  const orig = await fetchKit(id);
  const parametri = await fetchKitParametri(id);
  if (!orig.famiglia_id) throw new Error('Assegna prima una famiglia al kit');
  let newKit: Kit | undefined;
  for (let tentativo=0; tentativo<3; tentativo++) {
    const codice = proponiCodiceKit(orig.linea, await fetchCodiciKit(orig.linea));
    try {
      newKit = await createKit({ codice, linea: orig.linea, famiglia_id: orig.famiglia_id,
        nome: newName ?? `${orig.nome} (copia)`, um_base: orig.um_base, descrizione_tecnica: orig.descrizione_tecnica, specifiche: orig.specifiche });
      break;
    } catch (e) { if (!(e instanceof Error) || e.message!==ERRORE_CODICE_KIT || tentativo===2) throw e; }
  }
  if (!newKit) throw new Error('Duplicazione non riuscita');
  if (orig.componenti.length) {
    try {
    const rows: KitComponenteInsert[] = orig.componenti.map(c => {
      const { id: _id, kit_id: _kit, created_at: _c, updated_at: _u, articolo: _a, ...campi } = c;
      return normalizzaPatchRegoleKit({ ...campi, kit_id: newKit.id });
    });
    const { error } = await supabase.from('kit_componenti').insert(rows);
    if (error) throw error;
    } catch (e) {
      throw new Error(`Kit ${newKit.codice} creato, copia componenti non completata: ${e instanceof Error ? e.message : 'Dati non validi o salvataggio non riuscito.'}`);
    }
  }
  if (parametri.length) {
    const rows = parametri.map(({ id: _id, kit_id: _kit, created_at: _c, updated_at: _u, ...p }) => ({ ...p, kit_id: newKit.id }));
    const { error } = await supabase.from('kit_parametri').insert(rows);
    if (error) throw new Error(`Kit ${newKit.codice} creato, copia parametri non completata: ${error.message}`);
  }
  return newKit;
}
export async function insertComponente(row: KitComponenteInsert) {
  const { data, error } = await supabase.from('kit_componenti').insert(normalizzaPatchRegoleKit(row)).select(COMPONENTE_CAMPI).single();
  if (error) throw error;
  if (!data) throw new Error('La riga non è stata creata. Verifica i permessi e riprova.');
  return data;
}
export async function updateComponente(id: string, patch: KitComponenteUpdate) {
  const { data, error } = await supabase.from('kit_componenti').update(normalizzaPatchRegoleKit(patch)).eq('id',id).select(COMPONENTE_CAMPI).single();
  if (error) throw error;
  if (!data) throw new Error('La riga non è stata aggiornata. Verifica i permessi e riprova.');
  return data;
}
export async function deleteComponente(id: string) {
  return eliminaConEsito("kit_componenti", id);
}
