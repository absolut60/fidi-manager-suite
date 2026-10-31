import { test, expect } from 'bun:test';
import { intervalloAttesaPrecalcolo } from '../src/lib/precalcolo-polling';

test('attesa automatica: rilettura ogni 15 secondi solo quando tutti gli import sono arrivati', () => {
  expect(intervalloAttesaPrecalcolo(true, 1000, 1000)).toBe(15_000);
  expect(intervalloAttesaPrecalcolo(false, 1000, 1000)).toBe(false);
});

test('attesa automatica: si ferma a 10 minuti, non prima', () => {
  expect(intervalloAttesaPrecalcolo(true, 1000, 600_999)).toBe(15_000);
  expect(intervalloAttesaPrecalcolo(true, 1000, 601_000)).toBe(false);
  expect(intervalloAttesaPrecalcolo(true, 1000, 616_000)).toBe(false);
});