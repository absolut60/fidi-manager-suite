import { test, expect, mock } from 'bun:test';
const reads: string[] = [];
let rows: Record<string, unknown>[] = [];
let sogliaConfigurata: string | null = null;
let erroreConfigurazione: Error | null = null;
mock.module('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => {
    reads.push(table);
    if (table === 'configurazioni') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: sogliaConfigurata === null ? null : { valore: sogliaConfigurata }, error: erroreConfigurazione }) }) }) };
    return { select: () => ({ in: async () => ({ data: rows, error: null }) }) };
  },
} }));
const { normalizza, motivoCoefficiente, fetchFidoTeoricoPerRichiesta, fidoPropostoPerRichiesta, arrotondaFidoV2 } = await import('../src/lib/fido-teorico');
const { determinaTipoRichiesta, extraFidoTeorico, motivoExtraObbligatorio } = await import('../src/lib/fidi');
test('normalizza preserves nullable v2 columns and concrete new values', () => {
  const r = normalizza({ cliente_id:'a', fido_proposto:45000, base:29948, fabbisogno:35000, profilo:'ritardo_abituale', acquisto_mensile:1000, ciclo_gg:60 });
  expect(r.fido_proposto).toBe(45000);
  expect(r.base).toBe(29948);
  expect(r.fabbisogno).toBe(35000);
  expect(r.ciclo_gg).toBe(60);
  expect(r.acquisto_tendenza).toBeNull();
});
test('detailed payment profile is the coefficient reason', () => {
  expect(motivoCoefficiente({ profilo:'ritardo_abituale' })).toBe('Ritardo abituale');
  expect(motivoCoefficiente({ profilo:'patologico_insoluti_ripetuti' })).toBe('Patologico: insoluti ripetuti');
});
test('all request users read canonical fido only, including prior preview users', async () => {
  rows = [{cliente_id:'a',regola_applicata:'calcolo',fido_proposto:45000}]; reads.length=0;
  for (const user of [null, 'preview-user', 'other-user']) {
    const result = await fetchFidoTeoricoPerRichiesta(['a'], user);
    expect(result.get('a')).toBe(45000);
  }
  expect(reads.filter(t => t === 'fido_teorico_cliente')).toHaveLength(3);
  expect(reads.filter(t => t === 'configurazioni')).toHaveLength(3);
});
test('the three non-proposable rules stay excluded', async () => {
  rows = ['condizione_mancante','sede_esclusa','esclusa_gruppo'].map((regola_applicata) => ({cliente_id:regola_applicata, regola_applicata, fido_proposto:500}));
  const result = await fetchFidoTeoricoPerRichiesta(rows.map(r => String(r.cliente_id)), null);
  expect([...result.values()]).toEqual([null,null,null]);
});

test('arrotondamento v2: gradini 500/1000/5000, anche oltre 50000', () => {
  for (const [input, output] of [[-1,0],[0,0],[1,500],[500,500],[500.01,1000],[1000,1000],[1000.01,2000],[5000,5000],[5000.01,10000],[50000.01,55000],[55000,55000],[55000.01,60000]]) {
    expect(arrotondaFidoV2(input)).toBe(output);
  }
});

test('aumenti e uguaglianza restano identici anche con debito elevato', () => {
  expect(fidoPropostoPerRichiesta(45000,60000,90000)).toBe(60000);
  expect(fidoPropostoPerRichiesta(45000,45000,90000)).toBe(45000);
});

test('riduzione: debito comprende esposizione e ordini, soglia default 0.80', async () => {
  rows = [{cliente_id:'rid',regola_applicata:'calcolo',fido_attuale:60000,fido_proposto:20000,esposizione_corrente:24000,ordini_aperti:6000}];
  const risultato = (await fetchFidoTeoricoPerRichiesta(['rid'], null)).get('rid');
  expect(risultato).toBe(40000);
  expect(determinaTipoRichiesta(60000, Number(risultato))).toBe('diminuzione');
  expect(extraFidoTeorico(risultato, risultato)).toBe(0);
  expect(motivoExtraObbligatorio(risultato, risultato)).toBe(false);
});

test('riduzione: se il teorico è più alto della protezione resta il teorico', () => {
  expect(fidoPropostoPerRichiesta(60000,45000,10000)).toBe(45000);
});

test('protezione uguale o superiore al fido attuale: rinnovo e mai aumento', () => {
  for (const debito of [48000,60000]) {
    const risultato = fidoPropostoPerRichiesta(60000,20000,debito);
    expect(risultato).toBe(60000);
    expect(determinaTipoRichiesta(60000,risultato)).toBe('rinnovo');
  }
});

test('configurazione soglia 0.60 modifica il riferimento letto, senza modificare il teorico', async () => {
  sogliaConfigurata = '0.60';
  try {
    rows = [{cliente_id:'rid',regola_applicata:'calcolo',fido_attuale:60000,fido_proposto:20000,esposizione_corrente:24000,ordini_aperti:6000}];
    expect((await fetchFidoTeoricoPerRichiesta(['rid'],null)).get('rid')).toBe(50000);
    expect(normalizza(rows[0]).fido_proposto).toBe(20000);
  } finally { sogliaConfigurata = null; }
});

test('zero e debito negativo non impongono un minimo aggiuntivo', () => {
  expect(fidoPropostoPerRichiesta(1000,0,0)).toBe(0);
  expect(fidoPropostoPerRichiesta(1000,500,-100)).toBe(500);
});

test('lettura configurazione fallita: errore propagato, nessuna proposta errata', async () => {
  erroreConfigurazione = new Error('lettura fallita');
  try { await expect(fetchFidoTeoricoPerRichiesta(['a'],null)).rejects.toThrow('lettura fallita'); }
  finally { erroreConfigurazione = null; }
});

test('soglia non positiva o non numerica rifiutata', () => {
  expect(() => fidoPropostoPerRichiesta(60000,20000,30000,0)).toThrow();
  expect(() => fidoPropostoPerRichiesta(60000,20000,30000,NaN)).toThrow();
});

describe("PROFILO_FIDO_LABEL profili inattivi (FM55)", () => {
  it("etichette dei nuovi profili", async () => {
    const { PROFILO_FIDO_LABEL } = await import("@/lib/fido-teorico");
    expect(PROFILO_FIDO_LABEL.perso).toBe("Cliente perso");
    expect(PROFILO_FIDO_LABEL.mai_acquistato).toBe("Mai acquistato");
    expect(PROFILO_FIDO_LABEL.nuovo_in_attesa).toBe("Nuovo, in attesa del primo acquisto");
  });
});
