import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { codiceArticoloNuovo, LIMITI_GAMMA, validazioneManualeGamma } from '../src/lib/esportazione-gamma';
import { rigaInUnita, importoRiga } from '../src/lib/riga-preventivo';
import { evasioneRigaInUnita, quantitaOrdineUm1 } from '../src/lib/evasione';
import { calcolaKitRegole } from '../src/lib/kit-regole';
import { parseNumeroIt } from '../src/lib/numero-it';

test('Gamma: codice nuovo concatenato maiuscolo, senza alcuno spazio', () => {
  expect(codiceArticoloNuovo(' ab c ', ' d 12\t3\n')).toBe('ABCD123');
});
test('Gamma: codice assente se manca marca o codice fornitore', () => {
  expect(codiceArticoloNuovo(null, 'A')).toBeNull();
  expect(codiceArticoloNuovo('A', undefined)).toBeNull();
  expect(codiceArticoloNuovo(' \t', 'A')).toBeNull();
  expect(codiceArticoloNuovo('A', ' ')).toBeNull();
});
test('Gamma: limite codice 25 senza troncamento silenzioso', () => {
  expect(LIMITI_GAMMA.codiceArticolo).toBe(25);
  expect(codiceArticoloNuovo('AB', 'x'.repeat(23))).toBe('AB' + 'X'.repeat(23));
  expect(codiceArticoloNuovo('AB', 'x'.repeat(24))?.length).toBe(26);
});
test('Gamma: descrizione fino a 70, 71 rifiutata e descrizione obbligatoria', () => {
  expect(LIMITI_GAMMA.descrizione).toBe(70);
  expect(validazioneManualeGamma('x'.repeat(70), '', null, false).descrizioneValida).toBe(true);
  expect(validazioneManualeGamma('x'.repeat(71), '', null, false).descrizioneValida).toBe(false);
  expect(validazioneManualeGamma(' ', '', null, false).descrizioneValida).toBe(false);
});
test('Gamma: UM2 richiede fattore positivo, virgola italiana e quattro decimali', () => {
  expect(validazioneManualeGamma('Articolo', '', null, false).fattoreValido).toBe(true);
  expect(validazioneManualeGamma('Articolo', 'NR', null, false).fattoreValido).toBe(false);
  for (const n of [0, -1, NaN, Infinity, 0.12345]) expect(validazioneManualeGamma('Articolo', 'NR', n, true).fattoreValido).toBe(false);
  expect(validazioneManualeGamma('Articolo', 'NR', parseNumeroIt('0,025'), true).fattoreValido).toBe(true);
  expect(validazioneManualeGamma('Articolo', 'NR', parseNumeroIt('1,4400'), true).fattoreValido).toBe(true);
});

for (const [fattore, um, um2, quantita, prezzo, mostrata, prezzoMostrato] of [
  [0.025, 'T.', 'NR', 1, 1000, 40, 25],
  [1.44, 'MQ', 'NR', 14.4, 10, 10, 14.4],
] as const) test(`Riga manuale: UM2 fattore ${fattore}, prezzo/importo e invio UM1`, () => {
  const r = { tipo_riga: 'manuale', um, um2, fattore_conversione: fattore, um_scelta: 'um2', quantita, prezzo_unit: prezzo, costo: quantita * prezzo / 2, qta_ordinata: 0 };
  const u = rigaInUnita(r, null);
  expect(u.um).toBe(um2);
  expect(u.quantita).toBeCloseTo(mostrata, 10);
  expect(u.prezzo_unit).toBeCloseTo(prezzoMostrato, 10);
  expect(importoRiga({ ...r, quantita: u.quantita, prezzo_unit: u.prezzo_unit })).toBe(importoRiga(r));
  const patch = rigaInUnita(r, null, { quantita: mostrata / 2, prezzo_unit: prezzoMostrato }).patchUm1;
  expect(patch.quantita).toBeCloseTo(quantita / 2, 10);
  expect(patch.prezzo_unit).toBeCloseTo(prezzo, 10);
  expect(evasioneRigaInUnita(r).residuo).toBeCloseTo(mostrata, 10);
  expect(quantitaOrdineUm1(r, mostrata)).toBe(quantita);
  expect(quantitaOrdineUm1(r, mostrata / 2)).toBeCloseTo(quantita / 2, 10);
});
test('Gamma: metadati del catalogo hanno precedenza e restano invariati', () => {
  const r = { um: 'MQ', um2: 'ERR', fattore_conversione: 999, quantita: 14.4, prezzo_unit: 10, um_scelta: 'um2' };
  const gamma = { um: 'MQ', um2: 'NR', fattore_conversione: 1.44 };
  expect(rigaInUnita(r, gamma)).toEqual(rigaInUnita({ ...r, um2: null, fattore_conversione: null }, gamma));
  expect(rigaInUnita(r, gamma).quantita).toBe(10);
  expect(rigaInUnita({ ...r, um_scelta: 'um1' }, gamma).quantita).toBe(14.4);
  expect(rigaInUnita({ ...r, articolo_codice: 'GAMMA' }, null).quantita).toBe(14.4);
});
test('Kit: DTO manuale conserva i quattro campi Gamma', () => {
  const dati = { codice_famiglia: '01', codice_sottofamiglia: '02', um2: 'NR', fattore_conversione: 0.025 };
  const [r] = calcolaKitRegole({ componenti: [{ ordine: 1, n_pezzi: 1, ...dati }] });
  expect(r?.articolo).toMatchObject({ tipo: 'manuale', ...dati });
});
test('Duplicazione e alternativa: mappa effettiva copia i quattro campi senza conversione', () => {
  const source = readFileSync('src/lib/preventivi-api.ts', 'utf8');
  const corpo = source.match(/const righeIns = b\.righe\.map\(\(r\) => \(\{([\s\S]*?)\}\)\);/)?.[1];
  if (!corpo) throw new Error('Mappa di copia non trovata');
  const dati = { codice_famiglia: '01', codice_sottofamiglia: '02', um2: 'NR', fattore_conversione: 0.025, quantita: 1 };
  const copia = new Function('r', 'nb', `return ({${corpo}})`)(dati, { id: 'blocco' }) as Record<string, unknown>;
  for (const [campo, valore] of Object.entries(dati)) expect(copia[campo]).toBe(valore);
});