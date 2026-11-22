import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fornitoreRigaOrdine, listinoAcquistoSede, type DatiOrdineGamma } from './esportazione-gamma';

type Tabelle = Database['public']['Tables'];
type Riga<T extends keyof Tabelle> = Tabelle[T]['Row'];
const BLOCCO_LETTURA = 150;
const PAGINA_LETTURA = 1000;
const unici = (valori: (string | null | undefined)[]) => [...new Set(valori.filter((v): v is string => !!v))];

/** Contratto comune dei filtri PostgREST; conserva Row<T> anche con tabella generica. */
interface Lettura<T> extends PromiseLike<{ data: T[] | null; error: { message: string } | null }> {
  in(colonna: string, valori: string[]): Lettura<T>;
  eq(colonna: string, valore: string | number | boolean): Lettura<T>;
  order(colonna: string): Lettura<T>;
  range(da: number, a: number): Lettura<T>;
}

/** Letture RLS invariate; solo gli acquisti passano dalla RPC dedicata con gate Gamma. */
export async function caricaDatiEsportazioneGamma(
  ordineIds: string[], client: SupabaseClient<Database> = supabase,
): Promise<DatiOrdineGamma[]> {
  async function leggi<T extends keyof Tabelle>(tabella: T, colonna: string, valori: string[],
    filtri: Record<string, string | number | boolean> = {}, ordinamento = 'id'): Promise<Riga<T>[]> {
    const tutti: Riga<T>[] = [];
    const distinti = unici(valori);
    for (let i = 0; i < distinti.length; i += BLOCCO_LETTURA) {
      for (let offset = 0; ; offset += PAGINA_LETTURA) {
        const lettura = client.from(tabella).select('*') as unknown as Lettura<Riga<T>>;
        let query = lettura.in(colonna, distinti.slice(i, i + BLOCCO_LETTURA));
        for (const [campo, valore] of Object.entries(filtri)) query = query.eq(campo, valore);
        const { data, error } = await query.order(ordinamento).range(offset, offset + PAGINA_LETTURA - 1);
        if (error) throw new Error(`Impossibile leggere i dati per l'esportazione (${tabella}): ${error.message}`);
        const righe = data ?? [];
        tutti.push(...righe);
        if (righe.length < PAGINA_LETTURA) break;
      }
    }
    return tutti;
  }
  const ordini = await leggi('preventivi', 'id', ordineIds, { tipo: 'ordine' });
  const trovati = new Set(ordini.map(o => o.id));
  if (unici(ordineIds).some(id => !trovati.has(id))) throw new Error('Uno o più ordini non esistono o non sono visibili.');
  if (!ordini.length) return [];
  const [blocchi, clienti, lead, origini] = await Promise.all([
    leggi('blocchi_preventivo', 'preventivo_id', ordini.map(o => o.id)),
    leggi('clienti', 'id', unici(ordini.map(o => o.cliente_id))),
    leggi('lead', 'id', unici(ordini.map(o => o.lead_id))),
    leggi('preventivi', 'id', unici(ordini.map(o => o.preventivo_origine_id))),
  ]);
  const [righe, sedi, depositi] = await Promise.all([
    leggi('righe_preventivo', 'blocco_id', blocchi.map(b => b.id)),
    leggi('stores', 'id', unici([...ordini.map(o => o.store_id), ...lead.map(l => l.store_id)])),
    leggi('depositi', 'store_id', unici(ordini.map(o => o.store_id)), { tipo: 'Centrale', attivo: true }, 'codice'),
  ]);
  const articoli = await leggi('articoli_gamma', 'codice', unici(righe.map(r => r.articolo_codice)), {}, 'codice');
  const articoloPerCodice = new Map(articoli.map(a => [a.codice, a]));
  const bloccoPerId = new Map(blocchi.map(b => [b.id, b]));
  const righePerOrdine = new Map<string, typeof righe>();
  for (const r of righe) {
    const oid = bloccoPerId.get(r.blocco_id)?.preventivo_id;
    if (oid) { const elenco = righePerOrdine.get(oid) ?? []; elenco.push(r); righePerOrdine.set(oid, elenco); }
  }
  async function leggiAcquisti() {
    const tutti: Database['public']['Functions']['acquisti_gamma_ordini']['Returns'] = [];
    for (let i = 0; i < ordini.length; i += BLOCCO_LETTURA) {
      for (let offset = 0; ; offset += PAGINA_LETTURA) {
        const { data, error } = await client.rpc('acquisti_gamma_ordini', { _ordine_ids: ordini.slice(i, i + BLOCCO_LETTURA).map(o => o.id) })
          .order('articolo_codice').order('listino').range(offset, offset + PAGINA_LETTURA - 1);
        if (error) throw new Error(`Impossibile leggere i dati per l'esportazione (acquisti_gamma_ordini): ${error.message}`);
        tutti.push(...(data ?? []));
        if ((data ?? []).length < PAGINA_LETTURA) break;
      }
    }
    return [...new Map(tutti.map(a => [`${a.articolo_codice}/${a.listino}`, a])).values()];
  }
  const [fornitori, codiciPagamento, listini] = await Promise.all([
    leggi('fornitori', 'id', unici(righe.map(r => fornitoreRigaOrdine(r, articoloPerCodice.get(r.articolo_codice ?? ''))))),
    leggi('codici_pagamento', 'cod', unici([...ordini.map(o => o.condizione_pagamento_cod), ...lead.map(l => l.condizione_pagamento_cod)]), {}, 'cod'),
    leggiAcquisti(),
  ]);
  return ordini.map(o => {
    if (!o.numero) throw new Error("Un ordine non ha un numero: verifica il documento prima di esportare.");
    const l = lead.find(l => l.id === o.lead_id) ?? null;
    const sede = sedi.find(s => s.id === o.store_id) ?? null;
    const rr = [...(righePerOrdine.get(o.id) ?? [])].sort((a, b) =>
      (bloccoPerId.get(a.blocco_id)?.ordine ?? 0) - (bloccoPerId.get(b.blocco_id)?.ordine ?? 0) || a.ordine - b.ordine || a.id.localeCompare(b.id));
    const codici = new Set(rr.map(r => r.articolo_codice));
    const idsFornitore = new Set(rr.map(r => fornitoreRigaOrdine(r, articoloPerCodice.get(r.articolo_codice ?? ''))));
    return { ordine: { ...o, numero: o.numero, tipo: 'ordine' }, righe: rr, articoli: articoli.filter(a => codici.has(a.codice)),
      listiniAcquisto: listini.filter(a => codici.has(a.articolo_codice) && a.listino === listinoAcquistoSede(sede)),
      fornitori: fornitori.filter(f => idsFornitore.has(f.id)), cliente: clienti.find(c => c.id === o.cliente_id) ?? null,
      lead: l, sede, sedeLead: sedi.find(s => s.id === l?.store_id) ?? null,
      deposito: depositi.find(d => d.store_id === o.store_id) ?? null, codiciPagamento,
      preventivoOrigine: origini.find(p => p.id === o.preventivo_origine_id) ?? null };
  });
}