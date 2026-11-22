import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
async function esegui(codice: string) {
  const script = `import {mock} from 'bun:test';mock.module('@/integrations/supabase/client',()=>({supabase:{}}));
    const {modoEditorGamma,fetchStoricoGamma,fetchEventiGamma,riapriOrdineGamma,preparaDownloadGamma,DURATA_URL_GAMMA}=await import('./src/lib/esportazioni-gamma-storico');
    const {puoEsportareGamma}=await import('./src/lib/esportazione-gamma');const assert=(v,m)=>{if(!v)throw Error(m)};
    const calls=[];let pages=0;const client={from:t=>{const q={};for(const m of ['select','order','gte','lt','eq','is'])q[m]=(...a)=>{calls.push([t,m,...a]);return q};q.range=(...a)=>{calls.push([t,'range',...a]);pages++;return q};q.then=r=>r({data:pages===1?Array.from({length:500},(_,i)=>({id:'id'+i})):[{id:'last'}],error:null});return q}};
    ${codice}`;
  const p = Bun.spawn(['bun', '-e', script], { stdout: 'pipe', stderr: 'pipe' });
  const err = await new Response(p.stderr).text();
  expect(await p.exited, err).toBe(0);
}
test('FM96 esportato disabilita tutti i gate editor; riaperto recupera quelli preesistenti', () => esegui(`
  const e={tipo:'ordine',stato:'bozza',esportato_gamma_at:'2026-11-22T19:00:00Z'};
  const m=modoEditorGamma(e,true);assert(m.bloccato&&!m.modificabile&&!m.statoEditabile&&!m.salva,'sola lettura');
  const r=modoEditorGamma({...e,esportato_gamma_at:null},true);assert(!r.bloccato&&r.statoEditabile&&r.salva,'riapertura');
  const p=modoEditorGamma({...e,tipo:'preventivo'},true);assert(!p.bloccato&&p.modificabile&&p.salva,'preventivo invariato');
`));
test('FM96 riapertura e storico: solo amministratore e responsabile showroom', () => esegui(`
  for(const ruolo of ['amministratore','responsabile_showroom'])assert(puoEsportareGamma(r=>r===ruolo),'ammesso');
  for(const ruolo of ['showroom','store_manager','preventivi_write'])assert(!puoEsportareGamma(r=>r===ruolo),'rifiutato');
`));
test('FM96 storico paginato e filtri data server inclusivi, export più recente prima', () => esegui(`
  const rows=await fetchStoricoGamma({dal:'2026-11-22',al:'2026-11-22'},client);assert(rows.length===501,'non tronca');
  assert(calls.filter(c=>c[1]==='gte'&&c[2]==='creata_at'&&c[3]==='2026-11-21T23:00:00.000Z').length===2,'dal');
  assert(calls.some(c=>c[1]==='lt'&&c[3]==='2026-11-22T23:00:00.000Z'),'al incluso');
  assert(calls[1][2]==='creata_at'&&calls[1][3].ascending===false,'decrescente');
`));
test('FM96 eventi di export selezionati e riaperture NULL separate con periodo', () => esegui(`
  await fetchEventiGamma('export1',{dal:'2026-11-22',al:'2026-11-22'},client);
  assert(calls.some(c=>c[1]==='eq'&&c[2]==='esportazione_id'&&c[3]==='export1'),'export');
  assert(!calls.some(c=>c[1]==='gte'),'eventi tutti della esportazione');calls.length=0;pages=0;
  await fetchEventiGamma(null,{dal:'2026-11-22',al:'2026-11-22'},client);
  assert(calls.some(c=>c[1]==='is'&&c[2]==='esportazione_id'&&c[3]===null),'solo null');
  assert(calls.some(c=>c[1]==='eq'&&c[2]==='tipo'&&c[3]==='riaperto'),'solo riaperture');
  assert(calls.some(c=>c[1]==='gte'&&c[2]==='at'),'date');
`));
test('FM96 riapertura singola passa UUID scalare e motivo alla RPC', () => esegui(`
  let args;await riapriOrdineGamma('ordine1','  correzione quantità  ',{rpc:async(n,a)=>{assert(n==='riapri_ordine_gamma','RPC');args=a;return {error:null}}});
  assert(args._ordine_id==='ordine1'&&!Array.isArray(args._ordine_id),'singolo');assert(args._motivo==='correzione quantità','motivo');
`));
test('FM96 download usa bucket privato, firma 60 secondi e restituisce blob/nome originali', () => esegui(`
  let firmato=false;const c={storage:{from:n=>{assert(n==='esportazioni-gamma','bucket');return {createSignedUrl:async(p,s)=>{assert(p==='uuid/Gamma.xls'&&s===60&&DURATA_URL_GAMMA===60,'firma breve');firmato=true;return {data:{signedUrl:'http://localhost/file-firmato'},error:null}}}}}};
  const r=await preparaDownloadGamma({file_path:'uuid/Gamma.xls',nome_file:'Gamma.xls'},c,async url=>{assert(firmato&&url==='http://localhost/file-firmato','solo firmato');return new Response(new Uint8Array([208,207,17]))});
  assert(r.nome==='Gamma.xls'&&r.blob.size===3,'download');
`));
test('FM96 download firma negata non legge file e riapertura negata conserva errore', () => esegui(`
  let fetched=false;try{await preparaDownloadGamma({file_path:'x',nome_file:'f'}, {storage:{from:()=>({createSignedUrl:async()=>({data:null,error:new Error('accesso negato')})})}},async()=>{fetched=true;return new Response()});throw Error('ammesso')}catch(e){assert(e.message==='accesso negato','errore firma')}assert(!fetched,'no lettura');
  try{await riapriOrdineGamma('x','',{rpc:async()=>({error:new Error('Ordine non visibile')})});throw Error('ammesso')}catch(e){assert(e.message==='Ordine non visibile','errore RPC')}
`));
test('FM96 correzione SDI modifica solo l’assegnazione, invariati corpo e ACL', () => {
  const precedente = readFileSync('drizzle/migrations/0269_fm96_completa_dati_esportazione_gamma.sql', 'utf8');
  const attuale = readFileSync('drizzle/migrations/0270_fm96_gamma_sdi_vuoto_null.sql', 'utf8');
  expect(attuale.trim()).toBe(precedente.replace('codice_sdi = _codice_sdi', "codice_sdi = NULLIF(_codice_sdi, '')").trim());
});
