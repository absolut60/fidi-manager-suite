import { expect, test } from 'bun:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { datiBrandingPdf, caricaBrandingPdf, dimensioniLogoPdf } from '@/lib/branding-pdf';

const sede = { nome: 'SEDE TEST', insegna: 'TEST | MADE', indirizzo: 'Via Test 1', cap: '20000', citta: 'Test', provincia: 'MI', telefono: '02 123', email_sede: 'sede@example.test', logo_pdf_path: 'sedi/test/logo-pdf.png' };
function client(options: { sede?: typeof sede | null; fail?: boolean; blob?: Blob; throws?: boolean } = {}) {
  const calls: string[] = [];
  const c = { from(table: string) { calls.push(table); return { select(fields: string) { calls.push(fields); return { eq(key: string, value: string) { calls.push(`${key}:${value}`); return { async maybeSingle() { if (options.throws) throw Error('negato'); return { data: options.sede === undefined ? sede : options.sede, error: null }; } }; } }; } }; },
    storage: { from(bucket: string) { calls.push(bucket); return { async download(path: string) { calls.push(path); if (options.throws) throw Error('negato'); return { data: options.blob ?? new Blob([new Uint8Array([137,80,78,71,13,10,26,10])]), error: options.fail ? { message: 'negato' } : null }; } }; } } } as unknown as SupabaseClient<Database>;
  return { c, calls };
}
test('senza sede: nessuna lettura, nessun logo o piede inventato', async () => {
  const { c, calls } = client();
  expect(await caricaBrandingPdf({ store_id: null }, c)).toEqual(datiBrandingPdf(null));
  expect(calls).toEqual([]);
  expect(datiBrandingPdf(null).rigaSede).toBe('');
});
test('sede storica senza logo e contatti: header e piede originali', () => {
  const dati = datiBrandingPdf({ nome: 'SEDE', indirizzo: 'Via Test', telefono: null, email_sede: null });
  expect(dati.logoPdfBytes).toBeNull();
  expect(dati.rigaSede).toBe('');
});
test('riga sede: campi presenti senza valori sostitutivi', () => {
  expect(datiBrandingPdf(sede).rigaSede).toBe('SEDE TEST — TEST | MADE — Via Test 1, 20000 Test (MI) — Tel. 02 123 — sede@example.test');
  expect(datiBrandingPdf({ nome: 'SEDE', telefono: ' 02 123 ', cap: '20000' }).rigaSede).toBe('SEDE — 20000 — Tel. 02 123');
  expect(datiBrandingPdf({ email_sede: 'email@example.test' }).rigaSede).toBe('email@example.test');
});
test('la sede è solo store_id del preventivo: una lettura e un download privato', async () => {
  const { c, calls } = client();
  const dati = await caricaBrandingPdf({ store_id: 'sede-preventivo' }, c);
  expect(Array.from(dati.logoPdfBytes ?? [])).toEqual([137,80,78,71,13,10,26,10]);
  expect(calls).toEqual(['stores', 'nome, insegna, indirizzo, cap, citta, provincia, telefono, email_sede, logo_pdf_path', 'id:sede-preventivo', 'branding', 'sedi/test/logo-pdf.png']);
});
test('lettura sede negata: ripiego completo; download negato o PNG errato: solo logo originale', async () => {
  expect(await caricaBrandingPdf({ store_id: 'test' }, client({ sede: null }).c)).toEqual(datiBrandingPdf(null));
  expect(await caricaBrandingPdf({ store_id: 'test' }, client({ throws: true }).c)).toEqual(datiBrandingPdf(null));
  for (const options of [{ fail: true }, { blob: new Blob(['non PNG']) }, { blob: new Blob([new Uint8Array(1048577)]) }]) {
    const dati = await caricaBrandingPdf({ store_id: 'test' }, client(options).c);
    expect(dati.logoPdfBytes).toBeNull();
    expect(dati.rigaSede).toBe(datiBrandingPdf(sede).rigaSede);
  }
});
test('logo quadrato o largo: proporzioni originali e area utile esistente per ogni tipo', () => {
  for (const tipo of ['sistema', 'fidimanager'] as const) {
    const max = tipo === 'sistema' ? 20.2 : 13.4;
    for (const [w,h] of [[100,100],[490,69],[2000,10],[10,2000]]) {
      const area = dimensioniLogoPdf(w,h,tipo);
      expect(area).not.toBeNull();
      if (!area) throw Error('dimensioni mancanti');
      expect(area.width / area.height).toBeCloseTo(w / h, 8);
      expect(area.width).toBeLessThanOrEqual(95);
      expect(area.height).toBeLessThanOrEqual(max);
    }
  }
  expect(dimensioniLogoPdf(0,100,'sistema')).toBeNull();
  expect(dimensioniLogoPdf(100,NaN,'sistema')).toBeNull();
});
