import { expect, test } from 'bun:test';
import { riepilogoIva } from '../src/lib/calcolo-iva';

const esempio = [
  { importo: 2000, bene_significativo: false }, // posa
  { importo: 1500, bene_significativo: false }, // piastrelle
  { importo: 300, bene_significativo: false },  // colla
  { importo: 2500, bene_significativo: true },  // sanitari
  { importo: 1700, bene_significativo: true },  // rubinetteria
];

test('esempio di riferimento beni significativi', () => {
  const r = riepilogoIva({ regime: 'agevolata_10_bs', ivaTestataPerc: 22, righe: esempio });
  expect(r.voci).toEqual([{ aliquota: 10, imponibile: 7600, iva: 760 }, { aliquota: 22, imponibile: 400, iva: 88 }]);
  expect(r.ivaTotale).toBe(848);
  expect(r.totale).toBe(8848);
  expect(r.dettaglioBs).toEqual({ totaleIntervento: 8000, totaleBeni: 4200, quota22: 400 });
});
test('stesso preventivo in agevolata_10: tutto al 10, override ignorato', () => {
  const r = riepilogoIva({ regime: 'agevolata_10', righe: [...esempio, { importo: 0, aliquota_iva: 22 }].map(x => ({ ...x, aliquota_iva: 22 })) });
  expect(r.voci).toEqual([{ aliquota: 10, imponibile: 8000, iva: 800 }]);
  expect(r.totale).toBe(8800);
  expect(r.dettaglioBs).toBeNull();
});
test('ordinaria con override di riga', () => {
  const r = riepilogoIva({ regime: 'ordinaria', ivaTestataPerc: null, righe: [{ importo: 100, aliquota_iva: 10 }, { importo: 200 }, { importo: 50.5 }] });
  expect(r.voci).toEqual([{ aliquota: 10, imponibile: 100, iva: 10 }, { aliquota: 22, imponibile: 250.5, iva: 55.11 }]);
  expect(r.totale).toBe(415.61);
});
test('regime 3 con B ≤ metà di T: tutto al 10', () => {
  const r = riepilogoIva({ regime: 'agevolata_10_bs', righe: [{ importo: 600 }, { importo: 400, bene_significativo: true }] });
  expect(r.voci).toEqual([{ aliquota: 10, imponibile: 1000, iva: 100 }]);
  expect(r.dettaglioBs?.quota22).toBe(0);
});
test('regime 3 senza beni significativi: tutto al 10, quota22 = 0', () => {
  const r = riepilogoIva({ regime: 'agevolata_10_bs', righe: [{ importo: 300 }, { importo: 200, aliquota_iva: 22 }] });
  expect(r.voci).toEqual([{ aliquota: 10, imponibile: 500, iva: 50 }]);
  expect(r.dettaglioBs).toEqual({ totaleIntervento: 500, totaleBeni: 0, quota22: 0 });
});
test('importi negativi (sconti) riducono l\'imponibile', () => {
  const r = riepilogoIva({ regime: 'ordinaria', ivaTestataPerc: 22, righe: [{ importo: 100 }, { importo: -30.05 }] });
  expect(r.voci).toEqual([{ aliquota: 22, imponibile: 69.95, iva: 15.39 }]);
  const n = riepilogoIva({ regime: 'ordinaria', righe: [{ importo: -10.05 }] });
  expect(n.voci).toEqual([{ aliquota: 22, imponibile: -10.05, iva: -2.21 }]);
});
test('preventivo vuoto', () => {
  for (const regime of ['ordinaria', 'agevolata_10', 'agevolata_10_bs'] as const) {
    const r = riepilogoIva({ regime, righe: [] });
    expect(r.voci).toEqual([]);
    expect(r.totale).toBe(0);
    expect(r.ivaTotale).toBe(0);
  }
});

import { avvisiRegimeIva, regimeIvaValido } from '../src/lib/calcolo-iva';
test('avvisi morbidi dei regimi agevolati', () => {
  expect(avvisiRegimeIva('ordinaria', [])).toEqual([]);
  expect(avvisiRegimeIva('agevolata_10', [{ posa: true }])).toEqual([]);
  expect(avvisiRegimeIva('agevolata_10', [{ posa: false }])).toEqual(['Regime agevolato senza riga di posa: verifica la coerenza']);
  expect(avvisiRegimeIva('agevolata_10_bs', [{ posa: true }])).toEqual(['Nessun bene significativo indicato']);
  expect(avvisiRegimeIva('agevolata_10_bs', [{ posa: true }, { posa: false, bene_significativo: true }])).toEqual([]);
  expect(regimeIvaValido(null)).toBe('ordinaria');
  expect(regimeIvaValido('agevolata_10_bs')).toBe('agevolata_10_bs');
});
