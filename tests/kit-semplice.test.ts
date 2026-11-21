import { expect, test } from 'bun:test';
import { calcolaKitRegole, rigaKitSemplice, totalePesoKit, type ComponenteRegoleKit } from '../src/lib/kit-regole';
import { normalizzaPatchSempliceKit, numeroCampoKit, prossimoOrdineKit, testoNumeroKit } from '../src/lib/kit-semplice-ui';
import { specificheKitDaValori } from '../src/lib/kit-config';
import { normalizzaPatchRegoleKit } from '../src/lib/kit-regole-ui';
import { LINEE_PREVENTIVO } from '../src/lib/linee-preventivo';

export const parete: ComponenteRegoleKit[] = [
  { ordine: 1, n_pezzi: 1, peso_unitario: 8.7 },
  { ordine: 2, n_pezzi: 1, consumo: 0.716666666666667 },
  { ordine: 3, n_pezzi: 2, passo: 0.6, sfrido: 0.05 },
  { ordine: 4, n_pezzi: 1, peso_unitario: 0.59 },
  { ordine: 5, n_pezzi: 1, peso_unitario: 8.7 },
  { ordine: 6, n_pezzi: 1, confezione: 20 },
  { ordine: 7, riga_rif: 2, passo: 0.5, peso_unitario: 0.0043 },
  { ordine: 8, riga_rif: 3, lati: 2, passo: 0.2, confezione: 1000, peso_unitario: 1.4 },
  { ordine: 9, consumo: 0.4, lati: 2, confezione: 10, peso_unitario: 10 },
  { ordine: 10, consumo: 1.44, lati: 2, confezione: 90, peso_unitario: 0.3 },
];
const attesi = [1, 0.716666666666667, 3.3833333333333333, 1, 1, 0.05, 1.433333333333334, 0.016916666666666667, 0.08, 0.032];
for (const [i, atteso] of attesi.entries()) test(`FM91 semplice PARETE 75/50 1+1: riga ${i + 1}`, () => {
  const risultato = calcolaKitRegole({ componenti: parete })[i];
  expect(risultato?.quantitaPerUnita).toBeCloseTo(atteso, 14);
  expect(risultato?.fonte).toBe('semplice');
  expect(risultato?.errore).toBeUndefined();
});
test('FM91 semplice totale pesi 18.829447 kg/mq e 3 righe senza peso', () => {
  const risultati = calcolaKitRegole({ componenti: parete });
  const totale = totalePesoKit(parete, risultati);
  expect(totale.pesoTotale).toBeCloseTo(18.829446666666667, 12);
  expect(Number(totale.pesoTotale.toFixed(6))).toBe(18.829447);
  expect(totale.righeSenzaPeso).toBe(3);
  expect(totale.righeConErrore).toBe(0);
  expect(risultati[6]?.pesoPerUnita).toBeCloseTo(1.433333333333334 * 0.0043, 14);
  expect(risultati[1]?.pesoPerUnita).toBeNull();
});
test('FM91 struttura doppia: guide N=2 e tasselli N=2 collegati alle guide', () => {
  const doppia = parete.map(c => c.ordine === 2 || c.ordine === 7 ? { ...c, n_pezzi: 2 } : c);
  const risultati = calcolaKitRegole({ componenti: doppia });
  expect(risultati[1]?.quantitaPerUnita).toBeCloseTo(1.433333333333334, 14);
  expect(risultati[6]?.quantitaPerUnita).toBeCloseTo(2.866666666666668, 14);
});
for (const campo of ['passo', 'passo_2', 'confezione'] as const) test(`FM91 semplice divisore zero ${campo}: null ed errore solo sulla riga`, () => {
  const risultati = calcolaKitRegole({ componenti: [{ ordine: 1, [campo]: 0 }, { ordine: 2, n_pezzi: 1 }] });
  expect(risultati[0]?.quantitaPerUnita).toBeNull();
  expect(risultati[0]?.errore).toContain('Divisione per zero');
  expect(risultati[1]?.quantitaPerUnita).toBe(1);
});
test('FM91 semplice riga inesistente e dipendenza falliscono, indipendente continua', () => {
  const r = calcolaKitRegole({ componenti: [{ ordine: 1, riga_rif: 99 }, { ordine: 2, riga_rif: 1 }, { ordine: 3, incidenza: 4 }] });
  expect(r[0]?.quantitaPerUnita).toBeNull(); expect(r[0]?.errore).toContain('riga 99 non esiste');
  expect(r[1]?.quantitaPerUnita).toBeNull(); expect(r[2]?.quantitaPerUnita).toBe(4);
});
test('FM91 semplice ciclo e dipendenza: null, righe indipendenti valide', () => {
  const r = calcolaKitRegole({ componenti: [{ ordine: 1, riga_rif: 2 }, { ordine: 2, riga_rif: 1 }, { ordine: 3, riga_rif: 1 }, { ordine: 4, n_pezzi: 1 }] });
  for (const c of r.slice(0, 3)) { expect(c.quantitaPerUnita).toBeNull(); expect(c.errore).toContain('circolare'); }
  expect(r[3]?.quantitaPerUnita).toBe(1);
});
test('FM91 semplice autociclo', () => { expect(calcolaKitRegole({ componenti: [{ ordine: 1, riga_rif: 1 }] })[0]?.errore).toContain('circolare'); });
test('FM91 semplice collegamento a riga con N=0 produce divisione per zero', () => {
  const r = calcolaKitRegole({ componenti: [{ ordine: 1, n_pezzi: 0 }, { ordine: 2, riga_rif: 1 }] });
  expect(r[0]?.quantitaPerUnita).toBe(0); expect(r[1]?.quantitaPerUnita).toBeNull(); expect(r[1]?.errore).toContain('Divisione per zero');
});
test('FM91 semplice vuoti neutri e sfrido zero, nessuna confezione automatica', () => {
  const r = calcolaKitRegole({ componenti: [{ ordine: 1, n_pezzi: 2, qta_confezione: 1000 }] });
  expect(r[0]?.quantitaPerUnita).toBe(2);
});
test('FM91 semplice precede regola, incidenza e driver anche con N=0', () => {
  const r = calcolaKitRegole({ componenti: [{ ordine: 1, n_pezzi: 0, regola_base: '50', incidenza: 99, tipo_driver: 'LATI', valore_driver: 5 }] });
  expect(r[0]?.quantitaPerUnita).toBe(0); expect(r[0]?.fonte).toBe('semplice');
});
test('FM91 retrocompatibilità: sola incidenza immutata, peso non attiva semplice', () => {
  const r = calcolaKitRegole({ componenti: [{ ordine: 1, incidenza: 0.716666666666667, peso_unitario: 8.7 }, { ordine: 2, regola_base: '2', incidenza: 9 }, { ordine: 3, tipo_driver: 'PASSO', valore_driver: 0.6 }] });
  expect(r[0]?.quantitaPerUnita).toBe(0.716666666666667); expect(r[0]?.fonte).toBe('incidenza');
  expect(r[1]?.quantitaPerUnita).toBe(2); expect(r[2]?.quantitaPerUnita).toBe(1 / 0.6);
  expect(rigaKitSemplice({ peso_unitario: 8.7 })).toBe(false);
});
test('FM91 semplice riferimenti fuori ordine e incidenza storica con N vuoto', () => {
  const r = calcolaKitRegole({ componenti: [{ ordine: 2, riga_rif: 1, passo: 0.5 }, { ordine: 1, incidenza: 0.716666666666667 }] });
  expect(r[0]?.quantitaPerUnita).toBe(1.433333333333334);
});
test('FM91 semplice peso zero è noto, peso mancante contato, errori espliciti nel totale', () => {
  const c = [{ ordine: 1, n_pezzi: 1, peso_unitario: 0 }, { ordine: 2, passo: 0, peso_unitario: 2 }, { ordine: 3, n_pezzi: 1 }];
  expect(totalePesoKit(c, calcolaKitRegole({ componenti: c }))).toEqual({ pesoTotale: 0, righeSenzaPeso: 1, righeConErrore: 1 });
});
test('FM91 nessun arrotondamento o mutazione degli input', () => {
  const prima = JSON.stringify(parete); const r = calcolaKitRegole({ componenti: parete });
  expect(r[1]?.quantitaPerUnita).toBe(0.716666666666667); expect(JSON.stringify(parete)).toBe(prima);
});
for (const campo of ['passo', 'passo_2', 'confezione'] as const) test(`FM91 validazione ${campo} strettamente positivo`, () => {
  expect(numeroCampoKit(campo, '0,6')).toBe(0.6); expect(numeroCampoKit(campo, '')).toBeNull();
  expect(() => numeroCampoKit(campo, '0')).toThrow('maggiore di zero'); expect(() => numeroCampoKit(campo, '-1')).toThrow();
});
for (const campo of ['n_pezzi', 'consumo', 'lati', 'peso_unitario'] as const) test(`FM91 validazione ${campo} non negativo`, () => {
  expect(numeroCampoKit(campo, '0')).toBe(0); expect(() => numeroCampoKit(campo, '-1')).toThrow('negativo');
});
test('FM91 validazione riga collegata intera da 1', () => {
  expect(numeroCampoKit('riga_rif', '2')).toBe(2); expect(numeroCampoKit('riga_rif', '')).toBeNull();
  for (const s of ['0', '-1', '1,5']) expect(() => numeroCampoKit('riga_rif', s)).toThrow();
});
test('FM91 sfrido può essere negativo, numeri non finiti rifiutati', () => {
  expect(numeroCampoKit('sfrido', '-0,05')).toBe(-0.05);
  for (const s of ['NaN', 'Infinity', '2x']) expect(() => numeroCampoKit('sfrido', s)).toThrow();
});
test('FM91 validazione API non modifica campi estranei o precisione', () => {
  const p = { n_pezzi: 2, passo: 0.6, consumo: 0.716666666666667, riga_rif: 3, note: 'nota', regola_base: '0,6' };
  expect(normalizzaPatchSempliceKit(p)).toEqual(p);
  expect(normalizzaPatchRegoleKit(p)).toEqual({ ...p, regola_base: '0.6' });
  expect(() => normalizzaPatchRegoleKit({ passo: 0 })).toThrow();
  expect(prossimoOrdineKit([{ ordine: 1 }, { ordine: 10 }, { ordine: 4 }])).toBe(11); expect(prossimoOrdineKit([])).toBe(1);
});
test('FM91 configurazione campi semplici per ogni linea', () => {
  expect(LINEE_PREVENTIVO.sistema_made.kit.calcoloSemplice).toBe('completo');
  for (const linea of ['showroom', 'edilizia', 'fotovoltaico'] as const) expect(LINEE_PREVENTIVO[linea].kit.calcoloSemplice).toBe('solo_quantita');
});

test('FM91 celle a quattro decimali, modifica completa e valore invariato', () => {
  const valore = 0.716666666666667;
  expect(testoNumeroKit(valore, false)).toBe('0,7167');
  expect(testoNumeroKit(valore, true)).toBe('0,716666666666667');
  expect(numeroCampoKit('consumo', testoNumeroKit(valore, true))).toBe(valore);
  expect(testoNumeroKit(1.2, false)).toBe('1,2');
  expect(testoNumeroKit(0, false)).toBe('0');
  expect(testoNumeroKit(null, false)).toBe('');
  expect(calcolaKitRegole({ componenti: [{ ordine: 1, consumo: valore }] })[0]?.quantitaPerUnita).toBe(valore);
});

test('FM91 specifiche senza passo: salva i visibili e conserva i valori storici nascosti', () => {
  const originali = { passo: 600, passo_um: 'mm', spessore_mm: 75, isolante: 'Vecchio' };
  expect(specificheKitDaValori('sistema_made', { spessore_mm: '80', isolante: '' }, originali))
    .toEqual({ passo: 600, passo_um: 'mm', spessore_mm: 80 });
  expect(originali).toEqual({ passo: 600, passo_um: 'mm', spessore_mm: 75, isolante: 'Vecchio' });
});
