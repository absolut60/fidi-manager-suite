import { expect, test } from "bun:test";
test("FM71 creazione lascia il numero al DB, anche con chiamante obsoleto", async () => {
  const script = `
    import {mock} from 'bun:test';
    let payload; let rpc=0;
    mock.module('@/integrations/supabase/client',()=>({supabase:{rpc:()=>{rpc++;throw Error('Contatore browser vietato');},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:'sede',nome:'Sede'},error:null})})}),insert:(v)=>{payload=v;return{select:()=>({single:async()=>({data:{id:'p1',numero:'PRV-168/26'},error:null})})};}})}}));
    const {createPreventivo}=await import('./src/lib/preventivi-api.ts');
    const result=await createPreventivo({titolo:'Test',numero:'MANUALE',store_id:'sede'});
    if('numero' in payload || rpc!==0 || result.preventivo.numero!=='PRV-168/26') throw Error('Numero non assegnato dal solo DB');
  `;
  const p=Bun.spawn(["bun","-e",script],{cwd:process.cwd(),stderr:"pipe",stdout:"pipe"});
  const errore=await new Response(p.stderr).text(); expect(await p.exited,errore).toBe(0);
});