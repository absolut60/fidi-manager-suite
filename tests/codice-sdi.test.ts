import { expect, test } from 'bun:test';
import { normalizzaCodiceSdi, avvisoCodiceSdi } from '../src/lib/codice-sdi';

test('SDI: maiuscolo e senza spazi, anche incollando', () => {
  expect(normalizzaCodiceSdi(' ab c\t12\n34 ')).toBe('ABC1234');
});
test('SDI: massimo sette caratteri senza bloccare la normalizzazione', () => {
  expect(normalizzaCodiceSdi('abcdefgh')).toBe('ABCDEFG');
});
test('SDI: sette caratteri non richiedono avviso', () => {
  expect(avvisoCodiceSdi('ABC1234')).toBe(false);
});
test('SDI: codice incompleto segnala solo un avviso e viene mantenuto', () => {
  expect(avvisoCodiceSdi('ab')).toBe(true);
});
test('SDI: vuoto/null/assente ammessi, normalizzazione vuota', () => {
  for (const v of ['', '  ', null, undefined]) {
    expect(normalizzaCodiceSdi(v)).toBe(''); expect(avvisoCodiceSdi(v)).toBe(false);
  }
});