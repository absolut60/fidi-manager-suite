import { test, expect } from 'bun:test';
import * as XLSX from 'xlsx';
import { unisciDoppioniScadenziario, parseOfficialScadenziarioSheet,
  chiaveScadenziario, anomaliaDoppioneGamma, type ScadRow } from '../src/lib/scadenziario-parser';

function riga(idx: number, data: string | null, pagato: number): ScadRow {
  return { idx, codice_gestionale: '5333', ragione_sociale: '', payload: {
    key_documento: '1-202200066622', data_scadenza: '2022-05-14',
    key_tipo_effetto: 14, importo_scadenza: -6211.50,
    numero_documento: '382/RA', data_pagamento_effettiva: data, importo_pagato: pagato,
  } };
}

test('data pagamento più recente prevale anche su maggiore importo e ultima riga', () => {
  const risultato = unisciDoppioniScadenziario([
    riga(17817, '2022-05-25', -6211.50), riga(18108, '2022-05-14', -9000),
  ]);
  expect(risultato.rows.map((r) => r.idx)).toEqual([17817]);
});

test('data null è più vecchia di qualsiasi pagamento datato', () => {
  expect(unisciDoppioniScadenziario([
    riga(3, '2022-05-14', 0), riga(4, null, -6211.50),
  ]).rows[0]?.idx).toBe(3);
});

test('a parità di data prevale importo pagato in valore assoluto', () => {
  expect(unisciDoppioniScadenziario([
    riga(3, '2022-05-25', -6211.50), riga(4, '2022-05-25', 100),
  ]).rows[0]?.idx).toBe(3);
});

test('a parità di data e importo assoluto prevale ultima riga Excel', () => {
  expect(unisciDoppioniScadenziario([
    riga(4, null, 6211.50), riga(3, null, -6211.50),
  ]).rows[0]?.idx).toBe(4);
});

test('ogni scarto fa riferimento alla vincitrice definitiva anche con tre versioni', () => {
  const risultato = unisciDoppioniScadenziario([
    riga(3, null, 0), riga(4, '2022-05-14', 100), riga(5, '2022-05-25', -6211.50),
  ]);
  expect(risultato.doppioni.map((d) => [d.riga_scartata, d.riga_tenuta])).toEqual([[3, 5], [4, 5]]);
  const doppione = risultato.doppioni[0];
  if (!doppione) throw new Error('Scarto non registrato');
  const anomalia = anomaliaDoppioneGamma(doppione);
  expect(anomalia.tipo_anomalia).toBe('riga_doppia_gamma');
  expect(JSON.parse(anomalia.valore_attuale)).toEqual({ numero_documento: '382/RA',
    data_scadenza: '2022-05-14', importo_scadenza: -6211.50,
    riga_excel_scartata: 3, riga_excel_tenuta: 5 });
});

test('la chiave distingue tutte le cinque colonne e unisce i null del DB', () => {
  const base = riga(3, null, 0);
  const varianti = ['key_documento', 'data_scadenza', 'key_tipo_effetto', 'importo_scadenza']
    .map((campo) => ({ ...base, payload: { ...base.payload, [campo]: 'diverso' } }));
  expect(new Set([base, { ...base, codice_gestionale: '5448' }, ...varianti].map(chiaveScadenziario)).size).toBe(6);
  expect(chiaveScadenziario({ ...base, payload: {} })).toBe(
    chiaveScadenziario({ ...base, payload: { key_documento: null, data_scadenza: null } }));
});

test('doppioni separati da oltre un chunk: conteggio distinto prima della divisione e righe Excel reali', () => {
  const dati: unknown[][] = [[], ['COD_CLI', 'KeyDocumento', 'Data Scadenza', 'KeyTipoEffetto',
    'Importo Scadenza', 'Data Pagamento Effettiva', 'Importo Pagato']];
  for (let i = 0; i < 1001; i++) dati.push(['5333', `doc-${i}`, '14/05/2022', 14, -6211.50, '', 0]);
  dati.push([]);
  dati.push(['5333', 'doc-0', '14/05/2022', 14, -6211.50, '25/05/2022', -6211.50]);
  const risultato = parseOfficialScadenziarioSheet(XLSX.utils.aoa_to_sheet(dati));
  expect(risultato.totRead).toBe(1002);
  expect(risultato.rows.length).toBe(1001);
  expect(risultato.missing).toEqual([]);
  expect(risultato.doppioni.map((d) => [d.riga_scartata, d.riga_tenuta])).toEqual([[3, 1005]]);
  expect(new Set(risultato.rows.map(chiaveScadenziario)).size).toBe(1001);
});