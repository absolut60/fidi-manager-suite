import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { MAPPA_DB_KIT, MAPPA_DB_KIT_COMPONENTI } from '../src/lib/kit-excel';
import { calcolaKitRegole, totalePesoKit } from '../src/lib/kit-regole';
import { KIT_REALE } from './fixtures/kit-sm-par-2l-75-50';

test('FM92 kit di controllo P60: dieci incidenze identiche e peso noto invariato', () => {
  const risultati = calcolaKitRegole({ componenti: KIT_REALE.componenti });
  expect(risultati.map(r => r.quantitaPerUnita)).toEqual([
    4, 0.716666666666667, 3.3833333333333333, 1, 1, 0.05,
    1.433333333333334, 0.016916666666666663, 0.08, 0.032,
  ]);
  expect(risultati.every(r => !r.errore)).toBe(true);
  expect(totalePesoKit(KIT_REALE.componenti, risultati)).toEqual({
    pesoTotale: 44.929446666666664, righeSenzaPeso: 3, righeConErrore: 0,
  });
});

test('FM92 API: select e tipi dei kit includono solo campi non ritirati', () => {
  const api = readFileSync('src/lib/kit-api.ts', 'utf8');
  for (const mappa of [MAPPA_DB_KIT, MAPPA_DB_KIT_COMPONENTI]) {
    const ritirati = Object.entries(mappa).filter(([, stato]) => stato === 'escluso: in rimozione FM92').map(([campo]) => campo);
    const selezione = api.match(mappa === MAPPA_DB_KIT ? /const KIT_CAMPI = '([^']+)'/ : /const COMPONENTE_CAMPI = '([^']+)'/)?.[1]?.split(',');
    if (!selezione) throw new Error('Selezione esplicita mancante');
    expect(selezione.filter(c => ritirati.includes(c))).toEqual([]);
  }
  expect(api).not.toContain('.select()');
});
