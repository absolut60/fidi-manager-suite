import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { nettoAcquistoGamma, preparaAcquistoManuale, precompilaScontiAcquisto, rigaInUnita } from '../src/lib/riga-preventivo';
import { costruisciEsportazioneGamma } from '../src/lib/esportazione-gamma';
import { ordineFm96 } from './fixtures/fm96-gamma';

test('FM97: netto acquisto con tre sconti e maggiorazioni percentuale/euro', () => {
  expect(nettoAcquistoGamma(100, [10, 5, 2], 3, 1.5)).toBeCloseTo(87.8037, 8);
});
test('FM97: solo listino produce costo uguale al listino', () => {
  expect(preparaAcquistoManuale({ listino_fornitore: 100 }, null)).toMatchObject({ listino_fornitore: 100, costo_unit: 100 });
});
test('FM97: solo costo diventa listino senza sconti/maggiorazioni', () => {
  expect(preparaAcquistoManuale({ acq_sc1: 10, acq_magg_euro: 2 }, 25)).toEqual({
    listino_fornitore: 25, costo_unit: 25, acq_sc1: null, acq_sc2: null, acq_sc3: null, acq_magg_perc: null, acq_magg_euro: null,
  });
});
test('FM97: costo zero e listino zero non sono valori assenti', () => {
  expect(preparaAcquistoManuale({}, 0).listino_fornitore).toBe(0);
  expect(preparaAcquistoManuale({ listino_fornitore: 0, acq_magg_euro: 2 }, 50).costo_unit).toBe(2);
});
test('FM97: riapertura condizioni salvate e costo totale tramite patch UM1', () => {
  const acquisto = preparaAcquistoManuale({ listino_fornitore: 100, acq_sc1: 10, acq_sc2: 5, acq_sc3: 2, acq_magg_perc: 3, acq_magg_euro: 1.5 }, null);
  const patch = rigaInUnita({ quantita: 10, prezzo_unit: 120, um_scelta: 'um1' }, null, { costo_unit: acquisto.costo_unit }).patchUm1;
  expect(patch.costo).toBe(878.037);
  expect(preparaAcquistoManuale(acquisto, 87.8037)).toEqual(acquisto);
});
test('FM97: vecchio costo totale resta invariato, listino ripiego unitario', () => {
  const row = { quantita: 5, costo: 100, prezzo_unit: 30, um_scelta: 'um1' };
  const costo = rigaInUnita(row).costo_unit;
  const acquisto = preparaAcquistoManuale({}, costo);
  expect(acquisto.listino_fornitore).toBe(20);
  expect(rigaInUnita(row, null, { costo_unit: acquisto.costo_unit }).patchUm1.costo).toBe(100);
});
test('FM97: sconti base solo slot acquisto vuoti, preserva valori e segnala oltre tre', () => {
  expect(precompilaScontiAcquisto(['7', '', '0'], [10, 5, 2, 1])).toEqual({ slot: ['7', '5', '0'], oltreTre: true });
  expect(precompilaScontiAcquisto(['', '', ''], [10, -5])).toEqual({ slot: ['10', '-5', ''], oltreTre: false });
});
test('FM97: export manuale listino e condizioni acquisto, vendita invariata', () => {
  const d = ordineFm96();
  d.righe = [{ ...d.righe[0], id: 'manuale', listino_fornitore: 100, acq_sc1: 10, acq_sc2: 5, acq_sc3: 2, acq_magg_perc: 3, acq_magg_euro: 1.5, costo: 878.037 }];
  const e = costruisciEsportazioneGamma([d]);
  expect(e.ordiniBloccati).toEqual([]);
  expect(e.righe[1]).toMatchObject({ PRZ1: 100, SCT1: 10, SCT2: 5, sct3: 2, 'magg %': 3, MAGG_Import: 1.5 });
  expect(e.righe[3]).toMatchObject({ PRZ1: 20, SCT1: '', SCT2: '', sct3: '', 'magg %': '', MAGG_Import: '' });
  expect(e.problemi.map(p => p.codice)).not.toContain('costo_manuale_diverso');
});
test('FM97: export riga vecchia costo solo mantiene prezzo e condizioni vuote', () => {
  const d = ordineFm96(); d.righe = [{ ...d.righe[0], id: 'vecchia', quantita: 5, costo: 100 }];
  const e = costruisciEsportazioneGamma([d]);
  expect(e.righe[1]).toMatchObject({ PRZ1: 20, SCT1: '', SCT2: '', sct3: '', 'magg %': '', MAGG_Import: '' });
  expect(e.problemi.map(p => p.codice)).not.toContain('costo_manuale_diverso');
});
test('FM97: 10 × 87,8037 arrotondato a costo totale 878,04 non genera avviso', () => {
  const d = ordineFm96(); d.righe = [{ ...d.righe[0], id: 'arrotondata', quantita: 10, listino_fornitore: 100,
    acq_sc1: 10, acq_sc2: 5, acq_sc3: 2, acq_magg_perc: 3, acq_magg_euro: 1.5, costo: 878.04 }];
  expect(costruisciEsportazioneGamma([d]).problemi.map(p => p.codice)).not.toContain('costo_manuale_diverso');
});
test('FM97: 10 × 87,8037 con costo totale 870,00 genera solo avviso associato alla riga', () => {
  const d = ordineFm96(); d.righe = [{ ...d.righe[0], id: 'diversa', quantita: 10, listino_fornitore: 100,
    acq_sc1: 10, acq_sc2: 5, acq_sc3: 2, acq_magg_perc: 3, acq_magg_euro: 1.5, costo: 870 }];
  const e = costruisciEsportazioneGamma([d]);
  expect(e.problemi.find(p => p.codice === 'costo_manuale_diverso')).toMatchObject({ livello: 'avviso', rigaId: 'diversa' });
  expect(e.ordiniEsportati).toEqual([d.ordine.id]);
});
test('FM97: scarto esattamente un centesimo sul totale non genera avviso', () => {
  const d = ordineFm96(); d.righe = [{ ...d.righe[0], id: 'soglia', quantita: 10, listino_fornitore: 100, costo: 1000.01 }];
  expect(costruisciEsportazioneGamma([d]).problemi.map(p => p.codice)).not.toContain('costo_manuale_diverso');
});
test('FM97: scarto oltre un centesimo sul totale genera avviso anche se unitario sotto 0,0001', () => {
  const d = ordineFm96(); d.righe = [{ ...d.righe[0], id: 'oltre-soglia', quantita: 1000, listino_fornitore: 100, costo: 100000.02 }];
  expect(costruisciEsportazioneGamma([d]).problemi.find(p => p.codice === 'costo_manuale_diverso')).toMatchObject({ livello: 'avviso', rigaId: 'oltre-soglia' });
});
test('FM97: trasformazione reale cambia solo le cinque colonne copiate', () => {
  const report = readFileSync('docs/verifiche/fm97-prezzo-acquisto-manuale.md', 'utf8');
  const finale = report.split('<!-- DEFINIZIONE_FINALE -->\n```sql\n')[1]?.split('```')[0];
  expect(finale).toBeDefined(); if (!finale) throw new Error('Definizione finale mancante');
  const originale = finale.replace(', acq_sc1, acq_sc2, acq_sc3, acq_magg_perc, acq_magg_euro', '')
    .replace(', v_src_riga.acq_sc1, v_src_riga.acq_sc2, v_src_riga.acq_sc3, v_src_riga.acq_magg_perc, v_src_riga.acq_magg_euro', '');
  expect(createHash('md5').update(originale).digest('hex')).toBe('561ad7e3d27bb97b3113821e6d36b738');
  for (const c of ['acq_sc1', 'acq_sc2', 'acq_sc3', 'acq_magg_perc', 'acq_magg_euro']) expect(finale).toContain(`v_src_riga.${c}`);
});