import { expect, test } from 'bun:test';
import { fornitoreRigaOrdine } from '../src/lib/esportazione-gamma';
import { etichetteDocumento } from '../src/lib/etichette-documento';

test('Ordine: la scelta del fornitore sulla riga prevale sul preferenziale', () => {
  expect(fornitoreRigaOrdine({ fornitore_id: 'scelto' }, { fornitore_pref_id: 'preferenziale' })).toBe('scelto');
});
test('Ordine: senza scelta usa il fornitore preferenziale Gamma', () => {
  expect(fornitoreRigaOrdine({ fornitore_id: null }, { fornitore_pref_id: 'preferenziale' })).toBe('preferenziale');
  expect(fornitoreRigaOrdine({}, { fornitore_pref_id: 'preferenziale' })).toBe('preferenziale');
});
test('Ordine: nessun fornitore se mancano scelta e preferenziale', () => {
  expect(fornitoreRigaOrdine({}, null)).toBeNull();
  expect(fornitoreRigaOrdine({ fornitore_id: null }, { fornitore_pref_id: null })).toBeNull();
});
test('Tipo ordine: unica nomenclatura con articoli e preposizioni corretti', () => {
  const e = etichetteDocumento('ordine');
  expect(e.nome).toBe('ordine');
  expect(e.titolo).toBe('Ordine');
  expect(e.nuovo).toBe('Nuovo ordine');
  expect(e.testo('Titolo del preventivo')).toBe("Titolo dell'ordine");
  expect(e.testo('Scegli la sede prima di salvare il preventivo.')).toBe("Scegli la sede prima di salvare l'ordine.");
  expect(e.testo('Costo ultimo (usato nel preventivo)')).toBe("Costo ultimo (usato nell'ordine)");
  expect(e.testo('Preventivo {{preventivo.numero}}: {{preventivo.titolo}}')).toBe('Ordine {{preventivo.numero}}: {{preventivo.titolo}}');
});
test('Tipo preventivo: nomenclatura originale invariata', () => {
  const e = etichetteDocumento('preventivo');
  expect(e.nome).toBe('preventivo');
  expect(e.titolo).toBe('Preventivo');
  expect(e.nuovo).toBe('Nuovo preventivo');
  expect(e.testo('Titolo del preventivo')).toBe('Titolo del preventivo');
  expect(e.testo('Scegli la sede prima di salvare il preventivo.')).toBe('Scegli la sede prima di salvare il preventivo.');
});