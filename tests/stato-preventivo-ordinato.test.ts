import { expect, test } from 'bun:test';
import { STATI, statiManualiPreventivo, puoCambiareStatoPreventivo } from '../src/lib/preventivi-api';
import { statoEvasionePreventivo, motivoTrasformazioneDisabilitata } from '../src/lib/evasione';

test('ordinato appartiene agli stati dell’elenco ma non agli stati manuali', () => {
  expect(STATI).toContain('ordinato');
  for (const stato of ['bozza', 'inviato', 'confermato'] as const) {
    expect(statiManualiPreventivo(stato)).toEqual(['bozza', 'inviato', 'confermato']);
    expect(puoCambiareStatoPreventivo(stato, 'ordinato')).toBe(false);
  }
});
test('da ordinato nessun cambio di stato manuale', () => {
  expect(statiManualiPreventivo('ordinato')).toEqual(['ordinato']);
  for (const prossimo of STATI) expect(puoCambiareStatoPreventivo('ordinato', prossimo)).toBe(false);
  expect(puoCambiareStatoPreventivo('confermato', 'bozza')).toBe(true);
});
test('preventivo ordinato parziale conserva il residuo trasformabile e la chiusura lo blocca', () => {
  const righe = [{ tipo_riga: 'manuale', quantita: 10, qta_ordinata: 4 }];
  expect(motivoTrasformazioneDisabilitata(statoEvasionePreventivo({ righe, chiuso_at: null }))).toBeNull();
  expect(statoEvasionePreventivo({ righe, chiuso_at: '2026-11-21T18:26:00Z' }).stato).toBe('chiuso');
});