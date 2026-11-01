import { test, expect } from 'bun:test';
import {
  DIMENSIONE_BLOCCO_FIDO_TEORICO,
  bloccoConRiprova,
  eTimeoutIstruzione,
  eseguiSequenzaRicalcolo,
  etichettaRipresa,
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

test('tre timeout sul blocco 14: errore con il numero del blocco e ripresa dall\'ultimo id completato', async () => {
  const { client, chiamate } = clienteFinto([
    { data: 'id-13' }, // blocco 13
    { error: TIMEOUT }, { error: TIMEOUT }, { error: TIMEOUT }, // blocco 14
  ]);
  const esito = await eseguiSequenzaRicalcolo({
    ripresa: { fase: 'blocchi', dopoId: 'id-12', numero: 13, previsti: 65 },
    avvia: async () => { throw new Error('non deve rifare l\'avvio'); },
    blocco: (dopoId) => bloccoConRiprova(client, dopoId, nessunaAttesa),
    chiudi: async () => { throw new Error('non deve finalizzare'); },
  });
  expect(esito.ok).toBe(false);
  if (esito.ok) return;
  expect(esito.errore).toContain('Blocco 14');
  expect(esito.errore).toContain('dopo 3 tentativi');
  expect(esito.ripresa).toEqual({ fase: 'blocchi', dopoId: 'id-13', numero: 14, previsti: 65 });
  expect(etichettaRipresa(esito.ripresa!)).toBe('Riprendi da blocco 14');
  expect(chiamate).toHaveLength(4);
});

test('ripresa: parte dall\'ultimo id senza avvio né blocchi già fatti, poi finalizza e alert', async () => {
  const visti: Array<string | null> = [];
  const chiusure: string[] = [];
  const esito = await eseguiSequenzaRicalcolo({
    ripresa: { fase: 'blocchi', dopoId: 'id-13', numero: 14, previsti: 15 },
    avvia: async () => { throw new Error('non deve rifare l\'avvio'); },
    blocco: async (dopoId) => {
      visti.push(dopoId);
      return dopoId === 'id-13' ? 'id-14' : dopoId === 'id-14' ? 'id-15' : null;
    },
    chiudi: async (p) => { chiusure.push(p); },
  });
  expect(esito.ok).toBe(true);
  expect(visti).toEqual(['id-13', 'id-14', 'id-15']);
  expect(chiusure).toEqual(['finalizza', 'alert', 'chiusura']);
});

test('finalizza e alert solo dopo tutti i blocchi; ripresa dalla chiusura se fallisce alert', async () => {
  const ordine: string[] = [];
  const esito = await eseguiSequenzaRicalcolo({
    ripresa: null,
    avvia: async () => { ordine.push('avvia'); return { blocchiPrevisti: 2 }; },
    blocco: async (dopoId) => { ordine.push(`blocco:${dopoId}`); return dopoId === null ? 'a' : dopoId === 'a' ? 'b' : null; },
    chiudi: async (p) => { ordine.push(p); if (p === 'alert') throw new Error('timeout alert'); },
  });
  expect(ordine).toEqual(['avvia', 'blocco:null', 'blocco:a', 'blocco:b', 'finalizza', 'alert']);
  expect(esito.ok).toBe(false);
  if (esito.ok) return;
  expect(esito.ripresa).toEqual({ fase: 'chiusura', passo: 'alert' });

  const ripresi: string[] = [];
  const di2 = await eseguiSequenzaRicalcolo({
    ripresa: esito.ripresa,
    avvia: async () => { throw new Error('no'); },
    blocco: async () => { throw new Error('no'); },
    chiudi: async (p) => { ripresi.push(p); },
  });
  expect(di2.ok).toBe(true);
  expect(ripresi).toEqual(['alert', 'chiusura']);
});
