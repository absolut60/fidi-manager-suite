import { expect, test } from 'bun:test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/integrations/supabase/types';
import { caricaDatiEsportazioneGamma } from '../src/lib/esportazione-gamma-dati';
import { costruisciEsportazioneGamma } from '../src/lib/esportazione-gamma';
import { scriviFileGammaXls } from '../src/lib/esportazione-gamma-file';
import * as XLSX from 'xlsx';

type RecordTest = Record<string, unknown>;
function sorgente(numeroRighe = 2) {
  const dati: Record<string, RecordTest[]> = {
    preventivi: [{ id: 'o1', tipo: 'ordine', numero: 'ORD-1/26', store_id: 's1', cliente_id: 'c1', preventivo_origine_id: 'p1' },
      { id: 'o2', tipo: 'ordine', numero: 'ORD-2/26', store_id: 's2', lead_id: 'l1', condizione_pagamento_cod: 'BO02' },
      { id: 'p1', tipo: 'preventivo', numero: 'PRV-1/26' }],
    blocchi_preventivo: [{ id: 'b1', preventivo_id: 'o1', ordine: 0 }, { id: 'b2', preventivo_id: 'o2', ordine: 0 }],
    righe_preventivo: Array.from({ length: numeroRighe }, (_, i) => ({ id: `r${String(i).padStart(5, '0')}`, blocco_id: i % 2 ? 'b2' : 'b1', ordine: i,
      tipo_riga: 'articolo_singolo', articolo_codice: i % 2 ? 'G2' : 'G1', quantita: 1, prezzo_unit: 20, descrizione: 'Articolo' })),
    articoli_gamma: [{ codice: 'G1', fornitore_pref_id: 'f1', um: 'MQ' }, { codice: 'G2', fornitore_pref_id: 'f2', um: 'MQ' }],
    articoli_gamma_listini: [{ articolo_codice: 'G1', listino: 10, acq_prezzo: 8 }, { articolo_codice: 'G2', listino: 20, acq_prezzo: 9 },
      { articolo_codice: 'G1', listino: 20, acq_prezzo: 80 }, { articolo_codice: 'G2', listino: 10, acq_prezzo: 90 }],
    clienti: [{ id: 'c1', codice_gestionale: '5003', ragione_sociale: 'Cliente' }],
    lead: [{ id: 'l1', ragione_sociale: 'Lead', store_id: 's3', listino_rif: 10 }],
    stores: [{ id: 's1', codice: 'LI', listino_riferimento: 10 }, { id: 's2', codice: 'ME', listino_riferimento: 20 }, { id: 's3', codice: 'CI' }],
    depositi: [{ codice: 'LI01', store_id: 's1', tipo: 'Centrale', attivo: true }, { codice: 'ME01', store_id: 's2', tipo: 'Centrale', attivo: true }],
    fornitori: [{ id: 'f1', codice_gestionale: 100 }, { id: 'f2', codice_gestionale: 200 }],
    codici_pagamento: [{ cod: 'BO02', descrizione: 'Bonifico' }],
  };
  const richieste: URL[] = [];
  let erroreTabella = '';
  const client = createClient<Database>('https://gamma-test.invalid', 'test-key', { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input)); richieste.push(url);
      const tabella = url.pathname.split('/').at(-1) ?? '';
      if (tabella === erroreTabella) return new Response(JSON.stringify({ message: 'lettura negata', code: '42501' }), { status: 403 });
      let rows = [...(dati[tabella] ?? [])];
      for (const [campo, filtro] of url.searchParams) {
        if (filtro.startsWith('in.(')) {
          const valori = filtro.slice(4, -1).split(',').map(v => v.replace(/^"|"$/g, ''));
          rows = rows.filter(r => valori.includes(String(r[campo])));
        } else if (filtro.startsWith('eq.')) rows = rows.filter(r => String(r[campo]) === filtro.slice(3));
      }
      const order = url.searchParams.get('order')?.split('.')[0];
      if (order) rows.sort((a, b) => String(a[order]).localeCompare(String(b[order])));
      const headers = new Headers(init?.headers); const range = headers.get('range')?.split('-').map(Number);
      const offset = Number(url.searchParams.get('offset') ?? range?.[0] ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? (range ? Number(range[1]) - offset + 1 : 1000));
      return new Response(JSON.stringify(rows.slice(offset, offset + limit)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } } });
  return { dati, richieste, client, errore: (tabella: string) => { erroreTabella = tabella; } };
}

test('Gamma letture: a blocchi, coppie articolo/listino solo necessarie e sede lead separata', async () => {
  const s = sorgente(); const d = await caricaDatiEsportazioneGamma(['o1', 'o2', 'o1'], s.client);
  expect(d).toHaveLength(2); expect(d[0]?.listiniAcquisto).toEqual([{ articolo_codice: 'G1', listino: 10, acq_prezzo: 8 }]);
  expect(d[1]?.listiniAcquisto).toEqual([{ articolo_codice: 'G2', listino: 20, acq_prezzo: 9 }]);
  expect(d[1]?.sedeLead?.codice).toBe('CI'); expect(d[0]?.preventivoOrigine?.numero).toBe('PRV-1/26');
  const listini = s.richieste.filter(u => u.pathname.endsWith('/articoli_gamma_listini'));
  expect(listini.map(u => [u.searchParams.get('listino'), u.searchParams.get('articolo_codice')])).toEqual([
    ['eq.10', 'in.(G1)'], ['eq.20', 'in.(G2)'],
  ]);
  expect(s.richieste.find(u => u.pathname.endsWith('/codici_pagamento'))?.searchParams.get('cod')).toBe('in.(BO02)');
});
test('Gamma letture: sede senza listino di riferimento legge il ripiego 20 (Mergozzo)', async () => {
  const s = sorgente();
  s.dati['preventivi'] = [...(s.dati['preventivi'] ?? []), { id: 'o3', tipo: 'ordine', numero: 'ORD-3/26', store_id: 's3', cliente_id: 'c1' }];
  s.dati['blocchi_preventivo'] = [...(s.dati['blocchi_preventivo'] ?? []), { id: 'b3', preventivo_id: 'o3', ordine: 0 }];
  s.dati['righe_preventivo'] = [{ id: 'r00003', blocco_id: 'b3', ordine: 0, tipo_riga: 'articolo_singolo', articolo_codice: 'G1', quantita: 1, prezzo_unit: 20, descrizione: 'Articolo' }];
  const d = await caricaDatiEsportazioneGamma(['o3'], s.client);
  expect(d[0]?.listiniAcquisto).toEqual([{ articolo_codice: 'G1', listino: 20, acq_prezzo: 80 }]);
  const listini = s.richieste.filter(u => u.pathname.endsWith('/articoli_gamma_listini'));
  expect(listini.map(u => [u.searchParams.get('listino'), u.searchParams.get('articolo_codice')])).toEqual([['eq.20', 'in.(G1)']]);
});
test('Gamma letture: oltre 1000 righe nessuna perdita né lettura per riga', async () => {
  const s = sorgente(1205); const d = await caricaDatiEsportazioneGamma(['o1', 'o2'], s.client);
  expect(d.reduce((somma, o) => somma + o.righe.length, 0)).toBe(1205);
  expect(s.richieste.filter(u => u.pathname.endsWith('/righe_preventivo'))).toHaveLength(2);
  expect(s.richieste.filter(u => u.pathname.endsWith('/articoli_gamma'))).toHaveLength(1);
  expect(s.richieste.filter(u => u.pathname.endsWith('/fornitori'))).toHaveLength(1);
});
test('Gamma letture: 151 ordini divisi in blocchi 150, ID duplicati eliminati', async () => {
  const s = sorgente(0); s.dati['preventivi'] = Array.from({ length: 151 }, (_, i) => ({ id: `o${i}`, numero: `ORD-${i}/26`, tipo: 'ordine' }));
  const ids = s.dati['preventivi'].map(r => String(r['id']));
  expect(await caricaDatiEsportazioneGamma([...ids, 'o1'], s.client)).toHaveLength(151);
  const q = s.richieste.filter(u => u.pathname.endsWith('/preventivi'));
  expect(q).toHaveLength(2); expect(q[0]?.searchParams.get('id')?.split(',')).toHaveLength(150);
  expect(q[1]?.searchParams.get('id')).toBe('in.(o150)');
});
test('Gamma letture: errore non trasformato in catalogo vuoto', async () => {
  const s = sorgente(); s.errore('articoli_gamma_listini');
  await expect(caricaDatiEsportazioneGamma(['o1'], s.client)).rejects.toThrow('lettura negata');
});
test('Gamma letture: ordini nascosti/mancanti e documenti non ordine rifiutati', async () => {
  const s = sorgente(); await expect(caricaDatiEsportazioneGamma(['o1', 'nascosto'], s.client)).rejects.toThrow('non sono visibili');
  await expect(caricaDatiEsportazioneGamma(['p1'], s.client)).rejects.toThrow('non sono visibili');
});
test('Gamma letture: lista vuota non fa richieste', async () => {
  const s = sorgente(); expect(await caricaDatiEsportazioneGamma([], s.client)).toEqual([]); expect(s.richieste).toEqual([]);
});
test('Gamma flusso completo: lettura → motore → XLS → rilettura con prezzi delle due sedi', async () => {
  const s = sorgente(); const e = costruisciEsportazioneGamma(await caricaDatiEsportazioneGamma(['o1', 'o2'], s.client));
  expect(e.ordiniEsportati).toEqual(['o1', 'o2']); expect(e.ordiniBloccati).toEqual([]);
  const wb = XLSX.read(scriviFileGammaXls(e.righe), { type: 'array' }); const ws = wb.Sheets['Sheet1'];
  if (!ws) throw new Error('Sheet1 assente');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  expect(rows.filter(r => r['CODICE_DOCUMENTO'] === 'MD-F-ORDINE' && r['TESTATA_RIGHE'] === 'R').map(r => r['PRZ1'])).toEqual([8, 9]);
});