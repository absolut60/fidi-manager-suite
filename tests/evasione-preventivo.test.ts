import { expect, test } from 'bun:test';
import { statoEvasionePreventivo, statoEvasioneRiga, etichettaEvasioneDocumento, mostraColonnaEvasione, evasioneRigaInUnita, quantitaOrdineUm1, motivoTrasformazioneDisabilitata, type RigaQta } from '../src/lib/evasione';

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
  expect(etichettaEvasioneDocumento(statoEvasionePreventivo({ righe: [riga(4)], chiuso_at: '2026-11-21T16:52:00Z' }))).toEqual({ etichetta: 'Chiuso', sottotesto: 'evaso in parte' });
  expect(statoEvasionePreventivo({ righe: [riga(4)], chiuso_at: null }).stato).toBe('parziale');
});
test('chiuso non ordinato o completamente evaso non è evaso in parte', () => {
  for (const ordinata of [0, 10]) expect(statoEvasionePreventivo({ righe: [riga(ordinata)], chiuso_at: '2026-11-21T16:52:00Z' })).toEqual({ stato: 'chiuso', evaso_in_parte: false });
  expect(etichettaEvasioneDocumento({ stato: 'chiuso', evaso_in_parte: false })).toEqual({ etichetta: 'Chiuso', sottotesto: null });
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

// --- FM93: invio ordine con fattori di conversione non interi ---
const rigaUm2F = (quantita: number, ordinata: number, fattore: number) => ({
  tipo_riga: 'articolo_singolo' as const, quantita, qta_ordinata: ordinata,
  um: 'PZ', um_scelta: 'um2', unita_gamma: { um: 'PZ', um2: 'CF', fattore_conversione: fattore },
});

test('fattore 3,6: residuo intero → inviato il residuo UM1 esatto 400,0003', () => {
  const r = rigaUm2F(400.0003, 0, 3.6);
  expect(evasioneRigaInUnita(r).residuo).toBeCloseTo(111.1112, 4);
  expect(111.1112 * 3.6).toBeGreaterThan(400.0003); // la conversione grezza eccederebbe il residuo
  expect(quantitaOrdineUm1(r, 111.1112)).toBe(400.0003);
  expect(quantitaOrdineUm1(r, 111.11119444444444)).toBe(400.0003);
});
test('fattore 0,72: residuo intero → inviato esattamente 400', () => {
  const r = rigaUm2F(400, 0, 0.72);
  expect(555.5556 * 0.72).toBeGreaterThan(400);
  expect(quantitaOrdineUm1(r, 555.5556)).toBe(400);
});
test('fattore 0,72 con riga parziale: residuo UM1 300, mostrato 416,6667', () => {
  const r = rigaUm2F(400, 100, 0.72);
  expect(416.6667 * 0.72).toBeGreaterThan(300);
  expect(quantitaOrdineUm1(r, 416.6667)).toBe(300);
});
test('quantità minore del residuo resta invariata', () => {
  const r = rigaUm2F(400.0003, 0, 3.6);
  expect(quantitaOrdineUm1(r, 50)).toBe(180);
  expect(quantitaOrdineUm1(r, 111.11)).toBe(399.996);
});
test('mai oltre il residuo: il valore digitato in eccesso è limitato al residuo UM1', () => {
  const r = rigaUm2F(400.0003, 0, 3.6);
  expect(quantitaOrdineUm1(r, 200)).toBe(400.0003);
});
test('UM1: quantità invariata e comunque mai oltre il residuo', () => {
  const r = { ...rigaUm2F(10, 4, 2), um_scelta: 'um1' };
  expect(quantitaOrdineUm1(r, 3)).toBe(3);
  expect(quantitaOrdineUm1(r, 999)).toBe(6);
});