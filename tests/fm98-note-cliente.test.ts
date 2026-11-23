import { expect, test } from 'bun:test';
import { aggiungiNotaCliente, campiNotaLibreria, puoLeggereLibreria, puoInserireLibreria, puoGestireNotaLibreria, type UtenteNote } from '../src/lib/note-preventivo';

const nota = { linea: 'showroom' as const, creato_da: 'altro' };
const utente = (roles: string[], linee: UtenteNote['linee'] = ['showroom'], id: string | null = 'utente'): UtenteNote => ({ id, roles, linee });
test('amministratore legge e gestisce tutte le linee senza abilitazione', () => {
  const u = utente(['amministratore'], []);
  expect(puoLeggereLibreria(u, 'showroom')).toBe(true);
  expect(puoInserireLibreria(u, 'showroom')).toBe(true);
  expect(puoGestireNotaLibreria(u, nota)).toBe(true);
});
test('store manager legge tutte le linee ma non inserisce né gestisce note altrui', () => {
  const u = utente(['store_manager'], []);
  expect(puoLeggereLibreria(u, 'showroom')).toBe(true);
  expect(puoInserireLibreria(u, 'showroom')).toBe(false);
  expect(puoGestireNotaLibreria(u, nota)).toBe(false);
});
for (const r of ['preventivi_manage', 'preventivi_write', 'preventivi_read', 'showroom', 'responsabile_showroom']) {
  test(`${r}: lettura limitata alla linea abilitata`, () => {
    expect(puoLeggereLibreria(utente([r]), 'showroom')).toBe(true);
    expect(puoLeggereLibreria(utente([r], ['sistema_made']), 'showroom')).toBe(false);
  });
}
test('preventivi_write inserisce ma gestisce solo le proprie note', () => {
  const u = utente(['preventivi_write']);
  expect(puoInserireLibreria(u, 'showroom')).toBe(true);
  expect(puoGestireNotaLibreria(u, nota)).toBe(false);
  expect(puoGestireNotaLibreria(u, { ...nota, creato_da: u.id })).toBe(true);
  expect(puoGestireNotaLibreria(utente(['preventivi_write'], []), { ...nota, creato_da: u.id })).toBe(false);
});
for (const r of ['preventivi_manage', 'responsabile_showroom']) {
  test(`${r}: inserisce e gestisce note altrui solo nella propria linea`, () => {
    expect(puoInserireLibreria(utente([r]), 'showroom')).toBe(true);
    expect(puoGestireNotaLibreria(utente([r]), nota)).toBe(true);
    expect(puoInserireLibreria(utente([r], []), 'showroom')).toBe(false);
    expect(puoGestireNotaLibreria(utente([r], []), nota)).toBe(false);
  });
}
for (const r of ['showroom', 'preventivi_read']) {
  test(`${r}: solo lettura delle note altrui`, () => {
    expect(puoInserireLibreria(utente([r]), 'showroom')).toBe(false);
    expect(puoGestireNotaLibreria(utente([r]), nota)).toBe(false);
  });
}
test('utente senza preventivi e anon non accedono alla libreria', () => {
  for (const u of [utente(['direzione']), utente([], [], null)]) {
    expect(puoLeggereLibreria(u, 'showroom')).toBe(false);
    expect(puoInserireLibreria(u, 'showroom')).toBe(false);
    expect(puoGestireNotaLibreria(u, nota)).toBe(false);
  }
});
test('inserimento dalla libreria su testo vuoto', () => {
  for (const vuoto of ['', '  ', null, undefined]) expect(aggiungiNotaCliente(vuoto, 'Consegna concordata')).toBe('Consegna concordata');
});
test('inserimento dalla libreria su testo esistente: riga vuota e testo originale', () => {
  expect(aggiungiNotaCliente('Prima nota\n', 'Seconda\n\nTerza')).toBe('Prima nota\n\nSeconda\n\nTerza');
});
test('titolo obbligatorio, massimo 120 e testo non vuoto', () => {
  expect(campiNotaLibreria(' A '.repeat(1), 'Riga\n\nRiga')).toEqual({ titolo: 'A', testo: 'Riga\n\nRiga' });
  expect(campiNotaLibreria('A'.repeat(120), 'Testo').titolo.length).toBe(120);
  expect(() => campiNotaLibreria('A'.repeat(121), 'Testo')).toThrow();
  expect(() => campiNotaLibreria('  ', 'Testo')).toThrow();
  expect(() => campiNotaLibreria('Titolo', ' \n ')).toThrow();
});

async function esegui(script: string) {
  const p = Bun.spawn(['bun', '-e', script], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  const err = await new Response(p.stderr).text();
  expect(await p.exited, err).toBe(0);
}
test('API libreria: nuova, aggiorna nella linea, errori propagati e cancellazione verificata', async () => {
  await esegui(`
    import {mock} from 'bun:test'; mock.module('@/integrations/supabase/client',()=>({supabase:{}}));
    const api=await import('./src/lib/note-preventivo.ts');
    let op,payload,filters=[],fail=false,count=1;
    const q={eq:(k,v)=>{filters.push([k,v]);return q},in:(k,v)=>{filters.push([k,v]);return q},select:()=>q,single:async()=>({data:payload,error:fail?new Error('negato'):null}),then:(ok)=>Promise.resolve({error:null,count}).then(ok)};
    const client={from:t=>{if(t!=='note_preventivo_libreria')throw Error('tabella errata');return {insert:p=>{op='insert';payload=p;return q},update:p=>{op='update';payload=p;return q},delete:()=>q}}};
    await api.salvaNotaLibreria('showroom',{titolo:' Posa ',testo:'Testo'},'autore',client);
    if(op!=='insert'||payload.creato_da!=='autore'||payload.aggiornato_da!=='autore'||payload.linea!=='showroom'||payload.titolo!=='Posa') throw Error('nuova errata');
    filters=[];await api.salvaNotaLibreria('showroom',{id:'nota',titolo:'Nuovo',testo:'Parte'},'autore',client);
    if(op!=='update'||'creato_da' in payload||'linea' in payload||JSON.stringify(filters)!==JSON.stringify([['id','nota'],['linea','showroom']]))throw Error('aggiornamento errato');
    fail=true;let denied=false;try{await api.salvaNotaLibreria('showroom',{titolo:'Prova',testo:'Parte'},'autore',client)}catch{denied=true}if(!denied)throw Error('errore nascosto');
    if((await api.eliminaNotaLibreria('nota',client)).tipo!=='eliminato')throw Error('elimina fallito');count=0;if((await api.eliminaNotaLibreria('nota',client)).tipo!=='permessi')throw Error('falso successo');
  `);
});
test('duplicaPreventivo e alternative copiano note cliente senza alterare note interne o validità', async () => {
  await esegui(`
    import {mock} from 'bun:test';let payload;
    const src={id:'origine',tipo:'preventivo',linea:'showroom',cliente_id:null,lead_id:null,blocchi:[],note:'INTERNE',note_cliente:'CLIENTE\\n\\nConsegna',validita:'2026-12-23',cantiere_id:null,agente_codice:null,alternativa_di:null};
    const client={auth:{getUser:async()=>({data:{user:{id:'utente'}},error:null})},from:t=>{
      const q={select:()=>q,eq:()=>q,order:()=>q,single:async()=>({data:t==='profili'?{store_id:'sede'}:t==='stores'?{id:'sede',nome:'Sede prova'}:payload?{...payload,id:'copia',numero:'PRV-PROVA/26'}:structuredClone(src),error:null}),insert:p=>{payload=p;return q},then:ok=>Promise.resolve({data:[],error:null}).then(ok)};return q;
    }};mock.module('@/integrations/supabase/client',()=>({supabase:client}));
    const api=await import('./src/lib/preventivi-api.ts');
    for(const mode of ['stesso_cliente','alternativa']){payload=null;await api.duplicaPreventivo('origine',{mode});if(payload.note_cliente!==src.note_cliente||payload.note!=='INTERNE'||payload.validita!==src.validita||payload.alternativa_di!==(mode==='alternativa'?'origine':null))throw Error('copia errata '+mode);}
  `);
});
test('PDF cliente: note dopo totale, condizioni dopo note, vuote identiche e note lunghe complete', async () => {
  await esegui(`
    import {mock} from 'bun:test';let condizioni='CONDIZIONI\\nTermini concordati.';
    mock.module('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{valore:condizioni},error:null})})})})}}));
    const pdf=await import('./src/lib/pdf-export.ts');
    const base={numero:'PRV-PROVA/26',data:'2026-11-23',validita:'2026-12-23',tipo:'preventivo',linea:'sistema_made',store_id:null,filiale:null,cliente:null,lead:{ragione_sociale:'Cliente prova'},cantiere:null,agente:null,blocchi:[],iva_perc:22,sconto_piede_perc:0,regime_iva:'ordinaria'};
    const clean=s=>s.replace(/\\/ID\\s*\\[\\s*<[^>]*>\\s*<[^>]*>\\s*\\]/g,'ID').replace(/\\/CreationDate \\([^)]*\\)/g,'DATE');
    for(const [nome,extra] of [['made',{}],['showroom',{linea:'showroom'}],['ordine',{tipo:'ordine',validita:null}],['agevolato',{linea:'showroom',regime_iva:'agevolata_10_bs'}]]){
      for(const [formato,fn] of [['ufficiale',pdf.exportPreventivoPdf],['rapida',pdf.exportPropostaRapidaPdf]]){
        const p={...base,...extra};const vuoto=await fn(p);await Bun.write('/tmp/browser/fm98-f3/dopo-'+nome+'-'+formato+'.pdf',vuoto.blob);
        for(const note_cliente of [null,'','   ']){const out=await fn({...p,note_cliente});if(clean(await out.blob.text())!==clean(await vuoto.blob.text()))throw Error('PDF vuoto diverso '+nome);}
        const out=await fn({...p,note_cliente:'NOTA CLIENTE PRIMA\\n\\nNOTA CLIENTE SECONDA',note:'SEGRETO INTERNO'});const raw=await out.blob.text();
        if(raw.indexOf('(Totale con IVA)')>raw.indexOf('(Note)')||raw.indexOf('NOTA CLIENTE PRIMA')>raw.indexOf('CONDIZIONI DI VENDITA')||raw.includes('SEGRETO INTERNO')||!raw.includes('NOTA CLIENTE SECONDA'))throw Error('ordine stampa errato');
        await Bun.write('/tmp/browser/fm98-f3/note-'+nome+'-'+formato+'.pdf',out.blob);
      }
    }
    for(const [nome,fn] of [['ufficiale',pdf.exportPreventivoPdf],['rapida',pdf.exportPropostaRapidaPdf]]){
      const out=await fn({...base,note_cliente:Array.from({length:250},(_,i)=>'NOTA '+i+' consegna concordata cliente').join('\\n')});const raw=await out.blob.text();const pages=[...raw.matchAll(/\\(Pag\\. (\\d+) \\/ (\\d+)\\)/g)];
      if(pages.length<5||!raw.includes('(NOTA 249 consegna concordata cliente)')||!pages.every((m,i)=>+m[1]===i+1&&+m[2]===pages.length)||raw.lastIndexOf('NOTA 249')>raw.indexOf('CONDIZIONI DI VENDITA'))throw Error('multipagina errato');
      await Bun.write('/tmp/browser/fm98-f3/note-lunghe-'+nome+'.pdf',out.blob);
    }
    for(const fn of [pdf.exportListaMaterialiPdf,pdf.exportListaFornitorePdf]){const out=await fn({...base,note_cliente:'NON STAMPARE NOTE'});if((await out.blob.text()).includes('NON STAMPARE NOTE'))throw Error('lista interna modificata');}
  `);
});