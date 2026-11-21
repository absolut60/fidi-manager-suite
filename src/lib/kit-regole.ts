import type { Database } from '@/integrations/supabase/types';
import { calcIncidenzaFromDriver, type IncidenzaInput } from './incidenza';

type Tabelle = Database['public']['Tables'];
export type CampiRegolaKit = Pick<Tabelle['kit_componenti']['Row'],
  'regola_base' | 'regola_moltiplica' | 'regola_dividi_1' | 'regola_dividi_2' | 'regola_confezione' | 'regola_aggiunta' | 'variante_ruolo'>;
export type CampiArticoloKit = Partial<Pick<Tabelle['kit_componenti']['Row'],
  'articolo_codice' | 'codice_articolo_fornitore' | 'descrizione' | 'um' | 'fornitore_id' | 'marca' | 'costo' | 'listino_fornitore' | 'note'>>;
export type CampiSempliciKit = Pick<Tabelle['kit_componenti']['Row'],
  'n_pezzi' | 'passo' | 'passo_2' | 'consumo' | 'lati' | 'confezione' | 'sfrido' | 'riga_rif' | 'peso_unitario'>;
export const CAMPI_CALCOLO_SEMPLICE = ['n_pezzi', 'passo', 'passo_2', 'consumo', 'lati', 'confezione', 'sfrido', 'riga_rif'] as const;
export function rigaKitSemplice(c: Partial<CampiSempliciKit>): boolean {
  return CAMPI_CALCOLO_SEMPLICE.some(campo => c[campo] != null);
}
export type ComponenteRegoleKit = CampiArticoloKit & Partial<CampiRegolaKit & CampiSempliciKit> & IncidenzaInput & {
  ordine: number;
  incidenza?: number | null;
};
export type ParametroRegoleKit = Pick<Tabelle['kit_parametri']['Row'], 'codice' | 'valore_default'> &
  Partial<Pick<Tabelle['kit_parametri']['Row'], 'tipo' | 'valori_ammessi'>>;
export type VarianteRegoleKit = Pick<Tabelle['kit_varianti']['Row'], 'id' | 'predefinita' | 'imposta_parametri'> & {
  articoli: readonly (CampiArticoloKit & { ruolo: string })[];
};
export interface InputRegoleKit {
  componenti: readonly ComponenteRegoleKit[];
  parametri?: readonly ParametroRegoleKit[];
  varianti?: readonly VarianteRegoleKit[];
  /** ID della variante. Se omesso/null, usa la sola predefinita, se presente. */
  varianteScelta?: string | null;
  valoriParametri?: Readonly<Record<string, number>>;
}
export type ArticoloRisoltoKit = { tipo: 'gamma'; codice: string } | {
  tipo: 'manuale'; codice_articolo_fornitore: string | null; descrizione: string | null;
  um: string | null; fornitore_id: string | null; marca: string | null;
  costo: number | null; listino_fornitore: number | null; note: string | null;
};
export interface RigaRegoleKit {
  ordine: number;
  articolo: ArticoloRisoltoKit | null;
  /** Quantità UM1 per una unità base; null su errore, mai zero di ripiego. */
  quantitaPerUnita: number | null;
  fonte: 'semplice' | 'regola' | 'incidenza' | 'driver';
  pesoPerUnita: number | null;
  errore?: string;
}

// Stessa grammatica dei CHECK FM91; niente eval, espressioni libere o nomi di riga.
const NUMERO = /^[+-]?(?:[0-9]+(?:[.,][0-9]*)?|[.,][0-9]+)$/;
const PARAM = /^PARAM:([A-Z0-9_]+)$/;
const RIGA = /^RIGA:([0-9]+)$/;

/** Confine di salvataggio per le fette successive: vuoto → NULL, virgola → punto. */
export function normalizzaOperandoKit(operando: string | null | undefined): string | null {
  const testo = operando?.trim() ?? '';
  if (!testo) return null;
  if (NUMERO.test(testo)) {
    const normalizzato = testo.replace(',', '.');
    finito(Number(normalizzato));
    return normalizzato;
  }
  if (PARAM.test(testo) || RIGA.test(testo)) return testo;
  throw new Error(`Operando non valido: «${testo}». Usa un numero, PARAM:CODICE o RIGA:numero.`);
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
  const parametri = new Map<string, number>();
  let variante: VarianteRegoleKit | undefined;
  let erroreConfigurazione: string | undefined;
  try {
    const varianti = input.varianti ?? [];
    if (input.varianteScelta != null) {
      variante = varianti.find(v => v.id === input.varianteScelta);
      if (!variante) throw new Error('La variante scelta non esiste nel kit.');
    } else {
      const predefinite = varianti.filter(v => v.predefinita);
      if (predefinite.length > 1) throw new Error('Il kit ha più varianti predefinite.');
      variante = predefinite[0];
    }
    const definizioni = input.parametri ?? [];
    for (const p of definizioni) {
      if (parametri.has(p.codice)) throw new Error(`Parametro duplicato: ${p.codice}.`);
      parametri.set(p.codice, p.valore_default);
    }
    const impostazioni = variante?.imposta_parametri ?? {};
    if (!impostazioni || typeof impostazioni !== 'object' || Array.isArray(impostazioni)) {
      throw new Error('I parametri della variante devono essere un oggetto.');
    }
    for (const [codice, valore] of [...Object.entries(impostazioni), ...Object.entries(input.valoriParametri ?? {})]) {
      if (!parametri.has(codice)) throw new Error(`Parametro sconosciuto: ${codice}.`);
      if (typeof valore !== 'number') throw new Error(`Il parametro ${codice} deve essere numerico.`);
      parametri.set(codice, valore);
    }
    for (const p of definizioni) {
      const valore = parametri.get(p.codice);
      if (valore == null || !Number.isFinite(valore)) throw new Error(`Il parametro ${p.codice} deve essere un numero finito.`);
      if (p.tipo === 'scelta' && !p.valori_ammessi?.includes(valore)) {
        throw new Error(`Valore non ammesso per il parametro ${p.codice}.`);
      }
    }
  } catch (e) {
    erroreConfigurazione = e instanceof Error ? e.message : 'Configurazione del kit non valida.';
  }

  function calcola(ordine: number): RigaRegoleKit {
    if (inCalcolo.get(ordine)) throw new Error(`Riferimento circolare alla riga ${ordine}.`);
    const precedente = risultati.get(ordine);
    if (precedente) return precedente;
    const c = righe.get(ordine);
    if (!c) throw new Error(`La riga ${ordine} non esiste nel kit.`);
    const fonte = rigaKitSemplice(c) ? 'semplice' : c.regola_base?.trim() ? 'regola' : c.incidenza != null ? 'incidenza' : 'driver';
    let articolo: ArticoloRisoltoKit | null = null;
    inCalcolo.set(ordine, true);
    let risultato: RigaRegoleKit;
    try {
      if (erroreConfigurazione && (fonte !== 'semplice' || c.variante_ruolo != null)) throw new Error(erroreConfigurazione);
      if (duplicati.has(ordine)) throw new Error(`Ordine duplicato: ${ordine}.`);
      if (c.variante_ruolo != null) {
        const corrispondenti = variante?.articoli.filter(a => a.ruolo === c.variante_ruolo) ?? [];
        const [scelto] = corrispondenti;
        if (!scelto || (!scelto.articolo_codice?.trim() && !scelto.codice_articolo_fornitore?.trim() && !scelto.descrizione?.trim())) {
          throw new Error(`Articolo mancante per il ruolo «${c.variante_ruolo}» nella variante scelta.`);
        }
        if (corrispondenti.length > 1) throw new Error(`Più articoli per il ruolo «${c.variante_ruolo}» nella variante scelta.`);
        articolo = risolviArticolo(scelto);
      } else articolo = risolviArticolo(c);

      function operando(testo: string | null | undefined, vuoto: number): number {
        const normalizzato = normalizzaOperandoKit(testo);
        if (normalizzato == null) return vuoto;
        const parametro = PARAM.exec(normalizzato)?.[1];
        if (parametro != null) {
          const valore = parametri.get(parametro);
          if (valore == null) throw new Error(`Parametro sconosciuto: ${parametro}.`);
          return finito(valore);
        }
        const riferimento = RIGA.exec(normalizzato)?.[1];
        if (riferimento != null) {
          const dipendenza = calcola(Number(riferimento));
          if (dipendenza.errore || dipendenza.quantitaPerUnita == null) {
            throw new Error(`La riga ${riferimento} contiene un errore: ${dipendenza.errore ?? 'quantità assente'}`);
          }
          return dipendenza.quantitaPerUnita;
        }
        return finito(Number(normalizzato));
      }

      let quantita: number;
      if (fonte === 'semplice') {
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
      } else if (fonte === 'regola') {
        const base = operando(c.regola_base, 0);
        const moltiplica = operando(c.regola_moltiplica, 1);
        const divisori = [operando(c.regola_dividi_1, 1), operando(c.regola_dividi_2, 1), operando(c.regola_confezione, 1)];
        const aggiunta = operando(c.regola_aggiunta, 0);
        if (divisori.some(d => d === 0)) throw new Error('Divisione per zero nella regola.');
        quantita = divisori.reduce((q, d) => finito(q / d), finito(base * moltiplica)) + aggiunta;
      } else if (c.incidenza != null) quantita = c.incidenza;
      else {
        // Riusa il driver storico; nessuna confezione dedotta dai metadati Gamma.
        const driver = calcIncidenzaFromDriver(c);
        if (driver == null) throw new Error('Compila almeno un campo di calcolo (es. N. pezzi o Consumo)');
        quantita = driver;
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