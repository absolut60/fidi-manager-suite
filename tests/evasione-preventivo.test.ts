import { expect, test } from 'bun:test';
import { statoEvasionePreventivo, statoEvasioneRiga, mostraColonnaEvasione, evasioneRigaInUnita, quantitaOrdineUm1, motivoTrasformazioneDisabilitata, type RigaQta } from '../src/lib/evasione';

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
  expect(statoEvasionePreventivo({ righe: [{ tipo_riga: 'manuale', quantita: null, qta_ordinata: null }, { ...riga(0), quantita: 0 }], chiuso_at: null }).stato).toBe('aperto');
  expect(statoEvasionePreventivo({ righe: [], chiuso_at: null }).stato).toBe('aperto');
});
test('più righe: una evasa e una aperta sono parzialmente evase', () => {
  expect(statoEvasionePreventivo({ righe: [riga(10), riga(0)], chiuso_at: null }).stato).toBe('parziale');
});

test('nessuna quantità ordinata e preventivo aperto: colonna assente', () => {
  expect(mostraColonnaEvasione({ tipo: 'preventivo', righe: [riga(0)], chiuso_at: null })).toBe(false);
});
test('almeno una quantità ordinata: colonna presente per tutti i blocchi', () => {
  expect(mostraColonnaEvasione({ tipo: 'preventivo', righe: [riga(0), riga(4)], chiuso_at: null })).toBe(true);
});
test('chiusura senza ordini: colonna presente', () => {
  expect(mostraColonnaEvasione({ tipo: 'preventivo', righe: [riga(0)], chiuso_at: '2026-11-21T17:02:00Z' })).toBe(true);
});
test('ordine: colonna sempre assente', () => {
  expect(mostraColonnaEvasione({ tipo: 'ordine', righe: [riga(4)], chiuso_at: '2026-11-21T17:02:00Z' })).toBe(false);
});
const rigaUm2 = { ...riga(4), um: 'PZ', um_scelta: 'um2', unita_gamma: { um: 'PZ', um2: 'CF', fattore_conversione: 2 } };
test('UM2: totale ordinato e residuo condividono la conversione quantità', () => {
  expect(evasioneRigaInUnita(rigaUm2)).toMatchObject({ um: 'CF', quantita: 5, ordinata: 2, residuo: 3, stato: 'parziale' });
});
test('invio ordine: quantità UM2 convertita in UM1 senza cambiare il residuo', () => {
  expect(quantitaOrdineUm1(rigaUm2, 3)).toBe(6);
  expect(quantitaOrdineUm1({ ...rigaUm2, um_scelta: 'um1' }, 3)).toBe(3);
});
test('chiuso ed evaso impediscono la trasformazione, parziale no', () => {
  expect(motivoTrasformazioneDisabilitata(statoEvasionePreventivo({ righe: [riga(4)], chiuso_at: '2026-11-21T17:02:00Z' }))).not.toBeNull();
  expect(motivoTrasformazioneDisabilitata(statoEvasionePreventivo({ righe: [riga(10)], chiuso_at: null }))).not.toBeNull();
  expect(motivoTrasformazioneDisabilitata(statoEvasionePreventivo({ righe: [riga(4)], chiuso_at: null }))).toBeNull();
});