import { expect, test } from 'bun:test';
import { vistaCommerciale } from '../src/lib/vista-commerciale';

const r = (descrizione: string, importo: number | null, stampabile = true, articolo_codice: string | null = null) =>
  ({ descrizione, importo, stampabile, articolo_codice, quantita: 1, tipo_riga: 'articolo_singolo' });

test('senza PEF si stampa tutto anche con righe nascoste', () => {
  const v = vistaCommerciale([{ righe: [r('A', 10), r('B', 5.5, false)] }]);
  expect(v.raccoglitori).toEqual([]);
  expect(v.blocchi[0].righe.map(x => x.importoStampato)).toEqual([10, 5.5]);
  expect(v.totaleStampato).toBe(15.5);
  expect(v.totaleVero).toBe(15.5);
});
test('PEF assorbe le nascoste di più blocchi e l\'invariante regge', () => {
  const v = vistaCommerciale([
    { righe: [r('A', 100.1), r('N1', 0.2, false)] },
    { righe: [r('Posa', 50, true, 'PEF'), r('N2', 33.33, false), r('Commento', null)] },
  ]);
  expect(v.raccoglitori[0].importoStampato).toBe(83.53);
  expect(v.raccoglitori[0].importoNascoste).toBe(33.53);
  expect(v.blocchi[0].subtotaleStampato).toBe(100.1);
  expect(v.blocchi[1].righe.map(x => x.riga.descrizione)).toEqual(['Posa', 'Commento']);
  expect(v.totaleStampato).toBe(v.totaleVero);
  expect(v.totaleVero).toBe(183.63);
});
test('blocco interamente nascosto: vuoto e subtotale zero', () => {
  const v = vistaCommerciale([{ righe: [r('P', 10, true, 'pef2')] }, { righe: [r('N', 7, false)] }]);
  expect(v.blocchi[1]).toMatchObject({ vuoto: true, subtotaleStampato: 0, righe: [] });
  expect(v.totaleStampato).toBe(17);
});
test('più righe PEF: solo la prima raccoglie, le altre sono normali', () => {
  const v = vistaCommerciale([{ righe: [r('N', 4, false), r('P1', 10, true, 'PEFCAR'), r('P2', 20, false, 'PEF3')] }]);
  expect(v.raccoglitori).toHaveLength(1);
  expect(v.raccoglitori[0].raccoglitore.descrizione).toBe('P1');
  expect(v.blocchi[0].righe.map(x => [x.riga.descrizione, x.importoStampato])).toEqual([['P1', 34]]);
});
test('importi negativi nascosti si sommano algebricamente', () => {
  const v = vistaCommerciale([{ righe: [r('P', 100, true, 'PEF'), r('Sconto', -15.25, false)] }]);
  expect(v.raccoglitori[0].importoStampato).toBe(84.75);
  expect(v.totaleStampato).toBe(v.totaleVero);
});
test('preventivo vuoto', () => {
  expect(vistaCommerciale([])).toEqual({ blocchi: [], raccoglitori: [], totaleVero: 0, totaleStampato: 0 });
});
