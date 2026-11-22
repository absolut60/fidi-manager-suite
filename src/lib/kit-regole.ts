import type { Database } from '@/integrations/supabase/types';

type Tabelle = Database['public']['Tables'];
export type CampiArticoloKit = Partial<Pick<Tabelle['kit_componenti']['Row'],
  'articolo_codice' | 'codice_articolo_fornitore' | 'descrizione' | 'um' | 'fornitore_id' | 'marca' | 'costo' | 'listino_fornitore' | 'note' | 'codice_famiglia' | 'codice_sottofamiglia' | 'um2' | 'fattore_conversione'>>;
export type CampiSempliciKit = Pick<Tabelle['kit_componenti']['Row'],
  'n_pezzi' | 'passo' | 'passo_2' | 'consumo' | 'lati' | 'confezione' | 'sfrido' | 'riga_rif' | 'peso_unitario'>;
export const CAMPI_CALCOLO_SEMPLICE = ['n_pezzi', 'passo', 'passo_2', 'consumo', 'lati', 'confezione', 'sfrido', 'riga_rif'] as const;
export function rigaKitSemplice(c: Partial<CampiSempliciKit>): boolean {
  return CAMPI_CALCOLO_SEMPLICE.some(campo => c[campo] != null);
}
export type ComponenteRegoleKit = CampiArticoloKit & Partial<CampiSempliciKit> & { ordine: number };
export interface InputRegoleKit { componenti: readonly ComponenteRegoleKit[] }
export type ArticoloRisoltoKit = { tipo: 'gamma'; codice: string } | {
  tipo: 'manuale'; codice_articolo_fornitore: string | null; descrizione: string | null;
  um: string | null; fornitore_id: string | null; marca: string | null;
  costo: number | null; listino_fornitore: number | null; note: string | null;
  codice_famiglia: string | null; codice_sottofamiglia: string | null; um2: string | null; fattore_conversione: number | null;
};
export interface RigaRegoleKit {
  ordine: number;
  articolo: ArticoloRisoltoKit | null;
  /** Quantità UM1 per una unità base; null su errore, mai zero di ripiego. */
  quantitaPerUnita: number | null;
  fonte: 'semplice';
  pesoPerUnita: number | null;
  errore?: string;
}

function finito(n: number): number {
  if (!Number.isFinite(n)) throw new Error('Il calcolo non produce un numero finito.');
  return n;
}

function risolviArticolo(campi: CampiArticoloKit): ArticoloRisoltoKit {
  if (campi.articolo_codice) return { tipo: 'gamma', codice: campi.articolo_codice };
  return {
    tipo: 'manuale', codice_articolo_fornitore: campi.codice_articolo_fornitore ?? null,
    descrizione: campi.descrizione ?? null, um: campi.um ?? null, fornitore_id: campi.fornitore_id ?? null,
    marca: campi.marca ?? null, costo: campi.costo ?? null, listino_fornitore: campi.listino_fornitore ?? null,
    note: campi.note ?? null,
    codice_famiglia: campi.codice_famiglia ?? null, codice_sottofamiglia: campi.codice_sottofamiglia ?? null,
    um2: campi.um2 ?? null, fattore_conversione: campi.fattore_conversione ?? null,
  };
}

/** Motore canonico FM91, browser-safe e puro. Nessun prezzo, query o arrotondamento. */
export function calcolaKitRegole(input: InputRegoleKit): RigaRegoleKit[] {
  const righe = new Map<number, ComponenteRegoleKit>();
  const duplicati = new Set<number>();
  for (const c of input.componenti) {
    if (righe.has(c.ordine)) duplicati.add(c.ordine);
    righe.set(c.ordine, c);
  }
  const risultati = new Map<number, RigaRegoleKit>();
  const inCalcolo = new Map<number, boolean>();
  function calcola(ordine: number): RigaRegoleKit {
    if (inCalcolo.get(ordine)) throw new Error(`Riferimento circolare alla riga ${ordine}.`);
    const precedente = risultati.get(ordine);
    if (precedente) return precedente;
    const c = righe.get(ordine);
    if (!c) throw new Error(`La riga ${ordine} non esiste nel kit.`);
    const fonte = 'semplice';
    let articolo: ArticoloRisoltoKit | null = null;
    inCalcolo.set(ordine, true);
    let risultato: RigaRegoleKit;
    try {
      if (duplicati.has(ordine)) throw new Error(`Ordine duplicato: ${ordine}.`);
      articolo = risolviArticolo(c);
      if (!rigaKitSemplice(c)) throw new Error('Compila almeno un campo di calcolo (es. N. pezzi o Consumo)');
      let quantita: number;
      {
        for (const campo of CAMPI_CALCOLO_SEMPLICE) {
          const valore = c[campo];
          if (valore != null) finito(valore);
        }
        for (const campo of ['n_pezzi', 'consumo', 'lati'] as const) {
          if ((c[campo] ?? 0) < 0) throw new Error('Pezzi, consumo e lati non possono essere negativi.');
        }
        let base = 1;
        if (c.riga_rif != null) {
          if (!Number.isInteger(c.riga_rif) || c.riga_rif < 1) throw new Error('La riga collegata deve avere un ordine intero da 1.');
          const collegata = righe.get(c.riga_rif);
          if (!collegata) throw new Error(`La riga ${c.riga_rif} non esiste nel kit.`);
          const dipendenza = calcola(c.riga_rif);
          if (dipendenza.errore || dipendenza.quantitaPerUnita == null) throw new Error(`La riga ${c.riga_rif} contiene un errore: ${dipendenza.errore ?? 'quantità assente'}`);
          const pezzi = finito(collegata.n_pezzi ?? 1);
          if (pezzi === 0) throw new Error('Divisione per zero: N. pezzi della riga collegata è zero.');
          base = finito(dipendenza.quantitaPerUnita / pezzi);
        }
        const divisori = [c.passo ?? 1, c.passo_2 ?? 1, c.confezione ?? 1];
        if (divisori.some(d => d === 0)) throw new Error('Divisione per zero: passo o confezione è zero.');
        if (divisori.some(d => d < 0)) throw new Error('Passo, passo 2 e confezione devono essere maggiori di zero.');
        quantita = divisori.reduce((q, d) => finito(q / d), finito(base * (c.n_pezzi ?? 1) * (c.consumo ?? 1) * (c.lati ?? 1))) + (c.sfrido ?? 0);
      }
      let pesoPerUnita: number | null = null;
      if (c.peso_unitario != null) {
        if (c.peso_unitario < 0) throw new Error('Il peso unitario non può essere negativo.');
        pesoPerUnita = finito(finito(c.peso_unitario) * finito(quantita));
      }
      risultato = { ordine, articolo, quantitaPerUnita: finito(quantita), fonte, pesoPerUnita };
    } catch (e) {
      risultato = { ordine, articolo, quantitaPerUnita: null, fonte, pesoPerUnita: null,
        errore: `Riga ${ordine}: ${e instanceof Error ? e.message : 'Calcolo non riuscito.'}` };
    } finally {
      inCalcolo.set(ordine, false);
    }
    risultati.set(ordine, risultato);
    return risultato;
  }
  return input.componenti.map(c => calcola(c.ordine));
}

/** Totale dei soli pesi noti; le righe in errore non sono considerate senza peso. */
export function totalePesoKit(componenti: readonly ComponenteRegoleKit[], risultati: readonly RigaRegoleKit[]) {
  return {
    pesoTotale: finito(risultati.reduce((totale, r) => totale + (r.pesoPerUnita ?? 0), 0)),
    righeSenzaPeso: componenti.filter(c => c.peso_unitario == null).length,
    righeConErrore: risultati.filter(r => r.errore != null).length,
  };
}