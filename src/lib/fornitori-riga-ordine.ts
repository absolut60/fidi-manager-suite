import { supabase } from '@/integrations/supabase/client';
import { fornitoreRigaOrdine } from './esportazione-gamma';

export async function cercaFornitoriRiga(termine: string) {
  const t = termine.trim().replace(/[%,()]/g, ' ');
  const { data, error } = await supabase.from('fornitori').select('id, ragione_sociale, alias, sconti_base')
    .or(`ragione_sociale.ilike.%${t}%,alias.ilike.%${t}%`).order('ragione_sociale').limit(20);
  if (error) throw error;
  return data ?? [];
}

export type FornitoreOrdine = { id: string; ragione_sociale: string | null; cambiabile?: boolean };

/** FM97: la matita del fornitore di riga compare solo quando serve. */
export function fornitoreRigaCambiabile(
  riga: { fornitore_id?: string | null },
  articolo: { fornitore_pref_id?: string | null } | null | undefined,
  numeroFornitori: number,
): boolean {
  if (numeroFornitori >= 2) return true;
  const pref = articolo?.fornitore_pref_id || null;
  if (!pref && !riga.fornitore_id) return true;
  return !!riga.fornitore_id && riga.fornitore_id !== pref;
}

/** Due letture per gruppo di righe, mai una ricerca del nome per ogni riga. */
export async function fornitoriRigheOrdine(righe: readonly { id: string; articolo_codice: string | null; fornitore_id: string | null }[]) {
  const codici = [...new Set(righe.flatMap(r => r.articolo_codice ? [r.articolo_codice] : []))];
  if (!codici.length) return new Map<string, FornitoreOrdine | null>();
  const { data: articoli, error } = await supabase.from('articoli_gamma').select('codice, fornitore_pref_id').in('codice', codici);
  if (error) throw error;
  const catalogo = new Map((articoli ?? []).map(a => [a.codice, a]));
  const { data: collegati, error: erroreCollegati } = await supabase.from('articoli_gamma_fornitori').select('articolo_codice, fornitore_id').in('articolo_codice', codici);
  if (erroreCollegati) throw erroreCollegati;
  const perArticolo = new Map<string, Set<string>>();
  for (const c of collegati ?? []) if (c.fornitore_id) {
    const set = perArticolo.get(c.articolo_codice) ?? new Set<string>(); set.add(c.fornitore_id); perArticolo.set(c.articolo_codice, set);
  }
  const cambiabili = new Map(righe.map(r => [r.id, fornitoreRigaCambiabile(r, catalogo.get(r.articolo_codice ?? ''), perArticolo.get(r.articolo_codice ?? '')?.size ?? 0)]));
  const righeIds = new Map(righe.map(r => [r.id, fornitoreRigaOrdine(r, catalogo.get(r.articolo_codice ?? ''))]));
  const ids = [...new Set([...righeIds.values()].filter((id): id is string => !!id))];
  const nomi = new Map<string, FornitoreOrdine>();
  if (ids.length) {
    const { data, error } = await supabase.from('fornitori').select('id, ragione_sociale').in('id', ids);
    if (error) throw error;
    for (const f of data ?? []) nomi.set(f.id, f);
  }
  return new Map([...righeIds].map(([rigaId, id]) => [rigaId, id ? { ...(nomi.get(id) ?? { id, ragione_sociale: null }), cambiabile: cambiabili.get(rigaId) ?? true } : null]));
}

export async function fornitoriCollegatiArticolo(codice: string) {
  const { data, error } = await supabase.from('articoli_gamma_fornitori').select('fornitore_id, preferenziale')
    .eq('articolo_codice', codice).order('preferenziale', { ascending: false, nullsFirst: false });
  if (error) throw error;
  const ids = [...new Set((data ?? []).flatMap(f => f.fornitore_id ? [f.fornitore_id] : []))];
  if (!ids.length) return [];
  const { data: fornitori, error: erroreNomi } = await supabase.from('fornitori').select('id, ragione_sociale').in('id', ids);
  if (erroreNomi) throw erroreNomi;
  const nomi = new Map((fornitori ?? []).map(f => [f.id, f]));
  return ids.flatMap(id => {
    const f = nomi.get(id);
    return f ? [{ ...f, preferenziale: (data ?? []).some(r => r.fornitore_id === id && r.preferenziale) }] : [];
  });
}