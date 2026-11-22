import type { Database } from '@/integrations/supabase/types';
import { isRigaValorizzata, rigaInUnita } from './riga-preventivo';
import { unitaArticolo, inUnita } from './scheda-articolo';
import { lineaPreventivo } from './linee-preventivo';

/** Limiti del tracciato Gamma, condivisi da compilazione ed esportazione. */
export const LIMITI_GAMMA = { codiceArticolo: 25, descrizione: 72 } as const;

/** Gemello SQL: auth_puo_esportare_gamma (FM96); aggiungere qui i futuri ruoli e allineare il gemello. */
export const RUOLI_ESPORTAZIONE_GAMMA = ['amministratore', 'responsabile_showroom'] as const;
export function puoEsportareGamma(hasRole: (ruolo: typeof RUOLI_ESPORTAZIONE_GAMMA[number]) => boolean): boolean {
  return RUOLI_ESPORTAZIONE_GAMMA.some(hasRole);
}

/** Fonte unica del blocco a schermo; il database protegge tutte le scritture. */
export function ordineBloccatoGamma(ordine: { tipo?: string | null; esportato_gamma_at?: string | null } | null | undefined): boolean {
  return ordine?.tipo === 'ordine' && !!ordine.esportato_gamma_at;
}

/** Listino d'acquisto usato quando la sede non ha un listino di riferimento (decisione Andrea FM95, provvisoria). */
export const LISTINO_ACQUISTO_RIPIEGO = 20;

/** Fonte unica del listino d'acquisto: quello della sede, altrimenti il ripiego. */
export function listinoAcquistoSede(sede: { listino_riferimento?: number | null } | null | undefined): number {
  return sede?.listino_riferimento ?? LISTINO_ACQUISTO_RIPIEGO;
}

/** Il fornitore scelto sulla riga prevale sul preferenziale del catalogo Gamma. */
export function fornitoreRigaOrdine(
  riga: { fornitore_id?: string | null },
  articolo?: { fornitore_pref_id?: string | null } | null,
): string | null {
  return riga.fornitore_id || articolo?.fornitore_pref_id || null;
}

export function codiceArticoloNuovo(marcaCodice: string | null | undefined, codiceFornitore: string | null | undefined): string | null {
  const marca = marcaCodice?.replace(/\s/g, '').toUpperCase();
  const fornitore = codiceFornitore?.replace(/\s/g, '').toUpperCase();
  return marca && fornitore ? marca + fornitore : null;
}

/** Controlli della finestra manuale; famiglia e lunghezza codice restano avvisi non bloccanti. */
export function validazioneManualeGamma(descrizione: string, um2: string, fattore: number | null, fattoreCompilato: boolean) {
  return {
    descrizioneValida: descrizione.trim().length > 0 && descrizione.length <= LIMITI_GAMMA.descrizione,
    fattoreValido: !um2.trim() && !fattoreCompilato || fattore != null && Number.isFinite(fattore) && fattore > 0
      && Math.abs(fattore * 10000 - Math.round(fattore * 10000)) < 0.000001,
  };
}

export const COLONNE_FILE_GAMMA = [
  'CODICE_DOCUMENTO', 'COD_COD_CLI', 'Ragione_sociale_anagrafica', 'Indirizzo_anagrafica', 'NOTE',
  'IND_CLIFOR', 'TESTATA_RIGHE', 'SEDE', 'DATA_CONSEG', 'Codice_agente', 'Cap_anagrafica',
  'Citta_anagrafica', 'Partita_iva', 'Flag_persona_fisica', 'Telefono_1', 'Cellulare',
  'Indirizzo_email', 'Cognome', 'Nome', 'Codice_fiscale', 'Condizione_pagamento',
  'Descrizione_pagamento', 'Codice_sede', 'Raggruppamento_clienti_1', 'Raggruppamento_clienti_2',
  'Raggruppamento_clienti_3', 'Codice_listino', 'Codice_deposito', 'Codice_macrocategoria',
  'Codice_categoria', 'Codice_destinatario_prevalente', 'COD_ART', 'QTA1', 'PRZ1', 'SCT1', 'SCT2',
  'sct3', 'magg %', 'SCONT_IMP', 'MAGG_Import', 'descrizione', 'Codice_famiglia',
  'Codice_sottofamiglia', 'Marca', 'Unita_misura_1_articolo', 'Unita_misura_2_articolo',
  'Fattore_conversione_articolo',
] as const;
export type ColonnaGamma = typeof COLONNE_FILE_GAMMA[number];
export type ValoreGamma = string | number | Date;
export type RigaFileGamma = Record<ColonnaGamma, ValoreGamma>;

/** Regole provvisorie, centralizzate per la successiva revisione del tracciato. */
export const CARATTERI_CODICE_GAMMA = /^[A-Z0-9./-]+$/i;
export const AVVISI_LEAD_GAMMA = ['nome', 'identificativo_fiscale', 'indirizzo', 'cap', 'citta'] as const;

type Tabelle = Database['public']['Tables'];
type Entita<T extends keyof Tabelle> = Partial<Tabelle[T]['Row']>;
export type RigaOrdineGamma = Entita<'righe_preventivo'> & { id: string };
export interface DatiOrdineGamma {
  ordine: Entita<'preventivi'> & { id: string; numero: string; tipo: 'ordine' };
  righe: RigaOrdineGamma[];
  articoli: Entita<'articoli_gamma'>[];
  listiniAcquisto: Entita<'articoli_gamma_listini'>[];
  fornitori: Entita<'fornitori'>[];
  cliente: Entita<'clienti'> | null;
  lead: Entita<'lead'> | null;
  sede: Entita<'stores'> | null;
  sedeLead: Entita<'stores'> | null;
  deposito: Entita<'depositi'> | null;
  codiciPagamento: Entita<'codici_pagamento'>[];
  preventivoOrigine: Pick<Tabelle['preventivi']['Row'], 'id' | 'numero'> | null;
}
export interface ProblemaEsportazione {
  ordineId: string;
  numeroOrdine: string;
  rigaId?: string;
  livello: 'bloccante' | 'avviso';
  codice: string;
  messaggio: string;
}

const testo = (v: string | number | null | undefined): string => String(v ?? '').trim();
const presente = (v: string | number | null | undefined): boolean => testo(v) !== '';
const numero = (v: number | null | undefined): number | '' => v != null && Number.isFinite(v) ? v : '';
const nonZero = (v: number | null | undefined): number | '' => v ? numero(v) : '';
const prezzo4 = (v: number | null | undefined): number | '' => v == null || !Number.isFinite(v) ? '' : Number(v.toFixed(4));
const vuota = (): RigaFileGamma => Object.fromEntries(COLONNE_FILE_GAMMA.map(c => [c, ''])) as RigaFileGamma;

/** Input già letto sotto RLS. Nessun accesso al DB, nessuna modifica ai dati originali. */
export function costruisciEsportazioneGamma(dati: DatiOrdineGamma[]) {
  const problemi: ProblemaEsportazione[] = [];
  const ordiniEsportati: string[] = [];
  const ordiniBloccati: string[] = [];
  const documentiFornitore: RigaFileGamma[] = [];
  const documentiCliente: RigaFileGamma[] = [];
  const ordinati = [...dati].sort((a, b) => a.ordine.numero.localeCompare(b.ordine.numero, 'it-IT', { numeric: true })
    || a.ordine.id.localeCompare(b.ordine.id));
  for (const d of ordinati) {
    const o = d.ordine;
    const inizioProblemi = problemi.length;
    const problema = (livello: ProblemaEsportazione['livello'], codice: string, messaggio: string, r?: RigaOrdineGamma) => {
      problemi.push({ ordineId: o.id, numeroOrdine: o.numero, livello, codice, messaggio, ...(r ? { rigaId: r.id } : {}) });
    };
    if (!d.sede || !d.deposito || d.deposito.store_id !== d.sede.id || d.deposito.tipo !== 'Centrale' || !d.deposito.attivo)
      problema('bloccante', 'deposito_centrale_assente', "La sede dell'ordine non ha un deposito Centrale attivo.");
    if (o.cliente_id && !presente(d.cliente?.codice_gestionale))
      problema('bloccante', 'cliente_senza_codice', 'Il cliente non ha un codice Gamma.');
    if (!o.cliente_id && !d.lead)
      problema('bloccante', 'destinatario_assente', "Non è possibile leggere il cliente o il lead dell'ordine.");

    const listino = o.listino_rif ?? d.lead?.listino_rif;
    const macro = testo(o.macrocategoria_rif) || testo(d.lead?.macrocategoria_rif);
    const categoria = testo(o.categoria_rif) || testo(d.lead?.categoria_rif);
    if (!o.cliente_id && d.lead) {
      const l = d.lead;
      const mancanti = {
        nome: !presente(l.ragione_sociale) && !presente(l.nome) && !presente(l.cognome),
        identificativo_fiscale: !presente(l.partita_iva) && !presente(l.codice_fiscale),
        indirizzo: !presente(l.indirizzo), cap: !presente(l.cap), citta: !presente(l.citta),
      };
      const messaggi = { nome: 'Il lead non ha un nome o una ragione sociale.', identificativo_fiscale: 'Il lead non ha partita IVA né codice fiscale.',
        indirizzo: "Manca l'indirizzo del lead.", cap: 'Manca il CAP del lead.', citta: 'Manca la città del lead.' };
      for (const campo of AVVISI_LEAD_GAMMA) if (mancanti[campo]) problema('avviso', `lead_senza_${campo}`, messaggi[campo]);
      for (const [campo, valore] of [['listino', listino], ['macrocategoria', macro], ['categoria', categoria]] as const)
        if (!presente(valore)) problema('avviso', `lead_senza_${campo}`, `Manca ${campo === 'listino' ? 'il listino' : `la ${campo}`} per il nuovo cliente.`);
    }

    const articoli = new Map(d.articoli.map(a => [a.codice, a]));
    const fornitori = new Map(d.fornitori.map(f => [f.id, f]));
    const acquisti = new Map(d.listiniAcquisto.filter(l => l.listino === listinoAcquistoSede(d.sede)).map(l => [l.articolo_codice, l]));
    const gruppi = new Map<string, RigaFileGamma[]>();
    const righeCliente: RigaFileGamma[] = [];
    const esportabili = d.righe.filter(isRigaValorizzata).filter(r => {
      if (r.quantita == null || r.quantita === 0) {
        problema('avviso', 'quantita_zero', 'Riga esclusa perché la quantità è vuota o zero.', r); return false;
      }
      return true;
    });
    if (esportabili.some(r => presente(r.articolo_codice)) && d.sede?.listino_riferimento == null)
      problema('avviso', 'listino_ripiego', `La sede non ha un listino di riferimento: per i prezzi d'acquisto è stato usato il listino ${LISTINO_ACQUISTO_RIPIEGO}.`);

    for (const r of esportabili) {
      const gamma = presente(r.articolo_codice);
      const a = gamma ? articoli.get(r.articolo_codice ?? undefined) : undefined;
      if (gamma && !a) problema('bloccante', 'articolo_non_leggibile', "L'articolo Gamma della riga non è disponibile nel catalogo.", r);
      const fid = fornitoreRigaOrdine(r, a);
      const f = fid ? fornitori.get(fid) : undefined;
      if (!fid) problema('bloccante', 'fornitore_assente', "Scegli il fornitore della riga prima di esportare l'ordine.", r);
      else if (!presente(f?.codice_gestionale)) problema('bloccante', 'fornitore_senza_codice', 'Il fornitore della riga non ha un codice Gamma.', r);
      const codice = gamma ? testo(r.articolo_codice) : codiceArticoloNuovo(r.marca, r.codice_articolo_fornitore) ?? '';
      const descrizione = r.descrizione ?? '';
      if (!gamma) {
        for (const [campo, valore, etichetta] of [
          ['marca', r.marca, 'la marca'], ['codice_fornitore', r.codice_articolo_fornitore, 'il codice articolo del fornitore'],
          ['um', r.um, "l'unità di misura"], ['famiglia', r.codice_famiglia, 'la famiglia'], ['costo', r.costo, "il costo d'acquisto"],
        ] as const) if (!presente(valore)) problema('bloccante', `manuale_senza_${campo}`, `Completa ${etichetta} della riga manuale.`, r);
        if (codice.length > LIMITI_GAMMA.codiceArticolo) problema('bloccante', 'codice_troppo_lungo', `Il codice del nuovo articolo supera ${LIMITI_GAMMA.codiceArticolo} caratteri.`, r);
        if (descrizione.length > LIMITI_GAMMA.descrizione) problema('bloccante', 'descrizione_troppo_lunga', `La descrizione della riga manuale supera ${LIMITI_GAMMA.descrizione} caratteri.`, r);
      } else if (descrizione.length > LIMITI_GAMMA.descrizione)
        problema('avviso', 'descrizione_troncata', `La descrizione Gamma viene accorciata a ${LIMITI_GAMMA.descrizione} caratteri nel file.`, r);
      if (codice && !CARATTERI_CODICE_GAMMA.test(codice)) problema('avviso', 'caratteri_codice', 'Il codice articolo contiene caratteri da verificare in Gamma.', r);
      const scontiGamma = r.sconti_gamma ?? [];
      const sconti = Array.from({ length: 3 }, (_, i) => scontiGamma[i] ?? 0);
      const inserisciSconto = (s: number) => {
        const libero = sconti.findIndex(v => v === 0);
        if (libero >= 0) sconti[libero] = s;
      };
      // Gli slot Gamma presenti restano al loro posto; eventuali slot successivi occupano i vuoti.
      for (const s of scontiGamma.slice(3).filter(s => s !== 0)) inserisciSconto(s);
      if (r.sconto_perc) inserisciSconto(r.sconto_perc);
      if (scontiGamma.filter(s => s !== 0).length + (r.sconto_perc ? 1 : 0) > 3)
        problema('bloccante', 'troppi_sconti', 'La riga ha più di 3 sconti: riducili prima di esportare.', r);
      const unita = unitaArticolo({ um: (gamma ? a?.um : r.um) ?? null, um2: (gamma ? a?.um2 : r.um2) ?? null,
        fattore_conversione: (gamma ? a?.fattore_conversione : r.fattore_conversione) ?? null });
      if (unita.um2 && !(Number.isFinite(unita.fattore) && unita.fattore > 0))
        problema('bloccante', 'fattore_non_valido', "L'unità secondaria richiede un fattore di conversione maggiore di zero.", r);
      const base = vuota();
      Object.assign(base, { TESTATA_RIGHE: 'R', COD_ART: codice, QTA1: inUnita(r.quantita, 'quantita', 'primaria', unita.fattore) ?? '',
        descrizione: descrizione.slice(0, LIMITI_GAMMA.descrizione),
        Codice_famiglia: testo(gamma ? a?.codice_famiglia : r.codice_famiglia),
        Codice_sottofamiglia: testo(gamma ? a?.codice_sottofamiglia : r.codice_sottofamiglia),
        Marca: testo(gamma ? a?.marca_codice : r.marca), Unita_misura_1_articolo: unita.um1 ?? '',
        Unita_misura_2_articolo: unita.um2 ?? unita.um1 ?? '', Fattore_conversione_articolo: unita.um2 ? unita.fattore : 1 });
      const acquisto = gamma ? acquisti.get(r.articolo_codice ?? undefined) : undefined;
      if (gamma && (!acquisto || acquisto.acq_prezzo == null)) problema('avviso', 'acquisto_assente', "Mancano i dati d'acquisto dell'articolo per il listino della sede: il prezzo fornitore resta vuoto.", r);
      const rf = { ...base, CODICE_DOCUMENTO: 'MD-F-ORDINE', COD_COD_CLI: testo(f?.codice_gestionale), IND_CLIFOR: 1,
        // costo è TOTALIZZATO nel DB: riuso la fonte unica per ottenere il costo unitario UM1.
        PRZ1: prezzo4(gamma ? acquisto?.acq_prezzo : rigaInUnita({ ...r, um_scelta: 'um1', quantita: r.quantita ?? null, prezzo_unit: r.prezzo_unit ?? null }).costo_unit),
        SCT1: gamma ? nonZero(acquisto?.acq_sc1) : '', SCT2: gamma ? nonZero(acquisto?.acq_sc2) : '', sct3: gamma ? nonZero(acquisto?.acq_sc3) : '',
        'magg %': gamma ? nonZero(acquisto?.acq_trasporto_perc) : '', MAGG_Import: gamma ? nonZero(acquisto?.acq_trasporto_euro) : '' };
      if (fid) { const g = gruppi.get(fid) ?? []; g.push(rf); gruppi.set(fid, g); }
      righeCliente.push({ ...base, CODICE_DOCUMENTO: 'MD-C-ORDINE', COD_COD_CLI: o.cliente_id ? testo(d.cliente?.codice_gestionale) : '', IND_CLIFOR: 0,
        PRZ1: prezzo4(inUnita(r.prezzo_unit, 'prezzo', 'primaria', unita.fattore)),
        SCT1: nonZero(sconti[0]), SCT2: nonZero(sconti[1]), sct3: nonZero(sconti[2]), 'magg %': nonZero(r.maggiorazione_perc) });
    }
    // Confronto sul tracciato già pronto in UM1; ogni chiamata riguarda un solo documento.
    const sommaRighe = (righe: RigaFileGamma[], fornitore: boolean): RigaFileGamma[] => {
      const unite: RigaFileGamma[] = [];
      const condizioni = new Map<string, { riga: RigaFileGamma; quantita: number; occorrenze: number }>();
      const articoliDocumento = new Set<ValoreGamma>();
      const avvisati = new Set<ValoreGamma>();
      for (const riga of righe) {
        const chiave = JSON.stringify([riga.COD_ART, riga.PRZ1, riga.SCT1, riga.SCT2, riga.sct3,
          riga['magg %'], ...(fornitore ? [riga.MAGG_Import] : [])]);
        const precedente = condizioni.get(chiave);
        if (precedente) {
          precedente.quantita += Number(riga.QTA1);
          precedente.occorrenze++;
        } else {
          if (articoliDocumento.has(riga.COD_ART) && !avvisati.has(riga.COD_ART)) {
            problema('avviso', 'articolo_ripetuto_condizioni_diverse', "L'articolo compare più volte nell'ordine con prezzi o sconti diversi: righe lasciate separate.");
            avvisati.add(riga.COD_ART);
          }
          const prima = { ...riga };
          condizioni.set(chiave, { riga: prima, quantita: Number(riga.QTA1), occorrenze: 1 });
          articoliDocumento.add(riga.COD_ART);
          unite.push(prima);
        }
      }
      for (const gruppo of condizioni.values()) if (gruppo.occorrenze > 1) gruppo.riga.QTA1 = Number(gruppo.quantita.toFixed(4));
      return unite;
    };
    if (problemi.slice(inizioProblemi).some(p => p.livello === 'bloccante')) { ordiniBloccati.push(o.id); continue; }
    const nota = `${o.numero}${d.preventivoOrigine ? ` da ${d.preventivoOrigine.numero}` : ''} - ${lineaPreventivo(o.linea).etichetta}`;
    const testata = (fornitore: boolean): RigaFileGamma => ({ ...vuota(), CODICE_DOCUMENTO: fornitore ? 'MD-F-ORDINE' : 'MD-C-ORDINE',
      IND_CLIFOR: fornitore ? 1 : 0, TESTATA_RIGHE: 'T', SEDE: testo(d.sede?.codice),
      DATA_CONSEG: o.data_consegna ? new Date(`${o.data_consegna}T00:00:00Z`) : '', Codice_deposito: testo(d.deposito?.codice), NOTE: nota });
    const nomeSoggetto = testo(d.cliente?.ragione_sociale || d.lead?.ragione_sociale || [d.lead?.cognome, d.lead?.nome].filter(Boolean).join(' '));
    for (const [fid, righe] of [...gruppi].sort(([a], [b]) => testo(fornitori.get(a)?.codice_gestionale).localeCompare(testo(fornitori.get(b)?.codice_gestionale), 'it-IT', { numeric: true }))) {
      documentiFornitore.push({ ...testata(true), COD_COD_CLI: testo(fornitori.get(fid)?.codice_gestionale), NOTE: `${nota} - ${nomeSoggetto}` }, ...sommaRighe(righe, true));
    }
    const tc = testata(false);
    if (o.cliente_id) tc.COD_COD_CLI = testo(d.cliente?.codice_gestionale);
    else if (d.lead) {
      const l = d.lead;
      const pagamento = testo(o.condizione_pagamento_cod) || testo(l.condizione_pagamento_cod);
      Object.assign(tc, { Ragione_sociale_anagrafica: testo(l.ragione_sociale), Cognome: testo(l.cognome), Nome: testo(l.nome),
        Indirizzo_anagrafica: testo(l.indirizzo), Cap_anagrafica: testo(l.cap), Citta_anagrafica: testo(l.citta), Partita_iva: testo(l.partita_iva),
        Codice_fiscale: testo(l.codice_fiscale), Flag_persona_fisica: l.tipo_soggetto === 'persona_fisica' ? 1 : 0,
        Telefono_1: testo(l.telefono), Cellulare: testo(l.cellulare), Indirizzo_email: testo(l.email), Codice_agente: testo(l.agente_codice),
        Condizione_pagamento: pagamento, Descrizione_pagamento: testo(d.codiciPagamento.find(p => p.cod === pagamento)?.descrizione),
        Codice_sede: testo(d.sedeLead?.codice) || testo(d.sede?.codice), Codice_listino: listino ?? '',
        Codice_macrocategoria: testo(macro), Codice_categoria: testo(categoria),
        Codice_destinatario_prevalente: testo(l.codice_sdi) || (l.tipo_soggetto === 'persona_fisica' ? '0000000' : '') });
    }
    documentiCliente.push(tc, ...sommaRighe(righeCliente, false));
    ordiniEsportati.push(o.id);
  }
  return { righe: [...documentiFornitore, ...documentiCliente], problemi, ordiniEsportati, ordiniBloccati };
}