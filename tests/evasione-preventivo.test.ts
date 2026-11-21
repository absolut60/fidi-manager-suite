import { expect, test } from 'bun:test';
import { computeEvasione, statoEvasionePreventivo, statoEvasioneRiga, type RigaQta } from '../src/lib/evasione';

const riga = (ordinata: number, tipo_riga = 'articolo_singolo'): RigaQta => ({ tipo_riga, quantita: 10, qta_ordinata: ordinata });
test('riga aperta: 10 residue su 10', () => {
  expect(statoEvasioneRiga(riga(0))).toMatchObject({ stato: 'aperta', residuo: 10 });
});
test('riga parziale: 6 residue dopo un ordine di 4', () => {
  expect(statoEvasioneRiga(riga(4))).toMatchObject({ stato: 'parziale', residuo: 6 });
});
test('riga evasa e residuo mai negativo', () => {
  expect(statoEvasioneRiga(riga(10))).toMatchObject({ stato: 'evasa', residuo: 0 });
  expect(statoEvasioneRiga(riga(12)).residuo).toBe(0);
});
for (const [ordinata, stato] of [[0, 'aperto'], [4, 'parziale'], [10, 'evaso']] as const) {
  test(`preventivo ${stato}`, () => {
    expect(statoEvasionePreventivo({ righe: [riga(ordinata)], chiuso_at: null })).toEqual({ stato, evaso_in_parte: false });
    expect(computeEvasione([riga(ordinata)])).toBe(stato);
  });
}
test('chiuso parzialmente evaso; riapertura conserva il parziale', () => {
  expect(statoEvasionePreventivo({ righe: [riga(4)], chiuso_at: '2026-11-21T16:52:00Z' })).toEqual({ stato: 'chiuso', evaso_in_parte: true });
  expect(statoEvasionePreventivo({ righe: [riga(4)], chiuso_at: null }).stato).toBe('parziale');
});
test('chiuso non ordinato o completamente evaso non è evaso in parte', () => {
  for (const ordinata of [0, 10]) expect(statoEvasionePreventivo({ righe: [riga(ordinata)], chiuso_at: '2026-11-21T16:52:00Z' })).toEqual({ stato: 'chiuso', evaso_in_parte: false });
});
test('nota, separatore e sotto totale non contano', () => {
  const testi = ['nota', 'separatore', 'sotto_totale'].map(t => riga(0, t));
  expect(statoEvasionePreventivo({ righe: [riga(10), ...testi], chiuso_at: null }).stato).toBe('evaso');
  expect(statoEvasionePreventivo({ righe: testi, chiuso_at: null }).stato).toBe('aperto');
  for (const testo of testi) expect(statoEvasioneRiga(testo)).toMatchObject({ valorizzata: false, residuo: 0 });
});
test('articolo, kit e manuale partecipano allo stato', () => {
  for (const tipo of ['articolo_singolo', 'da_kit', 'manuale']) expect(statoEvasionePreventivo({ righe: [riga(4, tipo)], chiuso_at: null }).stato).toBe('parziale');
});
test('righe nulle o a quantità zero sono ignorate', () => {
  expect(computeEvasione([{ tipo_riga: 'manuale', quantita: null, qta_ordinata: null }, { ...riga(0), quantita: 0 }])).toBe('aperto');
  expect(computeEvasione([])).toBe('aperto');
});
test('più righe: una evasa e una aperta sono parzialmente evase', () => {
  expect(computeEvasione([riga(10), riga(0)])).toBe('parziale');
});