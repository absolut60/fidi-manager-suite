import { expect, test } from "bun:test";

test("FM72 filtri cliente/lead e origine separata, ordinamento e errore", async () => {
  const script = `
    import { mock } from 'bun:test';
    const calls=[]; let fail=false;
    mock.module('@/integrations/supabase/client',()=>({supabase:{from:(table)=>{
      const q={}; for(const method of ['select','eq','order']) q[method]=(...args)=>{calls.push({table,method,args});return q;};
      q.then=resolve=>resolve({data:[{id:'documento'}],error:fail?{message:'raw'}:null}); return q;
    }}}));
    const {fetchPreventiviSoggetto}=await import('./src/lib/preventivi-soggetto.ts');
    const assert=(v,m)=>{if(!v)throw Error(m)};
    for(const [tipo,originati,colonna] of [['cliente',false,'cliente_id'],['lead',false,'lead_id'],['lead',true,'lead_origine_id']]){
      calls.length=0;
      const result=await fetchPreventiviSoggetto({tipo,id:'soggetto',etichetta:'Nome'},originati);
      assert(result[0].id==='documento','lettura');
      const filtri=calls.filter(c=>c.method==='eq');
      assert(filtri.length===1&&filtri[0].args[0]===colonna&&filtri[0].args[1]==='soggetto','filtro '+colonna);
      assert(JSON.stringify(calls.filter(c=>c.method==='order').map(c=>c.args))===JSON.stringify([['data',{ascending:false}],['created_at',{ascending:false}]]),'ordine');
    }
    calls.length=0;
    assert((await fetchPreventiviSoggetto({tipo:'cliente',id:'c',etichetta:'C'},true)).length===0&&calls.length===0,'nessun gruppo origine cliente');
    fail=true; let caught=false;
    try {await fetchPreventiviSoggetto({tipo:'lead',id:'l',etichetta:'L'})}catch(e){caught=e.message.includes('Impossibile caricare')}
    assert(caught,'errore italiano');
  `;
  const p = Bun.spawn(["bun", "-e", script], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  const stderr = await new Response(p.stderr).text();
  expect(await p.exited, stderr).toBe(0);
});