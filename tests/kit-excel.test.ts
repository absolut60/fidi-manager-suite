import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import {
  COLONNE_KIT_EXCEL, MAPPA_DB_KIT, MAPPA_DB_KIT_COMPONENTI, FOGLIO_KIT, analizzaImportKit, costruisciWorkbookKit, kitExcelDaKit,
  leggiWorkbookKit, payloadDaKit, normalizzaIntestazione, type ContestoImportKit, KIT_ESEMPIO_SINTETICO,
} from '../src/lib/kit-excel';
import { FAMIGLIE_TEST, KIT_REALE } from './fixtures/kit-sm-par-2l-75-50';

const ctxBase = (extra: Partial<ContestoImportKit> = {}): ContestoImportKit => ({
  lineeAbilitate: ['sistema_made'], famiglie: FAMIGLIE_TEST,
  codiciGamma: new Set(KIT_REALE.componenti.map(c => c.articolo_codice!)),
  esistenti: new Map([[KIT_REALE.codice, { linea: 'sistema_made' as const, righe: 10 }]]), ...extra,
});
const giro = (wb: XLSX.WorkBook) => leggiWorkbookKit(XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' }));
const daAoa = (aoa: unknown[][]) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'kit'); return giro(wb); };

function chiaviRow(tabella: string): string[] {
  const tipi = readFileSync('src/integrations/supabase/types.ts', 'utf8');
  const da = tipi.indexOf(`      ${tabella}: {\n        Row: {`);
  const blocco = tipi.slice(da, tipi.indexOf('        }', tipi.indexOf('Row: {', da)));
  return [...blocco.matchAll(/^ {10}(\w+)\??:/gm)].map(m => m[1]!).sort();
}
test('guardia: ogni colonna DB di kit e kit_componenti è nel formato Excel o esclusa con motivo', () => {
  expect(Object.keys(MAPPA_DB_KIT).sort()).toEqual(chiaviRow('kit'));
  expect(Object.keys(MAPPA_DB_KIT_COMPONENTI).sort()).toEqual(chiaviRow('kit_componenti'));
  const intestazioni = new Set(COLONNE_KIT_EXCEL.map(c => c.intestazione));
  for (const v of [...Object.values(MAPPA_DB_KIT), ...Object.values(MAPPA_DB_KIT_COMPONENTI)]) expect(v.startsWith('escluso:') || intestazioni.has(v)).toBe(true);
});
test('ordine delle colonne come da specifica', () => {
  expect(COLONNE_KIT_EXCEL.map(c => c.intestazione)).toEqual(['CODICE_KIT','NOME_KIT','LINEA','FAMIGLIA','UM_BASE','DESCRIZIONE_KIT','ORDINE','CATEGORIA','CODICE_ARTICOLO','DESCRIZIONE_ARTICOLO','UM','N_PEZZI','PASSO','PASSO_2','CONSUMO','LATI','CONFEZIONE','SFRIDO','CALCOLA_DALLA_RIGA','INCIDENZA','PESO_UNITARIO','PESO_PER_UM','NOTE']);
  expect(COLONNE_KIT_EXCEL.filter(c => c.soloControllo).map(c => c.intestazione)).toEqual(['INCIDENZA', 'PESO_PER_UM']);
});
test('guardia: le intestazioni del template sono quelle lette dall’import', () => {
  const wb = costruisciWorkbookKit([KIT_ESEMPIO_SINTETICO], FAMIGLIE_TEST);
  expect(wb.SheetNames).toEqual([FOGLIO_KIT, 'ISTRUZIONI', 'VALORI']);
  const testa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[FOGLIO_KIT]!, { header: 1 })[0]!;
  expect(testa).toEqual(COLONNE_KIT_EXCEL.map(c => c.intestazione));
  const letto = giro(wb);
  expect(letto.erroriFile).toEqual([]); expect(letto.avvisiFile).toEqual([]);
  expect(Object.keys(letto.righe[0]!.valori).sort()).toEqual(COLONNE_KIT_EXCEL.map(c => c.campo).sort());
  const valori = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.VALORI!, { header: 1 });
  expect(valori).toContainEqual(['Sistema MADE', 'PARETE', 'Parete']);
});
test('kit reale: export → import restituisce gli stessi dati, senza avvisi', () => {
  const letto = giro(costruisciWorkbookKit([kitExcelDaKit(KIT_REALE, FAMIGLIE_TEST)], FAMIGLIE_TEST));
  const [a] = analizzaImportKit(letto, ctxBase());
  expect(a?.errori).toEqual([]); expect(a?.avvisi).toEqual([]);
  expect(a?.stato).toBe('aggiorna'); expect(a?.righeSostituite).toBe(10); expect(a?.nManuali).toBe(0);
  expect(a?.payload).toEqual(payloadDaKit(KIT_REALE) as typeof a.payload);
});
test('export: UM Gamma e formule di controllo INCIDENZA / PESO_PER_UM con valore del motore', () => {
  const ws = costruisciWorkbookKit([kitExcelDaKit(KIT_REALE, FAMIGLIE_TEST)], FAMIGLIE_TEST).Sheets[FOGLIO_KIT]!;
  expect(ws.K9?.v).toBe('CO');
  expect(ws.T8?.f).toContain('INDIRECT("T"&SUMPRODUCT(');
  expect(ws.T8?.v).toBeCloseTo(1.433333333333334, 12);
  expect(ws.T9?.v).toBeCloseTo(0.016916666666666667, 14);
  expect(ws.V2?.f).toBe('IF(U2="","",T2*U2)');
});
const testaMista = ['note', 'Codice Kit', 'nome kit', 'Linéa', 'famiglia', 'um base', 'ordine', 'codice articolo', 'Descrizione Articolo', 'UM', 'consumo', 'n pezzi', 'calcola dalla riga', 'passo', 'incidenza'];
const riga = (o: number, cod: string, extra: Partial<Record<string, unknown>> = {}) => {
  const v: Record<string, unknown> = { 'Codice Kit': 'SM-NEW', 'nome kit': 'Nuovo', 'Linéa': 'sistema made', famiglia: 'Parete', 'um base': 'mq', ordine: o, 'codice articolo': cod, ...extra };
  return testaMista.map(h => v[h] ?? null);
};
test('parsing: intestazioni con spazi/accenti/minuscole, colonne in altro ordine, virgola o punto', () => {
  const letto = daAoa([testaMista, riga(1, 'G1', { consumo: '0,7', 'n pezzi': '1' }), riga(2, 'T1', { passo: '0.5', 'calcola dalla riga': 1 })]);
  expect(letto.erroriFile).toEqual([]);
  const [a] = analizzaImportKit(letto, ctxBase({ codiciGamma: new Set(['G1', 'T1']) }));
  expect(a?.errori).toEqual([]); expect(a?.stato).toBe('nuovo');
  expect(a?.payload?.famiglia_id).toBe('f-parete');
  expect(a?.payload?.righe.map(r => [r.consumo, r.passo, r.riga_rif])).toEqual([[0.7, null, null], [null, 0.5, 1]]);
  expect(normalizzaIntestazione(' Peso per UM* ')).toBe('PESO_PER_UM');
});
test('Gamma contro manuale: codice assente = manuale con descrizione obbligatoria', () => {
  const senza = analizzaImportKit(daAoa([testaMista, riga(1, 'XYZ', { 'n pezzi': 1 })]), ctxBase())[0]!;
  expect(senza.payload).toBeNull();
  expect(senza.errori.join()).toContain('serve DESCRIZIONE_ARTICOLO');
  const con = analizzaImportKit(daAoa([testaMista, riga(1, 'XYZ', { 'n pezzi': 1, 'Descrizione Articolo': 'Profilo speciale', UM: 'ML' }), riga(2, 'G1', { 'n pezzi': 1, 'Descrizione Articolo': 'ignorata' })]), ctxBase({ codiciGamma: new Set(['G1']) }))[0]!;
  expect(con.nManuali).toBe(1);
  expect(con.payload?.righe[0]).toMatchObject({ articolo_codice: null, codice_articolo_fornitore: 'XYZ', descrizione: 'Profilo speciale', um: 'ML' });
  expect(con.payload?.righe[1]).toMatchObject({ articolo_codice: 'G1', codice_articolo_fornitore: null, descrizione: null, um: null });
});
test('riga collegata inesistente e ciclo escludono il kit', () => {
  const g = ctxBase({ codiciGamma: new Set(['G1', 'G2']) });
  const inesistente = analizzaImportKit(daAoa([testaMista, riga(1, 'G1', { 'calcola dalla riga': 9 })]), g)[0]!;
  expect(inesistente.payload).toBeNull(); expect(inesistente.errori.join()).toContain('La riga 9 non esiste nel kit');
  const ciclo = analizzaImportKit(daAoa([testaMista, riga(1, 'G1', { 'calcola dalla riga': 2 }), riga(2, 'G2', { 'calcola dalla riga': 1 })]), g)[0]!;
  expect(ciclo.payload).toBeNull(); expect(ciclo.errori.join()).toContain('circolare');
});
test('validazioni: ordine ripetuto, numeri fuori vincolo, campi kit incoerenti', () => {
  const g = ctxBase({ codiciGamma: new Set(['G1']) });
  const a = analizzaImportKit(daAoa([testaMista, riga(1, 'G1', { passo: '0' }), riga(1, 'G1', { 'n pezzi': 1, 'um base': 'ml' }), riga(2.5, 'G1')]), g)[0]!;
  const e = a.errori.join(' | ');
  expect(e).toContain('ORDINE 1 ripetuto'); expect(e).toContain('maggiore di zero'); expect(e).toContain('UM_BASE diverso'); expect(e).toContain('ORDINE deve essere un numero intero');
  expect(a.payload).toBeNull();
});
test('avviso se INCIDENZA nel file differisce di oltre 0,000001, senza bloccare', () => {
  const a = analizzaImportKit(daAoa([testaMista, riga(1, 'G1', { consumo: 0.7, incidenza: 0.7000005 }), riga(2, 'G1', { consumo: 0.7, incidenza: 0.71 })]), ctxBase({ codiciGamma: new Set(['G1']) }))[0]!;
  expect(a.errori).toEqual([]); expect(a.avvisi).toHaveLength(1); expect(a.avvisi[0]).toContain('ordine 2'); expect(a.payload).not.toBeNull();
});
test('permessi per linea: linea non abilitata o diversa dal kit esistente esclude il kit', () => {
  const r = analizzaImportKit(daAoa([testaMista, riga(1, 'G1', { consumo: 1 })]), ctxBase({ lineeAbilitate: ['showroom'], codiciGamma: new Set(['G1']) }))[0]!;
  expect(r.errori.join()).toContain('non è abilitata'); expect(r.payload).toBeNull();
  const sr = analizzaImportKit(daAoa([testaMista, riga(1, 'G1', { consumo: 1, 'Linéa': 'Showroom', famiglia: 'BAGNO' })]),
    ctxBase({ lineeAbilitate: ['sistema_made', 'showroom'], codiciGamma: new Set(['G1']), esistenti: new Map([['SM-NEW', { linea: 'sistema_made' as const, righe: 3 }]]) }))[0]!;
  expect(sr.errori.join()).toContain('la linea non si può cambiare');
});
test('più kit: nuovo, aggiornato ed escluso convivono; kit non nel file non compaiono', () => {
  const reale = XLSX.utils.sheet_to_json<unknown[]>(costruisciWorkbookKit([kitExcelDaKit(KIT_REALE, FAMIGLIE_TEST)], FAMIGLIE_TEST).Sheets[FOGLIO_KIT]!, { header: 1, raw: true });
  const extra = COLONNE_KIT_EXCEL.map(c => ({ CODICE_KIT: 'SM-X', NOME_KIT: 'X', LINEA: 'Sistema MADE', FAMIGLIA: 'ALTRO', UM_BASE: 'mq', ORDINE: 1, CODICE_ARTICOLO: 'FAS351E1', N_PEZZI: 1 } as Record<string, unknown>)[c.intestazione] ?? null);
  const rotto = COLONNE_KIT_EXCEL.map(c => ({ CODICE_KIT: 'SM-ROTTO', NOME_KIT: 'R', LINEA: 'Sistema MADE', FAMIGLIA: 'INESISTENTE', UM_BASE: 'mq', ORDINE: 1, CODICE_ARTICOLO: 'FAS351E1', N_PEZZI: 1 } as Record<string, unknown>)[c.intestazione] ?? null);
  const ant = analizzaImportKit(daAoa([...reale, extra, rotto]), ctxBase());
  expect(ant.map(a => [a.codice, a.stato, a.payload ? 'valido' : 'escluso'])).toEqual([[KIT_REALE.codice, 'aggiorna', 'valido'], ['SM-X', 'nuovo', 'valido'], ['SM-ROTTO', 'nuovo', 'escluso']]);
  expect(ant[2]?.errori.join()).toContain('Famiglia «INESISTENTE» non trovata');
});
test('colonna obbligatoria mancante blocca il file', () => {
  expect(daAoa([['CODICE_KIT', 'NOME_KIT']]).erroriFile.join()).toContain('Manca la colonna obbligatoria LINEA');
});
