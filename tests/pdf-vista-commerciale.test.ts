import { expect, test } from 'bun:test';
import { vistaCommerciale } from '@/lib/vista-commerciale';
import { calcolaTotaliPreventivo, riepilogoIvaDocumento } from '@/lib/preventivi-api';

const r = (id: string, codice: string, prezzo: number, extra: object = {}) => ({ id, tipo_riga: 'articolo_singolo', articolo_codice: codice, quantita: 1, prezzo_unit: prezzo, importo: prezzo, ...extra });
const blocchi = () => [
  { id: 'b1', righe: [r('1', 'SAN01', 4200, { bene_significativo: true }), r('2', 'COLLA', 333.33, { stampabile: false }), { id: 's1', tipo_riga: 'sotto_totale', importo: null }] },
  { id: 'b2', righe: [r('3', 'PEF01', 3000), r('4', 'TUBO', 466.67, { stampabile: false })] },
];

for (const regime of ['ordinaria', 'agevolata_10', 'agevolata_10_bs'] as const) {
  test(`showroom con PEF e righe nascoste (${regime}): totale stampato = totale vero al centesimo`, () => {
    const b = blocchi();
    const v = vistaCommerciale(b);
    expect(v.blocchi[0].righe.map(x => x.riga.id)).toEqual(['1', 's1']);
    expect(v.blocchi[0].righe[1].subtotaleStampato).toBe(4200);
    expect(v.blocchi[1].righe.map(x => [x.riga.id, x.importoStampato])).toEqual([['3', 3800]]);
    expect(v.totaleStampato).toBe(8000);
    const tot = calcolaTotaliPreventivo(b as never, 22, 0, regime);
    expect(tot.imponibile_netto).toBe(v.totaleStampato);
    // Le nascoste restano nel riepilogo IVA con la loro natura: stesso insieme di righe.
    const rie = riepilogoIvaDocumento(b as never, 22, regime);
    expect([rie.imponibileTotale, rie.totale]).toEqual([tot.imponibile_netto, tot.totale]);
    if (regime === 'agevolata_10_bs') expect(rie.totale).toBe(8848);
  });
}

test('showroom senza PEF: si stampa tutto, flag ignorato', () => {
  const b = blocchi(); b[1].righe[0] = r('3', 'POSA', 3000);
  const v = vistaCommerciale(b);
  expect(v.blocchi.flatMap(x => x.righe.map(y => y.riga.id))).toEqual(['1', '2', 's1', '3', '4']);
  expect(v.blocchi[0].righe[2].subtotaleStampato).toBe(4533.33);
  expect(v.totaleStampato).toBe(v.totaleVero);
});
