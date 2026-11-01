import { expect, test } from 'bun:test';
import * as XLSX from 'xlsx';
import { parseOfficialScadenziarioSheet } from '../src/lib/scadenziario-parser';

function parseFile(teorica: number | string) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['COD_CLI', 'KeyDocumento', 'Data Scadenza', 'Importo Scadenza',
      '_KEYTIPOEFFETTO', 'Dilazione Teorica', '_KEYESITO', 'Dilazione Effettiva'],
    ['5737', 'doc-1', '01/11/2026', 100, 14, teorica, 0, 75],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'SCADENZIARIO');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const loaded = XLSX.read(bytes, { type: 'array' });
  const loadedSheet = loaded.Sheets['SCADENZIARIO'];
  if (!loadedSheet) throw new Error('Foglio SCADENZIARIO assente');
  return parseOfficialScadenziarioSheet(loadedSheet);
}

test('intestazione esatta Dilazione Teorica: carica 62 come intero nel payload import', () => {
  const result = parseFile(62);
  expect(result.rows[0]?.payload.dilazione_teorica).toBe(62);
  expect(result.rows[0]?.payload.dilazione_effettiva).toBe(75);
  expect(result.rows[0]?.payload.key_tipo_effetto).toBe(14);
  expect(result.rowErrors).toEqual([]);
});

test('Dilazione Teorica: converte anche il valore testuale 90 in numero', () => {
  const result = parseFile('90');
  expect(result.rows[0]?.payload.dilazione_teorica).toBe(90);
  expect(result.rows[0]?.payload.dilazione_effettiva).toBe(75);
});