import { expect, test } from 'bun:test';
import { rendiCondizioniVendita, titoloCondizioniVendita, chiaveCondizioniVendita } from '../src/lib/condizioni-vendita';

test('FM98 validità presente: sostituisce tutte le occorrenze, nessun altro segnaposto', () => {
  expect(rendiCondizioniVendita('Fino al {{validita}}, ancora {{validita}}; {{altro}}', { validita: '2026-12-23' }))
    .toBe('Fino al 23/12/2026, ancora 23/12/2026; {{altro}}');
});
test('FM98 validità assente: indicata nel preventivo', () => {
  expect(rendiCondizioniVendita('Fino al {{validita}}', { validita: null })).toBe('Fino al indicata nel preventivo');
});
test('FM98 titoli: non vuoti, nessuna minuscola, massimo 60 caratteri', () => {
  expect(titoloCondizioniVendita('  VALIDITÀ  ')).toBe(true);
  expect(titoloCondizioniVendita('A'.repeat(60))).toBe(true);
  for (const riga of ['', '  ', 'Consegna', 'VALIDITà', 'A'.repeat(61)]) expect(titoloCondizioniVendita(riga)).toBe(false);
});
test('FM98 chiave unica per tutte le linee', () => {
  expect(chiaveCondizioniVendita('showroom')).toBe('condizioni_vendita_showroom');
  expect(chiaveCondizioniVendita('sistema_made')).toBe('condizioni_vendita_sistema_made');
});

test('FM98 PDF reali: testo non vuoto, numerazione completa, liste interne escluse, nessun disclaimer', async () => {
  const script = `
    import { mock } from 'bun:test';
    let condizioni='', letture=0, errore=false;
    mock.module('@/integrations/supabase/client', () => ({supabase:{from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>{letture++; return {data:condizioni===null?null:{valore:condizioni},error:errore?new Error('lettura negata'):null}}})})})}}));
    const pdf=await import('./src/lib/pdf-export.ts');
    const base={numero:'PRV-TEST/26',data:'2026-11-23',validita:'2026-12-23',tipo:'preventivo',linea:'showroom',store_id:null,filiale:null,cliente:null,lead:{ragione_sociale:'Cliente prova'},cantiere:null,agente:null,blocchi:[],iva_perc:22,sconto_piede_perc:0,regime_iva:'ordinaria'};
    function check(ok, msg){if(!ok) throw Error(msg)}
    for(const [name,fn] of [['preventivo',pdf.exportPreventivoPdf],['rapida',pdf.exportPropostaRapidaPdf]]) {
      for(const testo of [null,'','   ']) {
        condizioni=testo; letture=0;
        const r=await fn(base); const raw=await r.blob.text();
        check(letture===1,'lettura non unica');
        check(raw.includes('(Pag. 1 / 1)'),'PDF vuoto deve restare una pagina');
        check(!raw.includes('CONDIZIONI DI VENDITA'),'condizioni vuote stampate');
        check(!raw.includes('franco filiale')&&!raw.includes('Salvo errori'),'disclaimer rimasto');
      }
      condizioni='DECORRENZA\\nFino al {{validita}}.\\n\\nPAGAMENTI\\nTermini concordati.'; letture=0;
      const r=await fn(base); const raw=await r.blob.text();
      check(letture===1,'lettura non unica');
      check(raw.includes('(Pag. 1 / 2)')&&raw.includes('(Pag. 2 / 2)'),'condizioni escluse dalla numerazione');
      check(raw.includes('(Fino al 23/12/2026.)'),'validita non resa');
      check(!raw.includes('franco filiale')&&!raw.includes('Salvo errori'),'disclaimer rimasto');
      await Bun.write('/tmp/browser/fm98-'+name+'.pdf',r.blob);
      const agev=await fn({...base,regime_iva:'agevolata_10'});
      check((await agev.blob.text()).includes('(Pag. 2 / 2)'),'condizioni mancanti ramo IVA');
      const ordine=await fn({...base,tipo:'ordine',validita:null});
      check((await ordine.blob.text()).includes('(Fino al indicata nel preventivo.)'),'ordine senza data');
      condizioni=Array.from({length:230},(_,i)=>'Riga lunga delle condizioni numero '+i+' per verifica del salto pagina.').join('\\n');
      const multi=await fn(base); const multiRaw=await multi.blob.text();
      const pages=[...multiRaw.matchAll(/\\(Pag\\. (\\d+) \\/ (\\d+)\\)/g)];
      check(pages.length>2,'mancato salto pagina');
      check(pages.every((m,i)=>Number(m[1])===i+1&&Number(m[2])===pages.length),'numerazione multipagina errata');
      check(multiRaw.includes('numero 229'),'testo finale perso');
      await Bun.write('/tmp/browser/fm98-'+name+'-multi.pdf',multi.blob);
      errore=true;
      const negato=await fn(base);
      check((await negato.blob.text()).includes('(Pag. 1 / 1)'),'errore lettura blocca il PDF');
      errore=false;
    }
    condizioni='CONDIZIONI DI VENDITA';
    for(const fn of [pdf.exportListaMaterialiPdf,pdf.exportListaFornitorePdf]) {
      letture=0; const r=await fn(base); const raw=await r.blob.text();
      check(letture===0&&!raw.includes('CONDIZIONI DI VENDITA'),'lista interna modificata');
    }
  `;
  const p = Bun.spawn(['bun', '-e', script], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  const stderr = await new Response(p.stderr).text();
  expect(await p.exited, stderr).toBe(0);
});

test('FM98 salvataggio crea/aggiorna la chiave e registra autore, rifiuto propagato', async () => {
  const script = `
    import {mock} from 'bun:test';
    mock.module('@/integrations/supabase/client',()=>({supabase:{}}));
    const {salvaCondizioniVendita}=await import('./src/lib/condizioni-vendita.ts');
    let payload, opzioni, errore=false;
    const client={from:table=>{if(table!=='configurazioni') throw Error('tabella errata');return {upsert:(p,o)=>{payload=p;opzioni=o;return {select:()=>({single:async()=>({data:errore?null:{chiave:p.chiave},error:errore?new Error('negato'):null})})}}}}};
    await salvaCondizioniVendita('showroom','Showroom','Testo prova','autore-test',client);
    if(payload.chiave!=='condizioni_vendita_showroom'||payload.updated_by!=='autore-test'||payload.valore!=='Testo prova'||opzioni.onConflict!=='chiave'||!payload.updated_at) throw Error('persistenza errata');
    errore=true;let rifiutato=false;try{await salvaCondizioniVendita('showroom','Showroom','Nuovo','autore-test',client)}catch{rifiutato=true}
    if(!rifiutato) throw Error('errore nascosto');
  `;
  const p = Bun.spawn(['bun', '-e', script], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  const stderr = await new Response(p.stderr).text();
  expect(await p.exited, stderr).toBe(0);
});