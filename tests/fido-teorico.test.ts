import { test, expect, mock } from 'bun:test';
const reads: string[] = [];
let rows: Record<string, unknown>[] = [];
mock.module('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => {
    reads.push(table);
    return { select: () => ({ in: async () => ({ data: rows, error: null }) }) };
  },
} }));
const { normalizza, motivoCoefficiente, fetchFidoTeoricoPerRichiesta } = await import('../src/lib/fido-teorico');
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
  expect(reads).toEqual(['fido_teorico_cliente','fido_teorico_cliente','fido_teorico_cliente']);
});
test('the three non-proposable rules stay excluded', async () => {
  rows = ['condizione_mancante','sede_esclusa','esclusa_gruppo'].map((regola_applicata) => ({cliente_id:regola_applicata, regola_applicata, fido_proposto:500}));
  const result = await fetchFidoTeoricoPerRichiesta(rows.map(r => String(r.cliente_id)), null);
  expect([...result.values()]).toEqual([null,null,null]);
});
