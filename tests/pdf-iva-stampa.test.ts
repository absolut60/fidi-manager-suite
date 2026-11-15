import { expect, test } from 'bun:test';
import { calcolaTotaliPreventivo, riepilogoIvaDocumento } from '@/lib/preventivi-api';
import { riepilogoIva } from '@/lib/calcolo-iva';
import { LINEE_PREVENTIVO } from '@/lib/linee-preventivo';

// Blocchi senza righe: importo di blocco (stessa base usata dai PDF).
const blocchi = [{ righe: [], importo: 4200 }, { righe: [], importo: 3800 }];

test('agevolata_10 in stampa: totali al centesimo come riepilogoIva', () => {
  const tot = calcolaTotaliPreventivo(blocchi, 22, 0, 'agevolata_10');
  const r = riepilogoIvaDocumento(blocchi, 22, 'agevolata_10');
  const atteso = riepilogoIva({ regime: 'agevolata_10', ivaTestataPerc: 22, righe: [{ importo: 4200 }, { importo: 3800 }] });
  expect(r).toEqual(atteso);
  expect(r.voci).toEqual([{ aliquota: 10, imponibile: 8000, iva: 800 }]);
  expect([tot.imponibile_netto, tot.iva, tot.totale]).toEqual([8000, 800, 8800]);
});

test('agevolata_10_bs in stampa: esempio 8.000/4.200 → 7.600@10, 400@22, totale 8.848', () => {
  const righe = [
    { id: 'a', tipo_riga: 'manuale', quantita: 1, prezzo_unit: 4200, bene_significativo: true },
    { id: 'b', tipo_riga: 'manuale', quantita: 1, prezzo_unit: 3800, bene_significativo: false },
  ] as never[];
  const bl = [{ righe }];
  const r = riepilogoIvaDocumento(bl, 22, 'agevolata_10_bs');
  const tot = calcolaTotaliPreventivo(bl, 22, 0, 'agevolata_10_bs');
  expect(r.voci).toEqual([{ aliquota: 10, imponibile: 7600, iva: 760 }, { aliquota: 22, imponibile: 400, iva: 88 }]);
  expect(r.dettaglioBs).toEqual({ totaleIntervento: 8000, totaleBeni: 4200, quota22: 400 });
  expect([tot.iva, tot.totale]).toEqual([r.ivaTotale, r.totale]);
  expect(r.totale).toBe(8848);
});

test('stampa per linea: Sistema MADE invariata, Showroom senza payoff, banda e testata blocchi', () => {
  expect(LINEE_PREVENTIVO.sistema_made.stampa.payoff).toBe('Distribuzione sistemi a secco  |  cartongesso, profili, isolanti, controsoffitti');
  expect(LINEE_PREVENTIVO.sistema_made.stampa.testataBlocchi).toBe(true);
  expect(LINEE_PREVENTIVO.sistema_made.stampa.banda?.titolo).toEqual(['IL NUOVO MODO', 'DI COSTRUIRE.']);
  expect(LINEE_PREVENTIVO.showroom.stampa).toEqual({ payoff: null, banda: null, testataBlocchi: false });
});
