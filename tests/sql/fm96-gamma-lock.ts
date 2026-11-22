/** Solo clone locale FM96: due connessioni reali, nessun URL/env del database app. */
import postgres from 'postgres';
import assert from 'node:assert/strict';

const database = process.argv[2];
if (!database?.startsWith('fm96_')) throw new Error('Specificare un database clone fm96_*');
const config = { host: '/tmp/fm96-socket', port: 55496, username: 'fm96', database, max: 1 };
const a = postgres(config), b = postgres(config);
const ordine = '96000000-0000-0000-0000-000000000001';
const preventivo = '96000000-0000-0000-0000-000000000002';
const bloccoOrdine = '96000000-0000-0000-0000-000000000003';
const bloccoPreventivo = '96000000-0000-0000-0000-000000000004';
const rigaOrdine = '96000000-0000-0000-0000-000000000005';
const rigaPreventivo = '96000000-0000-0000-0000-000000000006';
const rollback = new Error('ROLLBACK intenzionale');
let prove = 0;
async function annullata(run: (tx: postgres.TransactionSql) => Promise<void>) {
  try { await a.begin(async tx => { await run(tx); throw rollback; }); }
  catch (err) { if (err !== rollback) throw err; }
}
async function lockTest(child: 'riga' | 'blocco', tipo: 'ordine' | 'preventivo') {
  const ordineId = tipo === 'ordine' ? ordine : preventivo;
  const bloccoId = tipo === 'ordine' ? bloccoOrdine : bloccoPreventivo;
  const rigaId = tipo === 'ordine' ? rigaOrdine : rigaPreventivo;
  await annullata(async tx => {
    await tx`SET LOCAL ROLE authenticated`;
    await tx`SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true)`;
    if (child === 'riga') await tx`UPDATE public.righe_preventivo SET descrizione='lock test' WHERE id=${rigaId}`;
    else await tx`UPDATE public.blocchi_preventivo SET descrizione='lock test' WHERE id=${bloccoId}`;
    // FOR SHARE è compatibile con un altro FOR SHARE, ma non con il FOR UPDATE della registrazione.
    await b.begin(async probe => {
      const rows = await probe`SELECT id FROM public.preventivi WHERE id=${ordineId} FOR SHARE NOWAIT`;
      assert.equal(rows.length, 1); prove++;
    });
    if (tipo === 'ordine') {
      await assert.rejects(b.begin(async probe => {
        await probe`SELECT id FROM public.preventivi WHERE id=${ordineId} FOR UPDATE NOWAIT`;
      }), (err: unknown) => err instanceof postgres.PostgresError && err.code === '55P03');
    } else {
      await b.begin(async probe => {
        const rows = await probe`SELECT id FROM public.preventivi WHERE id=${ordineId} FOR UPDATE NOWAIT`;
        assert.equal(rows.length, 1);
      });
    }
    prove++;
    console.log(`PASS ${child} ${tipo}: SHARE compatibile, UPDATE ${tipo === 'ordine' ? 'bloccato' : 'libero'}`);
  });
}

try {
  // Fixture sintetiche soltanto nel clone: rese visibili alla seconda connessione, rimosse nel finally.
  await a.begin(async tx => {
    await tx`INSERT INTO public.preventivi(id,tipo,numero) VALUES
      (${ordine},'ordine','FM96-LOCK-ORD'),(${preventivo},'preventivo','FM96-LOCK-PRV')`;
    await tx`INSERT INTO public.blocchi_preventivo(id,preventivo_id) VALUES
      (${bloccoOrdine},${ordine}),(${bloccoPreventivo},${preventivo})`;
    await tx`INSERT INTO public.righe_preventivo(id,blocco_id) VALUES
      (${rigaOrdine},${bloccoOrdine}),(${rigaPreventivo},${bloccoPreventivo})`;
  });
  for (const child of ['riga', 'blocco'] as const)
    for (const tipo of ['ordine', 'preventivo'] as const) await lockTest(child, tipo);
  // Direzione inversa: testata già sotto FOR UPDATE (come registra_esportazione_gamma).
  await annullata(async tx => {
    await tx`SELECT id FROM public.preventivi WHERE id IN (${ordine},${preventivo}) FOR UPDATE`;
    await b.begin(async probe => {
      await probe`SET LOCAL ROLE authenticated`;
      await probe`SET LOCAL lock_timeout = '150ms'`;
      await probe`SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true)`;
      const rows = await probe`UPDATE public.righe_preventivo SET descrizione='libera' WHERE id=${rigaPreventivo} RETURNING id`;
      assert.equal(rows.length, 1); prove++;
      throw rollback;
    }).catch(err => { if (err !== rollback) throw err; });
    await assert.rejects(b.begin(async probe => {
      await probe`SET LOCAL ROLE authenticated`;
      await probe`SET LOCAL lock_timeout = '150ms'`;
      await probe`SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true)`;
      await probe`UPDATE public.righe_preventivo SET descrizione='attende' WHERE id=${rigaOrdine}`;
    }), (err: unknown) => err instanceof postgres.PostgresError && err.code === '55P03');
    prove++;
  });
  console.log(`PASS ${prove} verifiche concorrenti; modifiche annullate`);
} finally {
  await a.begin(async tx => {
    await tx`DELETE FROM public.righe_preventivo WHERE id IN (${rigaOrdine},${rigaPreventivo})`;
    await tx`DELETE FROM public.blocchi_preventivo WHERE id IN (${bloccoOrdine},${bloccoPreventivo})`;
    await tx`DELETE FROM public.preventivi WHERE id IN (${ordine},${preventivo})`;
  });
  await a.end(); await b.end();
}