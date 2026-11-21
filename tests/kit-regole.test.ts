import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { calcolaKitRegole, normalizzaOperandoKit, type ComponenteRegoleKit, type InputRegoleKit, type ParametroRegoleKit, type RigaRegoleKit, type VarianteRegoleKit } from '../src/lib/kit-regole';
import { incidenzaEffettivaKit, round4 } from '../src/lib/incidenza';

const parametri: ParametroRegoleKit[] = [
  { codice: 'PASSO', valore_default: 0.6 },
  { codice: 'MONTANTE', valore_default: 2 },
  { codice: 'LATI', valore_default: 2 },
  { codice: 'NR_GUIDE', valore_default: 1 },
];
// Ordini numerici canonici: guide = 1, montanti = 2, tasselli = 3, viti = 4.
const componenti: ComponenteRegoleKit[] = [
  { ordine: 1, articolo_codice: 'GUIDA', regola_base: '0.716667', regola_moltiplica: 'PARAM:NR_GUIDE' },
  { ordine: 2, articolo_codice: 'MONTANTE', regola_base: 'PARAM:MONTANTE', regola_dividi_1: 'PARAM:PASSO', regola_aggiunta: '0.05' },
  { ordine: 3, articolo_codice: 'TASSELLO', regola_base: 'RIGA:1', regola_dividi_1: '0.5' },
  { ordine: 4, articolo_codice: 'VITE', regola_base: 'RIGA:2', regola_moltiplica: 'PARAM:LATI', regola_dividi_1: 'PARAM:MONTANTE', regola_dividi_2: '0.2', regola_confezione: '1000' },
  { ordine: 5, articolo_codice: 'FAS351E1', regola_base: '0.4', regola_moltiplica: 'PARAM:LATI', regola_confezione: '10' },
  { ordine: 6, articolo_codice: 'NASTRO', regola_base: '1.44', regola_moltiplica: 'PARAM:LATI', regola_confezione: '90' },
];
function riga(ordine: number, input: InputRegoleKit = { componenti, parametri }): RigaRegoleKit {
  const risultato = calcolaKitRegole(input).find(r => r.ordine === ordine);
  if (!risultato) throw new Error(`Risultato ${ordine} assente`);
  return risultato;
}
function singola(c: ComponenteRegoleKit): RigaRegoleKit {
  return riga(c.ordine, { componenti: [c] });
}
const variante: VarianteRegoleKit = {
  id: 'u75-doppia', predefinita: true, imposta_parametri: { NR_GUIDE: 2 },
  articoli: [{ ruolo: 'GUIDA', articolo_codice: 'U75' }, { ruolo: 'MONTANTE', articolo_codice: 'C75' }],
};

describe('FM91 numeri Excel in UM1, senza arrotondamenti', () => {
  test('guide ML/mq: 0.716667 × NR_GUIDE', () => {
    expect(riga(1).quantitaPerUnita).toBe(0.716667);
    expect(riga(1).fonte).toBe('regola');
  });
  test('montanti: MONTANTE / PASSO + 0.05', () => {
    expect(riga(2).quantitaPerUnita).toBe(2 / 0.6 + 0.05);
    expect(riga(2).quantitaPerUnita).toBeCloseTo(3.383333, 6);
  });
  test('tasselli PZ: quantità finale guide / 0.5, senza confezione', () => {
    expect(riga(3).quantitaPerUnita).toBe(1.433334);
  });
  test('viti CO da 1000: quantità finale montanti × LATI / MONTANTE / 0.2 / 1000', () => {
    expect(riga(4).quantitaPerUnita).toBe((2 / 0.6 + 0.05) * 2 / 2 / 0.2 / 1000);
    expect(riga(4).quantitaPerUnita).toBeCloseTo(0.0169167, 7);
  });
  test('stucco FAS351E1 NR da 10 kg: 0.4 × LATI / 10', () => {
    expect(riga(5).quantitaPerUnita).toBe(0.08);
    expect(riga(5).articolo).toEqual({ tipo: 'gamma', codice: 'FAS351E1' });
  });
  test('nastro RT da 90 ml: 1.44 × LATI / 90', () => {
    expect(riga(6).quantitaPerUnita).toBe(0.032);
  });
  test('variante NR_GUIDE=2: guide raddoppiate, tasselli aggiornati via RIGA', () => {
    const input = { componenti, parametri, varianti: [variante] };
    expect(riga(1, input).quantitaPerUnita).toBe(1.433334);
    expect(riga(3, input).quantitaPerUnita).toBe(2.866668);
  });
});

test('FM91 default → variante → valore esterno: vince sempre l’ultimo', () => {
  const input = { componenti, parametri, varianti: [variante], valoriParametri: { NR_GUIDE: 3 } };
  expect(riga(1, input).quantitaPerUnita).toBe(0.716667 * 3);
  expect(riga(3, input).quantitaPerUnita).toBe(0.716667 * 3 / 0.5);
});
test('FM91 variante esplicita non predefinita: selezione per ID', () => {
  const altra = { ...variante, id: 'altra', predefinita: false, imposta_parametri: { NR_GUIDE: 4 } };
  expect(riga(1, { componenti, parametri, varianti: [variante, altra], varianteScelta: 'altra' }).quantitaPerUnita).toBe(0.716667 * 4);
});
test('FM91 valore esterno zero prevale sulla variante e si propaga alle dipendenze', () => {
  const input = { componenti, parametri, varianti: [variante], valoriParametri: { NR_GUIDE: 0 } };
  expect(riga(1, input).quantitaPerUnita).toBe(0);
  expect(riga(3, input).quantitaPerUnita).toBe(0);
});
test('FM91 un ruolo prende l’articolo Gamma della variante, non il vecchio articolo', () => {
  expect(riga(1, { componenti: [{ ...componenti[0], ordine: 1, variante_ruolo: 'GUIDA' }], parametri, varianti: [variante] }).articolo).toEqual({ tipo: 'gamma', codice: 'U75' });
});
test('FM91 variante manuale: conserva tutti i campi anagrafici e non applica prezzi', () => {
  const manuale = { ruolo: 'ACCESSORIO', codice_articolo_fornitore: 'F-01', descrizione: 'Accessorio', um: 'PZ', fornitore_id: 'f', marca: 'Marca', costo: 2.5, listino_fornitore: 4, note: 'Nota' };
  const risultato = riga(7, { componenti: [{ ordine: 7, variante_ruolo: 'ACCESSORIO', incidenza: 2 }], varianti: [{ ...variante, imposta_parametri: {}, articoli: [manuale] }] });
  const { ruolo: _ruolo, ...campi } = manuale;
  expect(risultato.articolo).toEqual({ tipo: 'manuale', ...campi });
  expect(risultato.quantitaPerUnita).toBe(2);
});
test('FM91 i riferimenti RIGA funzionano anche prima della dipendenza e su incidenza/driver', () => {
  const risultati = calcolaKitRegole({ componenti: [
    { ordine: 3, regola_base: 'RIGA:2', regola_moltiplica: 'RIGA:1' },
    { ordine: 2, incidenza: 1.23456789 },
    { ordine: 1, tipo_driver: 'PASSO', valore_driver: 0.6 },
  ] });
  expect(risultati.map(r => r.ordine)).toEqual([3, 2, 1]);
  expect(risultati[0]?.quantitaPerUnita).toBe(1.23456789 * (1 / 0.6));
});
test('FM91 operandi vuoti: moltiplicatori/divisori 1, aggiunta 0', () => {
  expect(singola({ ordine: 1, regola_base: '2,5', regola_moltiplica: '', regola_dividi_1: null, regola_dividi_2: ' ', regola_confezione: '', regola_aggiunta: null }).quantitaPerUnita).toBe(2.5);
});
test('FM91 BASE valorizzata prevale su incidenza e driver, anche BASE zero', () => {
  expect(singola({ ordine: 1, regola_base: '0', regola_aggiunta: '0,05', incidenza: 99, tipo_driver: 'PASSO', valore_driver: 0.6 }).quantitaPerUnita).toBe(0.05);
});
test('FM91 BASE vuota ignora gli altri operandi e mantiene l’incidenza zero', () => {
  const risultato = singola({ ordine: 1, regola_base: ' ', regola_dividi_1: '0', regola_moltiplica: 'PARAM:IGNOTO', incidenza: 0, tipo_driver: 'LATI', valore_driver: 2 });
  expect(risultato.quantitaPerUnita).toBe(0);
  expect(risultato.fonte).toBe('incidenza');
  expect(risultato.errore).toBeUndefined();
});
test('FM91 nessuna confezione automatica: divisore scritto oppure 1', () => {
  const c = { ordine: 1, articolo_codice: 'VITE', regola_base: '1000', qta_confezione: 1000 };
  expect(singola(c).quantitaPerUnita).toBe(1000);
  expect(singola({ ...c, regola_confezione: '1000' }).quantitaPerUnita).toBe(1);
});
test('FM91 driver storico riusato senza arrotondamento', () => {
  expect(singola({ ordine: 1, tipo_driver: 'PASSO', valore_driver: 0.6 }).quantitaPerUnita).toBe(1 / 0.6);
  expect(singola({ ordine: 1, tipo_driver: 'CONSUMO', valore_driver: 3.5, qta_confezione: 25 }).quantitaPerUnita).toBe(0.14);
});
test('FM91 normalizzazione al salvataggio: numeri italiani e riferimenti, vuoti null', () => {
  expect(normalizzaOperandoKit(' 0,6 ')).toBe('0.6');
  expect(normalizzaOperandoKit('-0,05')).toBe('-0.05');
  expect(normalizzaOperandoKit(' PARAM:NR_GUIDE ')).toBe('PARAM:NR_GUIDE');
  expect(normalizzaOperandoKit('RIGA:12')).toBe('RIGA:12');
  expect(normalizzaOperandoKit('')).toBeNull();
  expect(normalizzaOperandoKit(null)).toBeNull();
  for (const invalido of ['NaN', 'Infinity', '2*3', 'PARAM:passo', 'RIGA:guide', 'RIGA:-1', '1e3', '0,5.2']) {
    expect(() => normalizzaOperandoKit(invalido)).toThrow();
  }
});

describe('FM91 errori per riga, mai numeri non finiti o zero silenzioso', () => {
  test('ciclo RIGA e dipendenza: solo le righe coinvolte falliscono', () => {
    const risultati = calcolaKitRegole({ componenti: [
      { ordine: 1, regola_base: 'RIGA:2' }, { ordine: 2, regola_base: 'RIGA:1' },
      { ordine: 3, regola_base: 'RIGA:1' }, { ordine: 4, incidenza: 5 },
    ] });
    for (const risultato of risultati.slice(0, 3)) {
      expect(risultato.quantitaPerUnita).toBeNull();
      expect(risultato.errore).toContain('circolare');
    }
    expect(risultati[3]?.quantitaPerUnita).toBe(5);
  });
  test('autociclo', () => {
    expect(singola({ ordine: 1, regola_base: 'RIGA:1' }).errore).toContain('circolare');
  });
  test('PARAM inesistente', () => {
    expect(singola({ ordine: 1, regola_base: 'PARAM:IGNOTO' }).errore).toContain('Parametro sconosciuto: IGNOTO');
  });
  test('RIGA inesistente', () => {
    expect(singola({ ordine: 1, regola_base: 'RIGA:99' }).errore).toContain('riga 99 non esiste');
  });
  for (const campo of ['regola_dividi_1', 'regola_dividi_2', 'regola_confezione'] as const) {
    test(`divisione per zero in ${campo}`, () => {
      const risultato = singola({ ordine: 1, regola_base: '2', [campo]: '0' });
      expect(risultato.quantitaPerUnita).toBeNull();
      expect(risultato.errore).toContain('Divisione per zero');
    });
  }
  test('ruolo senza articolo nella variante', () => {
    const risultato = riga(1, { componenti: [{ ordine: 1, variante_ruolo: 'ASSENTE', regola_base: '2' }], varianti: [{ ...variante, imposta_parametri: {} }] });
    expect(risultato.quantitaPerUnita).toBeNull();
    expect(risultato.errore).toContain('Articolo mancante per il ruolo «ASSENTE»');
  });
  test('ruolo presente ma senza dati articolo non diventa un manuale vuoto', () => {
    const risultato = riga(1, { componenti: [{ ordine: 1, variante_ruolo: 'GUIDA', incidenza: 1 }], varianti: [{ ...variante, imposta_parametri: {}, articoli: [{ ruolo: 'GUIDA' }] }] });
    expect(risultato.quantitaPerUnita).toBeNull();
    expect(risultato.errore).toContain('Articolo mancante');
  });
  test('nessuna incidenza/regola/driver: errore esplicito, non zero', () => {
    expect(singola({ ordine: 1 }).quantitaPerUnita).toBeNull();
    expect(singola({ ordine: 1 }).errore).toBe('Riga 1: Compila almeno un campo di calcolo (es. N. pezzi o Consumo)');
    expect(singola({ ordine: 1 }).errore?.toLowerCase()).not.toContain('driver');
  });
  test('variante non selezionata e nessuna predefinita non sceglie la prima arbitrariamente', () => {
    const risultato = riga(1, { componenti: [{ ordine: 1, variante_ruolo: 'GUIDA', incidenza: 1 }], varianti: [{ ...variante, predefinita: false, imposta_parametri: {} }] });
    expect(risultato.quantitaPerUnita).toBeNull();
  });
  test('variante scelta inesistente', () => {
    expect(riga(1, { componenti, parametri, varianteScelta: 'assente' }).errore).toContain('variante scelta non esiste');
  });
  test('scelta numerica fuori elenco', () => {
    expect(riga(1, { componenti: [{ ordine: 1, regola_base: 'PARAM:PASSO' }], parametri: [{ codice: 'PASSO', valore_default: 0.6, tipo: 'scelta', valori_ammessi: [0.4, 0.6] }], valoriParametri: { PASSO: 0.5 } }).errore).toContain('Valore non ammesso');
  });
  test('parametri non finiti e overflow non vengono restituiti come numero', () => {
    expect(riga(1, { componenti, parametri, valoriParametri: { PASSO: Infinity } }).quantitaPerUnita).toBeNull();
    expect(singola({ ordine: 1, incidenza: NaN }).quantitaPerUnita).toBeNull();
    expect(singola({ ordine: 1, regola_base: '9'.repeat(200), regola_moltiplica: '9'.repeat(200) }).quantitaPerUnita).toBeNull();
  });
  test('ordine duplicato non sovrascrive silenziosamente la quantità', () => {
    const risultati = calcolaKitRegole({ componenti: [{ ordine: 1, incidenza: 2 }, { ordine: 1, incidenza: 3 }] });
    expect(risultati.every(r => r.quantitaPerUnita === null && r.errore?.includes('Ordine duplicato'))).toBe(true);
  });
});

test('FM91 tutti i 33 componenti reali: incidenza precisa conservata e visualizzazione storica identica', () => {
  const fixture = JSON.parse(readFileSync('tests/fixtures/fm91-kit-componenti.json', 'utf8')) as (ComponenteRegoleKit & { kit_id: string })[];
  const attese = [1, 0.716667, 1.716667, 1, 1, 0.05, 0.007167, 0.017167, 0.08, 0.032,
    1, 1, 0.716667, 1.716667, 1, 1, 1, 0.05, 0.007167, 0.008583, 0.017167, 0.08, 0.032, 0.0162,
    1, 0.883333, 1.716667, 0.883333, 0.8, 0.008, 0.006944, 0.006944, 0.006944];
  expect(fixture).toHaveLength(33);
  expect(new Set(fixture.map(c => c.kit_id)).size).toBe(3);
  const quantita: number[] = [];
  for (const kitId of new Set(fixture.map(c => c.kit_id))) {
    const input = fixture.filter(c => c.kit_id === kitId);
    const risultati = calcolaKitRegole({ componenti: input });
    risultati.forEach((risultato, i) => {
      const c = input[i];
      if (!c || risultato.quantitaPerUnita == null) throw new Error('Riga reale non calcolata');
      expect(risultato.errore).toBeUndefined();
      expect(risultato.fonte).toBe('incidenza');
      expect(round4(risultato.quantitaPerUnita)).toBe(incidenzaEffettivaKit(c));
      quantita.push(risultato.quantitaPerUnita);
    });
  }
  expect(quantita).toEqual(attese);
});

test('FM91 input non mutato dal calcolo di dipendenze e varianti', () => {
  const input = { componenti, parametri, varianti: [variante], valoriParametri: { NR_GUIDE: 3 } };
  const prima = JSON.stringify(input);
  calcolaKitRegole(input);
  expect(JSON.stringify(input)).toBe(prima);
});