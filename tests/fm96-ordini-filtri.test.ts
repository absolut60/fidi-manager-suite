import { expect, test } from 'bun:test';

async function esegui(codice: string) {
  const script = `import {mock} from 'bun:test';const calls=[];let pagine=0;
    const client={rpc:async()=>({data:[],error:null}),from:t=>{const q={};for(const m of ['select','is','not','gte','lt','order','limit','eq','in','or'])q[m]=(...a)=>{calls.push([t,m,...a]);return q};q.range=(da,a)=>{calls.push([t,'range',da,a]);pagine++;return q};q.then=r=>r({data:pagine===1?Array.from({length:500},(_,i)=>({id:'id'+i})):pagine===2?[{id:'id500'}]:[],count:42,error:null});return q}};
    mock.module('@/integrations/supabase/client',()=>({supabase:client}));
    const {fetchElencoPreventivi,fetchIdsOrdiniGamma,fetchConteggiOrdiniGamma,inizioGiornoExport}=await import('./src/lib/preventivi-api');
    const assert=(v,m)=>{if(!v)throw Error(m)};${codice}`;
  const p = Bun.spawn(['bun', '-e', script], { stdout: 'pipe', stderr: 'pipe' });
  const err = await new Response(p.stderr).text();
  expect(await p.exited, err).toBe(0);
}
test('FM96 Da esportare applica IS NULL e mantiene principali prima del limite', () => esegui(`
  await fetchElencoPreventivi({tipo:'ordine',esportazione_gamma:'da_esportare'});
  assert(calls.some(c=>c[1]==='is'&&c[2]==='esportato_gamma_at'&&c[3]===null),'IS NULL');
  assert(calls.some(c=>c[1]==='is'&&c[2]==='alternativa_di'&&c[3]===null),'no alternative');
`));
test('FM96 Esportati filtra giorni inclusivi Europe/Rome e ordina per export decrescente', () => esegui(`
  await fetchElencoPreventivi({tipo:'ordine',esportazione_gamma:'esportati',esportato_dal:'2026-07-01',esportato_al:'2026-07-02'});
  assert(calls.some(c=>c[1]==='not'&&c[2]==='esportato_gamma_at'&&c[3]==='is'),'non null');
  assert(calls.some(c=>c[1]==='gte'&&c[3]==='2026-06-30T22:00:00.000Z'),'dal ora legale');
  assert(calls.some(c=>c[1]==='lt'&&c[3]==='2026-07-02T22:00:00.000Z'),'al inclusivo');
  assert(calls.find(c=>c[1]==='order')[2]==='esportato_gamma_at'&&calls.find(c=>c[1]==='order')[3].ascending===false,'ordine');
  assert(inizioGiornoExport('2026-11-22')==='2026-11-21T23:00:00.000Z','inverno');
`));
test('FM96 seleziona tutti 501 filtrati oltre il limite, con alternative escluse e filtri conservati', () => esegui(`
  const ids=await fetchIdsOrdiniGamma({cliente_id:['c1'],stato:['bozza'],creato_da:['u1'],linea:['showroom']});
  assert(ids.length===501&&ids[500]==='id500','oltre 500');
  assert(calls.filter(c=>c[1]==='is'&&c[2]==='alternativa_di'&&c[3]===null).length===2,'principali ogni pagina');
  assert(calls.filter(c=>c[1]==='in'&&c[2]==='cliente_id'&&c[3][0]==='c1').length===2,'filtri tutte pagine');
  assert(!calls.some(c=>c[1]==='limit'),'non limitato');
`));
test('FM96 conteggi esatti per entrambe le schede, preventivi senza filtro Gamma', () => esegui(`
  const n=await fetchConteggiOrdiniGamma({});assert(n.da_esportare===42&&n.esportati===42,'conteggi server');
  calls.length=0;await fetchElencoPreventivi({tipo:'preventivo',esportazione_gamma:'esportati',esportato_dal:'2026-11-22'});
  assert(!calls.some(c=>['is','not','gte','lt'].includes(c[1])&&c[2]==='esportato_gamma_at'),'preventivi invariati');
`));