import { expect, test } from "bun:test";

test("FM86 tutti i salvataggi risolvono cliente/lead/utente e rifiutano sede assente", async () => {
  const script = `
    import {mock} from 'bun:test';
    let source='lead'; let inserts=[];
    mock.module('@/integrations/supabase/client',()=>({supabase:{
      auth:{getUser:async()=>({data:{user:{id:'u'}},error:null})},
      rpc:async()=>({data:[{store_id:'cliente'}],error:null}),
      from:table=>({
        select:()=>({eq:()=>({single:async()=>({data:table==='stores'?{id:source==='lead'?'c76cb049-d6d3-4327-ae30-a7b7b150c6e6':source,nome:'Sede'}:{store_id:table==='lead'?(source==='lead'?'c76cb049-d6d3-4327-ae30-a7b7b150c6e6':null):(source==='utente'?'utente':null)},error:null})})}),
        insert:payload=>{inserts.push(payload);return {select:()=>({single:async()=>({data:payload,error:null})})}}
      })
    }}));
    const {createPreventivo}=await import('./src/lib/preventivi-api.ts');
    await createPreventivo({lead_id:'l'});
    if(inserts[0].store_id!=='c76cb049-d6d3-4327-ae30-a7b7b150c6e6'||inserts[0].filiale!=='Sede') throw Error('Lead senza sede sul profilo');
    source='cliente'; await createPreventivo({cliente_id:'c'});
    if(inserts[1].store_id!=='cliente') throw Error('Cliente');
    source='utente'; await createPreventivo({lead_id:'l'});
    if(inserts[2].store_id!=='utente') throw Error('Utente');
    source='nessuno';
    try {await createPreventivo({lead_id:'l'});throw Error('Salvato senza sede');}
    catch(e){if(e.message!=='Scegli la sede prima di salvare il preventivo.')throw e;}
    if(inserts.length!==3)throw Error('Inserimento senza sede');
    source='scelta'; await createPreventivo({lead_id:'l',store_id:'scelta'});
    if(inserts[3].store_id!=='scelta')throw Error('Scelta manuale sovrascritta');
  `;
  const p = Bun.spawn(["bun", "-e", script], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  const error = await new Response(p.stderr).text();
  expect(await p.exited, error).toBe(0);
});

test("FM86 PDF senza sede: MADE di gruppo nei quattro documenti di tutte le linee", async () => {
  const script = `
    import {jsPDF as Original} from 'jspdf';
    import {LOGO_MADE_BASE64} from './src/lib/logo-made-base64.ts';
    let images=[];
    const add=Original.API.addImage;
    Original.API.addImage=function(...args){images.push(args[0]);return add.apply(this,args);};
    const pdf=await import('./src/lib/pdf-export.ts');
    const funcs=[pdf.exportPreventivoPdf,pdf.exportPropostaRapidaPdf,pdf.exportListaMaterialiPdf,pdf.exportListaFornitorePdf];
    for(const linea of ['sistema_made','showroom','edilizia','fotovoltaico'])for(const fn of funcs){
      images=[];
      await fn({id:'p',numero:'PRV-172/26',store_id:null,filiale:null,linea,tipo:'preventivo',tipo_doc:'PREVENTIVO',data:'2026-11-19',lead_id:'l',lead:{ragione_sociale:'prova edilbru'},blocchi:[],iva_perc:22,regime_iva:'ordinaria'});
      if(images.length!==1||images[0]!==LOGO_MADE_BASE64)throw Error('Ripiego errato '+linea+' '+fn.name);
    }
  `;
  const p = Bun.spawn(["bun", "-e", script], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  const error = await new Response(p.stderr).text();
  expect(await p.exited, error).toBe(0);
});