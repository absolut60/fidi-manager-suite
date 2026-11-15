import { expect, test } from 'bun:test';
import { assegnazioneModificabile, filtroPreventiviPerMe } from '../src/lib/assegnazione-preventivo';

test('FM72 Per me include responsabile oppure copia', () => {
  const id = '30c9d579-76c3-4312-b47e-3f9f4680fc40';
  expect(filtroPreventiviPerMe(id)).toBe(`assegnato_a.eq.${id},assegnati_copia.cs.{${id}}`);
  expect(() => filtroPreventiviPerMe('x,stato.eq.bozza')).toThrow();
});
test('FM72 confermato è in sola lettura anche per chi scrive', () => {
  expect(assegnazioneModificabile({ stato: 'confermato', tipo: 'preventivo' }, ['preventivi_write'])).toBe(false);
});
test('FM72 ordine è in sola lettura anche per amministratore', () => {
  expect(assegnazioneModificabile({ stato: 'bozza', tipo: 'ordine' }, ['amministratore'])).toBe(false);
});
test('FM72 assegnazione richiede scrittura preventivi', () => {
  expect(assegnazioneModificabile({ stato: 'bozza', tipo: 'preventivo' }, ['preventivi_read'])).toBe(false);
  expect(assegnazioneModificabile({ stato: 'bozza', tipo: 'preventivo' }, ['preventivi_write'])).toBe(true);
});