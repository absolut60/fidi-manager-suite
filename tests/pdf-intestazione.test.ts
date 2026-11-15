import { expect, test } from 'bun:test';

// Processo isolato: non altera i mock condivisi della suite.
test('tutti i PDF omettono filiale e agente assente, conservando l’agente presente', async () => {
  const script = `
    import { mock } from 'bun:test';
    mock.module('@/integrations/supabase/client', () => ({ supabase: {} }));
    const pdf = await import('./src/lib/pdf-export.ts');
    const base = { numero:'PRV-167/26', data:'2026-11-15', validita:null, tipo:'preventivo', linea:'showroom', store_id:null, filiale:'LISSONE', cliente:null, lead:{ragione_sociale:'PIPPO SRL'}, cantiere:null, blocchi:[], iva_perc:22, sconto_piede_perc:0, regime_iva:'ordinaria' };
    for (const fn of [pdf.exportPreventivoPdf,pdf.exportPropostaRapidaPdf,pdf.exportListaMaterialiPdf,pdf.exportListaFornitorePdf]) {
      for (const presente of [false,true]) {
        const result = await fn({...base,agente:presente?{nome:'AGENTE TEST'}:null});
        const text = await result.blob.text();
        if(text.includes('(FILIALE)') || text.includes('(LISSONE)')) throw Error('Filiale stampata');
        if(text.includes('(AGENTE)') !== presente) throw Error('Agente opzionale non rispettato');
        if(presente && !text.includes('(AGENTE TEST)')) throw Error('Nome agente perso');
      }
    }
  `;
  const p = Bun.spawn(['bun', '-e', script], { cwd:process.cwd(), stdout:'pipe', stderr:'pipe' });
  const err = await new Response(p.stderr).text();
  expect(await p.exited, err).toBe(0);
});
