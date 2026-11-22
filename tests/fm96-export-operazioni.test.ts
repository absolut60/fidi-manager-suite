import { expect, test } from 'bun:test';

async function esegui(codice: string) {
  const script = `import {mock} from 'bun:test';
    mock.module('@/integrations/supabase/client',()=>({supabase:{}}));
    const {esportaOrdiniGamma,completaDatiGamma,datiNuovoClienteGamma}=await import('./src/lib/esportazione-gamma-operazioni');
    const {costruisciEsportazioneGamma}=await import('./src/lib/esportazione-gamma');
    const {ordineFm96}=await import('./tests/fixtures/fm96-gamma');
    const assert=(v,m)=>{if(!v)throw Error(m)};
    ${codice}`;
  const p = Bun.spawn(['bun', '-e', script], { stdout: 'pipe', stderr: 'pipe' });
  const err = await new Response(p.stderr).text();
  expect(await p.exited, err).toBe(0);
}

test('FM96 esporta solo il pronto, un unico XLS e 5 testate fornitore + 1 cliente', () => esegui(`
  const a=ordineFm96(),b=ordineFm96('96000000-0000-0000-0000-000000000002',true),calls=[];
  const client={storage:{from:n=>({upload:async(path,blob)=>{calls.push(['upload',n,path,blob.size]);return {error:null}},remove:async()=>{throw Error('non deve ripulire')}})},rpc:async(n,args)=>{calls.push([n,args]);return {data:'id',error:null}}};
  const r=await esportaOrdiniGamma([a.ordine.id,b.ordine.id],client,async()=>[a,b]);
  assert(calls[0][1]==='esportazioni-gamma'&&calls[0][3]>0,'bucket/blob');
  const args=calls[1][1];assert(args._ordine_ids.length===1&&args._ordine_ids[0]===a.ordine.id,'solo pronto');
  assert(r.nome==='ORDINI_CLIENTI_FORNITORI.xls'&&args._nome_file===r.nome,'nome download e storico');
  const parti=args._file_path.split('/');
  assert(args._file_path===calls[0][2]&&parti.length===2&&/^[0-9a-f-]{36}$/.test(parti[0])&&parti[1]===r.nome,'percorso UUID');
  assert(args._n_doc_fornitore===5&&args._n_doc_cliente===1,'5+1');
  assert(r.esito.ordiniBloccati[0]===b.ordine.id,'bloccato resta');
  assert(new Uint8Array(await r.blob.arrayBuffer())[0]===0xd0,'BIFF8');
`));
test('FM97: esportazioni con nome fisso conservano percorsi UUID distinti', () => esegui(`
  const a=ordineFm96(),paths=[],names=[];
  const client={storage:{from:()=>({upload:async p=>{paths.push(p);return {error:null}}})},rpc:async(n,args)=>{names.push(args._nome_file);return {error:null}}};
  await esportaOrdiniGamma([a.ordine.id],client,async()=>[a]);
  await esportaOrdiniGamma([a.ordine.id],client,async()=>[a]);
  assert(paths.length===2&&paths[0]!==paths[1],'UUID distinti');
  assert(names.length===2&&names.every(n=>n==='ORDINI_CLIENTI_FORNITORI.xls'),'nome storico fisso');
`));
test('FM96 errore della RPC rimuove esattamente il file caricato e conserva il messaggio', () => esegui(`
  const a=ordineFm96(),calls=[];
  const client={storage:{from:()=>({upload:async p=>{calls.push(p);return {error:null}},remove:async ps=>{calls.push(ps[0]);return {error:null}}})},rpc:async()=>({error:{message:'ORD-104/26: già esportato'}})};
  try{await esportaOrdiniGamma([a.ordine.id],client,async()=>[a]);throw Error('ammesso')}catch(e){assert(e.message==='ORD-104/26: già esportato','errore originale')}
  assert(calls.length===2&&calls[0]===calls[1],'ripulitura stesso file');
`));
test('FM96 upload fallito non registra; nessun pronto non carica', () => esegui(`
  let rpc=0,upload=0;const a=ordineFm96();const client={storage:{from:()=>({upload:async()=>{upload++;return {error:{message:'upload negato'}}}})},rpc:async()=>{rpc++}};
  try{await esportaOrdiniGamma([a.ordine.id],client,async()=>[a])}catch(e){assert(e.message==='upload negato','upload errore')};
  assert(upload===1&&rpc===0,'no registrazione');
  const b=ordineFm96('b',true);try{await esportaOrdiniGamma(['b'],client,async()=>[b])}catch(e){assert(e.message==='Nessun ordine esportabile.','no pronto')};assert(upload===1,'no upload bloccati');
`));
test('FM96 salvataggio lead usa i riferimenti del motore e ricalcola dopo normalizzazione SDI', () => esegui(`
  const a=ordineFm96();a.ordine.cliente_id=null;a.ordine.lead_id='l1';a.cliente=null;a.lead={id:'l1',ragione_sociale:'Lead',listino_rif:20,macrocategoria_rif:'01'};
  assert(datiNuovoClienteGamma(a).listino_rif===20,'ripiego lead');a.ordine.listino_rif=10;assert(datiNuovoClienteGamma(a).listino_rif===10,'priorità ordine');
  const before=costruisciEsportazioneGamma([a]);assert(before.problemi.some(p=>p.codice==='lead_senza_categoria'),'categoria assente');
  const client={rpc:async(n,v)=>{assert(n==='completa_dati_lead_esportazione_gamma','RPC');assert(v._codice_sdi==='ABC1234','SDI');Object.assign(a.ordine,{listino_rif:v._listino,macrocategoria_rif:v._macrocategoria,categoria_rif:v._categoria});a.lead.codice_sdi=v._codice_sdi;return {error:null}}};
  await completaDatiGamma(a.ordine.id,{listino_rif:20,macrocategoria_rif:'01',categoria_rif:'02',codice_sdi:'ab c1234'},client);
  const after=costruisciEsportazioneGamma([a]);assert(!after.problemi.some(p=>['lead_senza_listino','lead_senza_macrocategoria','lead_senza_categoria'].includes(p.codice)),'ricalcolo');
  assert(after.righe.find(r=>r.TESTATA_RIGHE==='T'&&r.IND_CLIFOR===0)?.Codice_destinatario_prevalente==='ABC1234','SDI file');
`));