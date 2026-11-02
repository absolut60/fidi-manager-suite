import { test, expect } from 'bun:test';
import {
  DIMENSIONE_BLOCCO_FIDO_TEORICO,
  bloccoConRiprova,
  eTimeoutIstruzione,
  type ClienteRpc,
} from '../src/lib/fido-teorico-ricalcolo-riprova';

const TIMEOUT = { code: '57014', message: 'canceling statement due to statement timeout' };
const nessunaAttesa = { attendi: async () => {} };

/** Client finto: per ogni chiamata restituisce il prossimo esito della lista. */
function clienteFinto(esiti: Array<{ data?: unknown; error?: unknown }>) {
  const chiamate: Array<{ fn: string; args: unknown }> = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      chiamate.push({ fn, args });
      const e = esiti.shift() ?? { data: null };
      return { data: e.data ?? null, error: (e.error as never) ?? null };
    },
  } as unknown as ClienteRpc;
  return { client, chiamate };
}

test('blocchi da 200 clienti', () => {
  expect(DIMENSIONE_BLOCCO_FIDO_TEORICO).toBe(200);
});

test('riconosce il timeout dal codice 57014 o dal messaggio', () => {
  expect(eTimeoutIstruzione({ code: '57014', message: 'x' })).toBe(true);
  expect(eTimeoutIstruzione({ message: 'canceling statement due to statement timeout' })).toBe(true);
  expect(eTimeoutIstruzione({ code: '23505', message: 'duplicate key' })).toBe(false);
});

test('timeout al primo tentativo e ok al secondo: ripete lo stesso blocco e prosegue', async () => {
  const { client, chiamate } = clienteFinto([{ error: TIMEOUT }, { data: 'id-200' }]);
  const r = await bloccoConRiprova(client, 'id-100', nessunaAttesa);
  expect(r).toBe('id-200');
  expect(chiamate).toHaveLength(2);
  expect(chiamate.map((c) => (c.args as { _dopo_id: string })._dopo_id)).toEqual(['id-100', 'id-100']);
  expect((chiamate[0].args as { _dimensione: number })._dimensione).toBe(200);
});

test('errore diverso dal timeout: nessuna riprova', async () => {
  const { client, chiamate } = clienteFinto([{ error: { code: '42501', message: 'permesso negato' } }]);
  await expect(bloccoConRiprova(client, null, nessunaAttesa)).rejects.toThrow('permesso negato');
  expect(chiamate).toHaveLength(1);
});
