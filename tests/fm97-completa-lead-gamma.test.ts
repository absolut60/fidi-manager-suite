import { expect, test } from 'bun:test';
import { LIMITE_IDENTIFICATIVO_LEAD, normalizzaTestoLead } from '../src/lib/lead-anagrafica';

async function esegui(codice: string) {
  const script = `import {mock} from 'bun:test';
    mock.module('@/integrations/supabase/client',()=>({supabase:{}}));
    const {completaDatiGamma,datiNuovoClienteGamma,patchAnagraficaLeadGamma}=await import('./src/lib/esportazione-gamma-operazioni');
    const {costruisciEsportazioneGamma}=await import('./src/lib/esportazione-gamma');
    const {ordineFm96}=await import('./tests/fixtures/fm96-gamma');
    const assert=(v,m)=>{if(!v)throw Error(m)};
    const a=ordineFm96();a.ordine.cliente_id=null;a.ordine.lead_id='l1';a.cliente=null;
    a.lead={id:'l1',tipo_soggetto:'azienda',ragione_sociale:'Edilizia prova',indirizzo:null,cap:null,citta:null,provincia:null};
    ${codice}`;
  const p = Bun.spawn(['bun', '-e', script], { stdout: 'pipe', stderr: 'pipe' });
  const err = await new Response(p.stderr).text();
  expect(await p.exited, err).toBe(0);
}

test('FM97 normalizzazione fiscale del lead conserva trim-only e limite 20, senza inventare checksum', () => {
  expect(LIMITE_IDENTIFICATIVO_LEAD).toBe(20);
  expect(normalizzaTestoLead('  abc123  ')).toBe('abc123');
  expect(normalizzaTestoLead('  ')).toBeNull();
});
test('FM97 campi precompilati restano intatti e suggerimenti aggiornano solo i mancanti', () => esegui(`
  a.lead.cap='20900';a.lead.provincia='MB';
  const p=patchAnagraficaLeadGamma(a,{ragione_sociale:'Altro nome',indirizzo:'Via Roma 5',cap:'20100',citta:'Monza',provincia:'MI'});
  assert(JSON.stringify(p)===JSON.stringify({indirizzo:'Via Roma 5',citta:'Monza'}),'solo mancanti');
  assert(datiNuovoClienteGamma(a).anagrafica.cap==='20900','prefill');
`));
test('FM97 un solo salvataggio ordine+lead, trim SDI canonico e avvisi indirizzo/CAP/città spariscono dopo rilettura', () => esegui(`
  const prima=costruisciEsportazioneGamma([a]);assert(['indirizzo','cap','citta'].every(c=>prima.problemi.some(p=>p.codice==='lead_senza_'+c)),'tre avvisi');
  let chiamate=0;
  const client={rpc:async(n,v)=>{chiamate++;assert(n==='completa_dati_lead_esportazione_gamma','RPC unica');assert(v._codice_sdi==='ABC1234','SDI canonico');
    Object.assign(a.lead,v._anagrafica,{codice_sdi:v._codice_sdi});Object.assign(a.ordine,{listino_rif:v._listino,macrocategoria_rif:v._macrocategoria,categoria_rif:v._categoria});return {error:null}}};
  await completaDatiGamma(a.ordine.id,{...datiNuovoClienteGamma(a),codice_sdi:' ab c1234 ',listino_rif:20,macrocategoria_rif:'01',categoria_rif:'02',anagrafica:{indirizzo:' Via Roma 5 ',cap:' 20900 ',citta:' Monza ',provincia:' MB '}},client);
  assert(chiamate===1&&a.lead.indirizzo==='Via Roma 5'&&a.lead.provincia==='MB','unico save normalizzato');
  const dopo=costruisciEsportazioneGamma([a]);assert(!dopo.problemi.some(p=>['lead_senza_indirizzo','lead_senza_cap','lead_senza_citta'].includes(p.codice)),'avvisi rimossi');
  const t=dopo.righe.find(r=>r.TESTATA_RIGHE==='T'&&r.IND_CLIFOR===0);assert(t.Indirizzo_anagrafica==='Via Roma 5'&&t.Cap_anagrafica==='20900'&&t.Citta_anagrafica==='Monza','testata aggiornata');
`));
test('FM97 nulla invariato e vuoto esplicito rimangono distinti nella chiamata; chiavi estranee escluse', () => esegui(`
  let args;const client={rpc:async(n,v)=>{args=v;return {error:null}}};
  await completaDatiGamma(a.ordine.id,{...datiNuovoClienteGamma(a),anagrafica:{nome:null,cognome:'  ',codice_fiscale:' abc123 ',created_by:'non permesso'}},client);
  assert(args._anagrafica.nome===null&&args._anagrafica.cognome==='','null e vuoto distinti');
  assert(args._anagrafica.codice_fiscale==='abc123'&&!('created_by' in args._anagrafica),'stessa normalizzazione e whitelist');
`));
test('FM97 fallimento RPC non viene dichiarato riuscito', () => esegui(`
  try{await completaDatiGamma(a.ordine.id,datiNuovoClienteGamma(a),{rpc:async()=>({error:{message:'Ordine già esportato'}})});throw Error('ammesso')}
  catch(e){assert(e.message==='Ordine già esportato','errore propagato')}
`));