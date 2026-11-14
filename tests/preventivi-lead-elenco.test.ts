import { expect, test } from "bun:test";

test("FM71 elenco legge il lead nella query e ricerca nome prima del limite", async () => {
  // Processo isolato: il mock del client non può contaminare gli altri test della suite.
  const script = `
    import { mock } from 'bun:test';
    const chiamate = []; const lead = {id:'lead-1',ragione_sociale:'Impresa Collaudo',nome:null,cognome:null,store_id:null};
    const row = {id:'prev-1',lead_id:'lead-1',cliente_id:null,creato_da:null,lead};
    mock.module('@/integrations/supabase/client',()=>({supabase:{
      rpc:async()=>({data:[],error:null}),
      from:(tabella)=>{
        const q={}; for(const metodo of ['select','is','order','limit','eq','in','or']) q[metodo]=(...args)=>{chiamate.push({tabella,metodo,args});return q;};
        q.then=(resolve)=>resolve({data:tabella==='lead'?[lead]:chiamate.some(c=>c.tabella==='preventivi'&&c.metodo==='in')?[]:[row],error:null}); return q;
      }
    }}));
    const {fetchElencoPreventivi}=await import('./src/lib/preventivi-api.ts');
    const result=await fetchElencoPreventivi({search:'Collaudo'});
    if(result.principali[0]?.lead?.ragione_sociale!=='Impresa Collaudo') throw Error('Lead non letto');
    if(!chiamate.some(c=>c.tabella==='preventivi'&&c.metodo==='select'&&c.args[0].includes('lead:lead!preventivi_lead_id_fkey(id,ragione_sociale,nome,cognome,store_id)'))) throw Error('Join assente');
    if(!chiamate.some(c=>c.tabella==='preventivi'&&c.metodo==='or'&&c.args[0].includes('lead_id.in.(lead-1)'))) throw Error('Ricerca lead assente');
  `;
  const processo = Bun.spawn(["bun", "-e", script], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  const errore = await new Response(processo.stderr).text();
  expect(await processo.exited, errore).toBe(0);
});