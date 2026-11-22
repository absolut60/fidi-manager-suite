/**
 * FM91 2c — Fonte unica del formato Excel dei kit. Template, export e import si
 * generano SOLO da COLONNE_KIT_EXCEL: aggiungere un campo ai kit senza aggiornare
 * questo modulo fa fallire tests/kit-excel.test.ts (mappa delle colonne DB).
 * Browser-safe: nessuna query, nessun calcolo duplicato (incidenze da calcolaKitRegole).
 */
import * as XLSX from 'xlsx';
import type { Database } from '@/integrations/supabase/types';
import { calcolaKitRegole, type ComponenteRegoleKit } from './kit-regole';
import { AIUTO_CALCOLA_DALLA_RIGA, numeroCampoKit } from './kit-semplice-ui';
import { tutteLeLinee, type LineaPreventivo } from './linee-preventivo';
import { parseNumeroIt } from './numero-it';

type Tabelle = Database['public']['Tables'];
type CampoKit = 'codice' | 'nome' | 'linea' | 'famiglia' | 'um_base' | 'descrizione_tecnica';
type CampoNumerico = 'n_pezzi' | 'passo' | 'passo_2' | 'consumo' | 'lati' | 'confezione' | 'sfrido' | 'riga_rif' | 'peso_unitario';
type CampoRiga = 'ordine' | 'ruolo' | 'codice_articolo' | 'descrizione' | 'um' | CampoNumerico | 'incidenza' | 'peso_per_um' | 'note';
export interface ColonnaKitExcel {
  intestazione: string;
  campo: CampoKit | CampoRiga;
  livello: 'kit' | 'riga';
  tipo: 'testo' | 'numero' | 'intero';
  obbligatorio: boolean;
  /** Calcolata nel file per controllo: non si importa mai. */
  soloControllo: boolean;
  aiuto: string;
}
const c = (intestazione: string, campo: CampoKit | CampoRiga, livello: 'kit' | 'riga', tipo: ColonnaKitExcel['tipo'], obbligatorio: boolean, aiuto: string, soloControllo = false): ColonnaKitExcel =>
  ({ intestazione, campo, livello, tipo, obbligatorio, soloControllo, aiuto });

export const COLONNE_KIT_EXCEL: readonly ColonnaKitExcel[] = [
  c('CODICE_KIT', 'codice', 'kit', 'testo', true, 'Codice univoco del kit. Se esiste già, il kit viene aggiornato e tutte le sue righe sostituite.'),
  c('NOME_KIT', 'nome', 'kit', 'testo', true, 'Nome del kit, uguale su tutte le righe del kit.'),
  c('LINEA', 'linea', 'kit', 'testo', true, 'Sistema MADE, Showroom, Edilizia o Fotovoltaico (vedi foglio VALORI).'),
  c('FAMIGLIA', 'famiglia', 'kit', 'testo', true, 'Codice o nome di una famiglia della linea (vedi foglio VALORI).'),
  c('UM_BASE', 'um_base', 'kit', 'testo', true, 'Unità base del kit, es. mq. Uguale su tutte le righe del kit.'),
  c('DESCRIZIONE_KIT', 'descrizione_tecnica', 'kit', 'testo', false, 'Descrizione tecnica del kit.'),
  c('ORDINE', 'ordine', 'riga', 'intero', true, 'Numero della riga nel kit: intero da 1, unico nel kit.'),
  c('CATEGORIA', 'ruolo', 'riga', 'testo', false, 'Sottocategoria della riga, es. LASTRE, GUIDE, MONTANTI.'),
  c('CODICE_ARTICOLO', 'codice_articolo', 'riga', 'testo', true, 'Codice Gamma. Se non è in Gamma, è il codice del fornitore di un articolo manuale.'),
  c('DESCRIZIONE_ARTICOLO', 'descrizione', 'riga', 'testo', false, 'Obbligatoria per gli articoli manuali. Per gli articoli Gamma vale la descrizione Gamma.'),
  c('UM', 'um', 'riga', 'testo', false, 'Unità Gamma dell’articolo (nell’export). Consigliata per gli articoli manuali.'),
  c('N_PEZZI', 'n_pezzi', 'riga', 'numero', false, 'Numero di pezzi per una unità base. Vuoto = 1.'),
  c('PASSO', 'passo', 'riga', 'numero', false, 'Passo in metri, maggiore di zero. Vuoto = 1.'),
  c('PASSO_2', 'passo_2', 'riga', 'numero', false, 'Secondo passo in metri, maggiore di zero. Vuoto = 1.'),
  c('CONSUMO', 'consumo', 'riga', 'numero', false, 'Consumo per unità base. Vuoto = 1.'),
  c('LATI', 'lati', 'riga', 'numero', false, 'Numero di lati. Vuoto = 1.'),
  c('CONFEZIONE', 'confezione', 'riga', 'numero', false, 'Divide solo se in Gamma l’unità è la confezione (CO da 1000, sacco da 10 kg, rotolo da 90 ml). Vuoto = 1.'),
  c('SFRIDO', 'sfrido', 'riga', 'numero', false, 'Quantità aggiunta dopo il calcolo. Vuoto = 0.'),
  c('CALCOLA_DALLA_RIGA', 'riga_rif', 'riga', 'intero', false, `ORDINE di un'altra riga dello stesso kit. ${AIUTO_CALCOLA_DALLA_RIGA}`),
  c('INCIDENZA', 'incidenza', 'riga', 'numero', false, 'Solo controllo: quantità per unità base calcolata dalla formula. Non si importa.', true),
  c('PESO_UNITARIO', 'peso_unitario', 'riga', 'numero', false, 'Peso in kg per unità Gamma.'),
  c('PESO_PER_UM', 'peso_per_um', 'riga', 'numero', false, 'Solo controllo: INCIDENZA × PESO_UNITARIO. Non si importa.', true),
  c('NOTE', 'note', 'riga', 'testo', false, 'Note libere della riga.'),
];

/**
 * Guardia di allineamento: ogni colonna del database dei kit è nel formato oppure
 * esclusa con il motivo. Le chiavi devono coincidere con types.ts (test e typecheck).
 */
export const MAPPA_DB_KIT: Record<keyof Tabelle['kit']['Row'], string> = {
  id: 'escluso: identificativo tecnico', codice: 'CODICE_KIT', nome: 'NOME_KIT', linea: 'LINEA', famiglia_id: 'FAMIGLIA', um_base: 'UM_BASE', descrizione_tecnica: 'DESCRIZIONE_KIT',
  specifiche: 'escluso: specifiche della scheda, conservate in aggiornamento', created_at: 'escluso: tecnico', updated_at: 'escluso: tecnico',
};
export const MAPPA_DB_KIT_COMPONENTI: Record<keyof Tabelle['kit_componenti']['Row'], string> = {
  id: 'escluso: tecnico', kit_id: 'escluso: tecnico', created_at: 'escluso: tecnico', updated_at: 'escluso: tecnico',
  ordine: 'ORDINE', ruolo: 'CATEGORIA', articolo_codice: 'CODICE_ARTICOLO', codice_articolo_fornitore: 'CODICE_ARTICOLO',
  descrizione: 'DESCRIZIONE_ARTICOLO', um: 'UM', n_pezzi: 'N_PEZZI', passo: 'PASSO', passo_2: 'PASSO_2', consumo: 'CONSUMO', lati: 'LATI',
  confezione: 'CONFEZIONE', sfrido: 'SFRIDO', riga_rif: 'CALCOLA_DALLA_RIGA', peso_unitario: 'PESO_UNITARIO', note: 'NOTE',
  fornitore_id: 'escluso: articolo manuale, conservato dalla riga precedente con stesso ordine e codice',
  marca: 'escluso: articolo manuale, conservato', costo: 'escluso: articolo manuale, conservato', listino_fornitore: 'escluso: articolo manuale, conservato',
  codice_famiglia: 'escluso: articolo manuale, conservato', codice_sottofamiglia: 'escluso: articolo manuale, conservato',
  um2: 'escluso: articolo manuale, conservato', fattore_conversione: 'escluso: articolo manuale, conservato',
};

export const FOGLIO_KIT = 'KIT';
const CAMPI_NUMERICI: readonly CampoNumerico[] = ['n_pezzi', 'passo', 'passo_2', 'consumo', 'lati', 'confezione', 'sfrido', 'riga_rif', 'peso_unitario'];
export const TOLLERANZA_INCIDENZA = 0.000001;

export interface RigaKitExcel {
  ordine: number; ruolo: string | null; codice_articolo: string; descrizione: string | null; um: string | null;
  n_pezzi: number | null; passo: number | null; passo_2: number | null; consumo: number | null; lati: number | null;
  confezione: number | null; sfrido: number | null; riga_rif: number | null; peso_unitario: number | null; note: string | null;
}
/** Dato logico di un kit nel file: LINEA come etichetta, FAMIGLIA come codice. */
export interface KitExcel { codice: string; nome: string; linea: string; famiglia: string; um_base: string; descrizione_tecnica: string | null; righe: RigaKitExcel[] }
/** Riga salvata da public.importa_kit_excel; Gamma senza descrizione/UM propri. */
export interface RigaPayloadKit extends Omit<RigaKitExcel, 'codice_articolo'> { articolo_codice: string | null; codice_articolo_fornitore: string | null }
export interface PayloadKitImport { codice: string; nome: string; linea: LineaPreventivo; famiglia_id: string; um_base: string; descrizione_tecnica: string | null; righe: RigaPayloadKit[] }
export interface FamigliaExcel { id: string; linea: LineaPreventivo; codice: string; nome: string; attiva: boolean }

// ——— Normalizzazione ———
export function normalizzaIntestazione(testo: unknown): string {
  return String(testo ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\*/g, '').trim().toUpperCase().replace(/[\s\-.]+/g, '_');
}
const chiave = (s: string) => normalizzaIntestazione(s).replace(/_/g, '');
export function lineaDaEtichetta(testo: string): LineaPreventivo | null {
  const k = chiave(testo);
  return tutteLeLinee().find(l => chiave(l.etichetta) === k || chiave(l.codice) === k)?.codice ?? null;
}
export function etichettaLineaExcel(linea: LineaPreventivo): string {
  return tutteLeLinee().find(l => l.codice === linea)?.etichetta ?? linea;
}

// ——— Export / template ———
export interface KitPerExcel {
  codice: string; nome: string; linea: LineaPreventivo; famiglia_id: string | null; um_base: string; descrizione_tecnica: string | null;
  componenti: readonly (Pick<Tabelle['kit_componenti']['Row'], 'ordine' | 'ruolo' | 'articolo_codice' | 'codice_articolo_fornitore' | 'descrizione' | 'um' | 'note' | CampoNumerico> & {
    articolo: { descrizione: string | null; um: string | null } | null })[];
}
export function kitExcelDaKit(kit: KitPerExcel, famiglie: readonly FamigliaExcel[]): KitExcel {
  return {
    codice: kit.codice, nome: kit.nome, linea: etichettaLineaExcel(kit.linea), um_base: kit.um_base, descrizione_tecnica: kit.descrizione_tecnica,
    famiglia: famiglie.find(f => f.id === kit.famiglia_id)?.codice ?? '',
    righe: [...kit.componenti].sort((a, b) => a.ordine - b.ordine).map(r => ({
      ordine: r.ordine, ruolo: r.ruolo, codice_articolo: r.articolo_codice ?? r.codice_articolo_fornitore ?? '',
      descrizione: r.articolo_codice ? r.articolo?.descrizione ?? null : r.descrizione,
      um: r.articolo_codice ? r.articolo?.um ?? null : r.um, note: r.note,
      ...Object.fromEntries(CAMPI_NUMERICI.map(campo => [campo, r[campo]])) as Pick<RigaKitExcel, CampoNumerico>,
    })),
  };
}
/** Stessi dati che l'import salverebbe: base del confronto export → import. */
export function payloadDaKit(kit: KitPerExcel): Omit<PayloadKitImport, 'famiglia_id'> & { famiglia_id: string | null } {
  return {
    codice: kit.codice, nome: kit.nome, linea: kit.linea, famiglia_id: kit.famiglia_id, um_base: kit.um_base, descrizione_tecnica: kit.descrizione_tecnica,
    righe: [...kit.componenti].sort((a, b) => a.ordine - b.ordine).map(r => ({
      ordine: r.ordine, ruolo: r.ruolo, articolo_codice: r.articolo_codice, codice_articolo_fornitore: r.articolo_codice ? null : r.codice_articolo_fornitore,
      descrizione: r.articolo_codice ? null : r.descrizione, um: r.articolo_codice ? null : r.um, note: r.note,
      ...Object.fromEntries(CAMPI_NUMERICI.map(campo => [campo, r[campo]])) as Pick<RigaKitExcel, CampoNumerico>,
    })),
  };
}

function lettera(indice: number): string { return XLSX.utils.encode_col(indice); }
const indice = (campo: CampoKit | CampoRiga) => COLONNE_KIT_EXCEL.findIndex(col => col.campo === campo);

/**
 * Formula di controllo, replica di calcolaKitRegole (metodo semplice). La riga collegata
 * si trova per CODICE_KIT + ORDINE e si legge con INDIRECT, così non nasce un riferimento
 * circolare strutturale tra le celle INCIDENZA.
 */
export function formulaIncidenza(riga: number, ultima: number): string {
  const L = (campo: CampoKit | CampoRiga) => lettera(indice(campo));
  const [K, O, NP, INC, CR] = [L('codice'), L('ordine'), L('n_pezzi'), L('incidenza'), L('riga_rif')];
  const uno = (campo: CampoRiga) => `IF(${L(campo)}${riga}="",1,${L(campo)}${riga})`;
  const rigaRif = `SUMPRODUCT(($${K}$2:$${K}$${ultima}=$${K}${riga})*($${O}$2:$${O}$${ultima}=$${CR}${riga})*ROW($${O}$2:$${O}$${ultima}))`;
  const pezzi = `IF(INDIRECT("${NP}"&${rigaRif})="",1,INDIRECT("${NP}"&${rigaRif}))`;
  const base = `IF(${CR}${riga}="",1,INDIRECT("${INC}"&${rigaRif})/${pezzi})`;
  return `${base}*${uno('n_pezzi')}*${uno('consumo')}*${uno('lati')}/${uno('passo')}/${uno('passo_2')}/${uno('confezione')}+IF(${L('sfrido')}${riga}="",0,${L('sfrido')}${riga})`;
}

function componentiMotore(righe: readonly Pick<RigaKitExcel, 'ordine' | CampoNumerico>[]): ComponenteRegoleKit[] {
  return righe.map(r => ({ ordine: r.ordine, ...Object.fromEntries(CAMPI_NUMERICI.map(campo => [campo, r[campo]])) }));
}

export function costruisciWorkbookKit(kits: readonly KitExcel[], famiglie: readonly FamigliaExcel[]): XLSX.WorkBook {
  const intestazioni = COLONNE_KIT_EXCEL.map(col => col.intestazione);
  const righe = kits.flatMap(k => {
    const calcolate = calcolaKitRegole({ componenti: componentiMotore(k.righe) });
    return k.righe.map((r, i) => ({ k, r, q: calcolate[i]?.quantitaPerUnita ?? null }));
  });
  const ultima = Math.max(2, righe.length + 1);
  const dati = righe.map(({ k, r }) => COLONNE_KIT_EXCEL.map(col => {
    if (col.soloControllo) return null;
    const valore = col.livello === 'kit' ? k[col.campo as CampoKit] : r[col.campo as Exclude<CampoRiga, 'incidenza' | 'peso_per_um'>];
    return valore ?? null;
  }));
  const ws = XLSX.utils.aoa_to_sheet([intestazioni, ...dati]);
  righe.forEach(({ r, q }, i) => {
    const n = i + 2;
    ws[`${lettera(indice('incidenza'))}${n}`] = { t: 'n', v: q ?? 0, f: formulaIncidenza(n, ultima) };
    ws[`${lettera(indice('peso_per_um'))}${n}`] = { t: 'n', v: q != null && r.peso_unitario != null ? q * r.peso_unitario : 0,
      f: `IF(${lettera(indice('peso_unitario'))}${n}="","",${lettera(indice('incidenza'))}${n}*${lettera(indice('peso_unitario'))}${n})` };
  });
  ws['!cols'] = COLONNE_KIT_EXCEL.map(col => ({ wch: Math.max(10, col.intestazione.length + 2) }));
  const istruzioni = XLSX.utils.aoa_to_sheet([
    ['Colonna', 'Obbligatoria', 'Si importa', 'Spiegazione'],
    ...COLONNE_KIT_EXCEL.map(col => [col.intestazione, col.obbligatorio ? 'Sì' : 'No', col.soloControllo ? 'No, solo controllo' : 'Sì', col.aiuto]),
    [],
    ['Regole generali'],
    ['Una riga per articolo nel foglio KIT. Le colonne da NOME_KIT a DESCRIZIONE_KIT si ripetono su ogni riga dello stesso CODICE_KIT.'],
    ['Quantità per unità base = BASE × N_PEZZI × CONSUMO × LATI ÷ PASSO ÷ PASSO_2 ÷ CONFEZIONE + SFRIDO (vuoti = 1, sfrido vuoto = 0).'],
    ['BASE = 1, oppure con CALCOLA_DALLA_RIGA la quantità della riga indicata divisa per il suo N_PEZZI.'],
    ['Le quantità sono sempre nell’unità Gamma dell’articolo: la CONFEZIONE divide solo se l’unità Gamma è la confezione.'],
    ['Esempi: tasselli dai metri di guida (riga guide, passo 0,5); viti dai metri di montante (riga montanti, passo 0,2, confezione 1000, lati 2).'],
    ['Numeri con la virgola o con il punto. Codici non trovati in Gamma diventano articoli manuali (descrizione obbligatoria).'],
    ['Un kit già presente con lo stesso CODICE_KIT viene aggiornato e TUTTE le sue righe sostituite. I kit non presenti nel file non si toccano.'],
    ['I preventivi già fatti non cambiano.'],
  ]);
  istruzioni['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 110 }];
  const valori = XLSX.utils.aoa_to_sheet([
    ['LINEA', 'FAMIGLIA (codice)', 'FAMIGLIA (nome)'],
    ...tutteLeLinee().flatMap(l => famiglie.filter(f => f.linea === l.codice && f.attiva).map(f => [l.etichetta, f.codice, f.nome])),
  ]);
  valori['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, FOGLIO_KIT);
  XLSX.utils.book_append_sheet(wb, istruzioni, 'ISTRUZIONI');
  XLSX.utils.book_append_sheet(wb, valori, 'VALORI');
  return wb;
}

export const KIT_ESEMPIO_SINTETICO: KitExcel = {
  codice: 'SM-ESEMPIO', nome: 'PARETE DI ESEMPIO', linea: 'Sistema MADE', famiglia: 'PARETE', um_base: 'mq', descrizione_tecnica: 'Esempio: sostituisci con il tuo kit.',
  righe: [
    { ordine: 1, ruolo: 'GUIDE', codice_articolo: 'CODICE-GUIDA', descrizione: 'Guida di esempio', um: 'ML', n_pezzi: 1, passo: null, passo_2: null, consumo: 0.7, lati: null, confezione: null, sfrido: null, riga_rif: null, peso_unitario: null, note: null },
    { ordine: 2, ruolo: 'TASSELLI', codice_articolo: 'CODICE-TASSELLO', descrizione: 'Tassello di esempio', um: 'PZ', n_pezzi: null, passo: 0.5, passo_2: null, consumo: null, lati: null, confezione: null, sfrido: null, riga_rif: 1, peso_unitario: 0.0043, note: 'metri di guida ÷ 0,5' },
  ],
};

// ——— Import ———
export interface RigaLetta { numeroRiga: number; valori: Partial<Record<CampoKit | CampoRiga, unknown>> }
export interface FileKitLetto { righe: RigaLetta[]; erroriFile: string[]; avvisiFile: string[] }

export function leggiWorkbookKit(wb: XLSX.WorkBook): FileKitLetto {
  const nome = wb.SheetNames.find(n => normalizzaIntestazione(n) === FOGLIO_KIT) ?? wb.SheetNames[0];
  const ws = nome ? wb.Sheets[nome] : undefined;
  if (!ws) return { righe: [], erroriFile: ['Il file non contiene fogli.'], avvisiFile: [] };
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
  const testa = aoa.findIndex(r => r.some(v => v != null && String(v).trim() !== ''));
  if (testa < 0) return { righe: [], erroriFile: ['Il foglio KIT è vuoto.'], avvisiFile: [] };
  const intestazioni = (aoa[testa] ?? []).map(normalizzaIntestazione);
  const posizioni = new Map<CampoKit | CampoRiga, number>();
  const erroriFile: string[] = []; const avvisiFile: string[] = [];
  for (const col of COLONNE_KIT_EXCEL) {
    const i = intestazioni.indexOf(normalizzaIntestazione(col.intestazione));
    if (i >= 0) posizioni.set(col.campo, i);
    else if (col.obbligatorio) erroriFile.push(`Manca la colonna obbligatoria ${col.intestazione}.`);
  }
  const note = new Set(COLONNE_KIT_EXCEL.map(col => normalizzaIntestazione(col.intestazione)));
  const ignote = intestazioni.filter(h => h && !note.has(h));
  if (ignote.length) avvisiFile.push(`Colonne non riconosciute e ignorate: ${ignote.join(', ')}.`);
  const righe: RigaLetta[] = [];
  aoa.slice(testa + 1).forEach((r, i) => {
    if (!r.some(v => v != null && String(v).trim() !== '')) return;
    const valori: RigaLetta['valori'] = {};
    for (const [campo, p] of posizioni) valori[campo] = r[p] ?? null;
    righe.push({ numeroRiga: testa + i + 2, valori });
  });
  return { righe, erroriFile, avvisiFile };
}

export interface ContestoImportKit {
  lineeAbilitate: readonly LineaPreventivo[];
  famiglie: readonly FamigliaExcel[];
  /** Codici presenti in articoli_gamma tra quelli del file. */
  codiciGamma: ReadonlySet<string>;
  /** Kit già presenti per codice. */
  esistenti: ReadonlyMap<string, { linea: LineaPreventivo; righe: number }>;
}
export interface AnteprimaKit {
  codice: string; nome: string; stato: 'nuovo' | 'aggiorna'; righeSostituite: number;
  nRighe: number; nManuali: number; avvisi: string[]; errori: string[]; payload: PayloadKitImport | null;
}

const testo = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
function numero(v: unknown): number | null | 'errore' {
  if (v == null || (typeof v === 'string' && v.trim() === '')) return null;
  const n = typeof v === 'number' ? v : parseNumeroIt(String(v));
  return n == null || !Number.isFinite(n) ? 'errore' : n;
}

export function analizzaImportKit(file: FileKitLetto, ctx: ContestoImportKit): AnteprimaKit[] {
  const gruppi = new Map<string, RigaLetta[]>();
  const senzaCodice: number[] = [];
  for (const r of file.righe) {
    const codice = testo(r.valori.codice);
    if (!codice) { senzaCodice.push(r.numeroRiga); continue; }
    gruppi.set(codice, [...(gruppi.get(codice) ?? []), r]);
  }
  const anteprime: AnteprimaKit[] = [];
  if (senzaCodice.length) anteprime.push({ codice: '(senza codice)', nome: '', stato: 'nuovo', righeSostituite: 0, nRighe: senzaCodice.length, nManuali: 0, avvisi: [],
    errori: [`Righe ${senzaCodice.join(', ')}: manca CODICE_KIT.`], payload: null });
  for (const [codice, righe] of gruppi) {
    const errori: string[] = []; const avvisi: string[] = [];
    const primo = righe[0]!.valori;
    for (const campo of ['nome', 'linea', 'famiglia', 'um_base', 'descrizione_tecnica'] as const) {
      const col = COLONNE_KIT_EXCEL.find(c => c.campo === campo)!;
      const valori = new Set(righe.map(r => testo(r.valori[campo]) ?? ''));
      if (valori.size > 1) errori.push(`${col.intestazione} diverso tra le righe del kit: deve essere uguale su tutte.`);
      if (col.obbligatorio && !testo(primo[campo])) errori.push(`${col.intestazione} mancante.`);
    }
    const nome = testo(primo.nome) ?? '';
    const etichetta = testo(primo.linea);
    const linea = etichetta ? lineaDaEtichetta(etichetta) : null;
    if (etichetta && !linea) errori.push(`Linea «${etichetta}» non riconosciuta.`);
    else if (linea && !ctx.lineeAbilitate.includes(linea)) errori.push(`La linea ${etichettaLineaExcel(linea)} non è abilitata sul tuo profilo.`);
    const esistente = ctx.esistenti.get(codice);
    if (esistente && linea && esistente.linea !== linea) errori.push(`Il kit esiste già sulla linea ${etichettaLineaExcel(esistente.linea)}: la linea non si può cambiare.`);
    const famTesto = testo(primo.famiglia);
    const famiglia = linea && famTesto ? ctx.famiglie.find(f => f.linea === linea && f.attiva && (chiave(f.codice) === chiave(famTesto) || chiave(f.nome) === chiave(famTesto))) : undefined;
    if (linea && famTesto && !famiglia) errori.push(`Famiglia «${famTesto}» non trovata per la linea ${etichettaLineaExcel(linea)}.`);

    const payloadRighe: RigaPayloadKit[] = [];
    const ordini = new Set<number>();
    const incidenzeFile = new Map<number, number>();
    let nManuali = 0;
    for (const r of righe) {
      const pre = `Riga ${r.numeroRiga}`;
      const ord = numero(r.valori.ordine);
      if (ord == null || ord === 'errore' || !Number.isInteger(ord) || ord < 1) { errori.push(`${pre}: ORDINE deve essere un numero intero da 1.`); continue; }
      if (ordini.has(ord)) { errori.push(`${pre}: ORDINE ${ord} ripetuto nel kit.`); continue; }
      ordini.add(ord);
      const numeri: Partial<Record<CampoNumerico, number | null>> = {};
      for (const campo of CAMPI_NUMERICI) {
        const col = COLONNE_KIT_EXCEL.find(c => c.campo === campo)!;
        const v = numero(r.valori[campo]);
        if (v === 'errore') { errori.push(`${pre}: ${col.intestazione} non è un numero.`); continue; }
        try { numeri[campo] = numeroCampoKit(campo, v == null ? '' : String(v)); }
        catch (e) { errori.push(`${pre}: ${col.intestazione} — ${e instanceof Error ? e.message : 'valore non valido'}`); }
      }
      const inc = numero(r.valori.incidenza);
      if (typeof inc === 'number') incidenzeFile.set(ord, inc);
      const codArt = testo(r.valori.codice_articolo);
      if (!codArt) { errori.push(`${pre}: CODICE_ARTICOLO mancante.`); continue; }
      const gamma = ctx.codiciGamma.has(codArt);
      const descrizione = testo(r.valori.descrizione); const um = testo(r.valori.um);
      if (!gamma) {
        nManuali++;
        if (!descrizione) errori.push(`${pre}: il codice ${codArt} non è in Gamma, quindi è un articolo manuale e serve DESCRIZIONE_ARTICOLO.`);
        if (!um) avvisi.push(`${pre}: articolo manuale ${codArt} senza UM (consigliata).`);
      }
      payloadRighe.push({
        ordine: ord, ruolo: testo(r.valori.ruolo), note: testo(r.valori.note),
        articolo_codice: gamma ? codArt : null, codice_articolo_fornitore: gamma ? null : codArt,
        descrizione: gamma ? null : descrizione, um: gamma ? null : um,
        ...Object.fromEntries(CAMPI_NUMERICI.map(campo => [campo, numeri[campo] ?? null])) as Pick<RigaKitExcel, CampoNumerico>,
      });
    }
    payloadRighe.sort((a, b) => a.ordine - b.ordine);
    const numeroRiga = new Map(righe.map(r => [numero(r.valori.ordine), r.numeroRiga] as const));
    for (const ris of calcolaKitRegole({ componenti: componentiMotore(payloadRighe) })) {
      const pre = `Riga ${numeroRiga.get(ris.ordine) ?? '?'} (ordine ${ris.ordine})`;
      if (ris.errore) errori.push(`${pre}: ${ris.errore.replace(/^Riga \d+: /, '')}`);
      const nelFile = incidenzeFile.get(ris.ordine);
      if (ris.quantitaPerUnita != null && nelFile != null && Math.abs(nelFile - ris.quantitaPerUnita) > TOLLERANZA_INCIDENZA) {
        avvisi.push(`${pre}: INCIDENZA nel file ${String(nelFile).replace('.', ',')} diversa da quella calcolata ${String(ris.quantitaPerUnita).replace('.', ',')}; vale quella calcolata.`);
      }
    }
    const valido = errori.length === 0 && linea && famiglia;
    anteprime.push({
      codice, nome, stato: esistente ? 'aggiorna' : 'nuovo', righeSostituite: esistente?.righe ?? 0,
      nRighe: righe.length, nManuali, avvisi, errori,
      payload: valido ? { codice, nome, linea, famiglia_id: famiglia.id, um_base: testo(primo.um_base)!, descrizione_tecnica: testo(primo.descrizione_tecnica), righe: payloadRighe } : null,
    });
  }
  return anteprime;
}

/** Codici articolo distinti del file, per la verifica in articoli_gamma. */
export function codiciArticoloFile(file: FileKitLetto): string[] {
  return [...new Set(file.righe.map(r => testo(r.valori.codice_articolo)).filter((x): x is string => !!x))];
}
