import { expect, test } from 'bun:test';
import { etichettaIncidenzaKit, lineeKitAbilitate, patchArticoloKit, patchManualeKit, proponiCodiceKit, specificheKitDaValori, valoriSpecificheKit } from '../src/lib/kit-config';

for (const [linea,prefisso] of [['sistema_made','SM'],['showroom','SR'],['edilizia','ED'],['fotovoltaico','FV']] as const) {
  test(`FM90 codice ${linea}: prefisso, progressivo libero e codici personalizzati ignorati`,()=>{
    expect(proponiCodiceKit(linea,[])).toBe(`${prefisso}-1`);
    expect(proponiCodiceKit(linea,[`${prefisso}-1`,`${prefisso}-009`,`${prefisso}-speciale`,'PROVA-3'])).toBe(`${prefisso}-10`);
  });
}
test('FM90 le linee kit sono solo quelle abilitate, anche se il preventivatore non le ha ancora attivate',()=>{
  expect(lineeKitAbilitate(['showroom','fotovoltaico']).map(l=>l.codice)).toEqual(['showroom','fotovoltaico']);
  expect(lineeKitAbilitate([])).toEqual([]);
  expect(lineeKitAbilitate(['sistema_made'])).toHaveLength(1);
});
test('FM90 etichetta quantità dalla configurazione e unità base effettiva',()=>{
  expect(etichettaIncidenzaKit('sistema_made','mq')).toBe('Incidenza per mq');
  expect(etichettaIncidenzaKit('sistema_made','ml')).toBe('Incidenza per ml');
  expect(etichettaIncidenzaKit('showroom','kit')).toBe('Quantità per kit');
});
test('FM90 codice assente da Gamma è manuale, non un articolo tecnico storico',()=>{
  expect(patchArticoloKit(' NUOVO-01 ',null)).toEqual({articolo_codice:null,codice_articolo_fornitore:'NUOVO-01'});
});
test('FM90 selezione Gamma cancella solo i campi anagrafici manuali',()=>{
  expect(patchArticoloKit('G01',{codice:'G01',descrizione:'Lastra',um:'MQ'})).toEqual({
    articolo_codice:'G01',codice_articolo_fornitore:null,descrizione:null,um:null,fornitore_id:null,marca:null,costo:null,listino_fornitore:null,
  });
});
test('FM90 finestra manuale salva costo unitario e listino, mai prezzo o margine',()=>{
  const patch=patchManualeKit({codice_articolo_fornitore:'F01',fornitore_id:'f',marca:'Marca',descrizione:'Manuale',um:'PZ',costo:12.5,listino_fornitore:25,prezzo_unit:99,ricarico:50,codice_famiglia:'01',codice_sottofamiglia:'02',um2:'CF',fattore_conversione:1.44});
  expect(patch).toEqual({articolo_codice:null,codice_articolo_fornitore:'F01',fornitore_id:'f',marca:'Marca',descrizione:'Manuale',um:'PZ',costo:12.5,listino_fornitore:25,codice_famiglia:'01',codice_sottofamiglia:'02',um2:'CF',fattore_conversione:1.44});
});
test('FM92 specifiche non configurate non entrano nel salvataggio',()=>{
  expect(specificheKitDaValori('sistema_made',{passo:'600',passo_um:'mm',nonPrevisto:'x'})).toEqual({});
  for (const linea of ['showroom','edilizia','fotovoltaico'] as const) expect(specificheKitDaValori(linea,{isolante:'Lana minerale',nonPrevisto:'x'})).toEqual({});
  expect(valoriSpecificheKit(null)).toEqual({});
});
test('FM92 lettura e copia delle quattro specifiche configurate, senza chiavi storiche',()=>{
  const originali={tipo_struttura:'Parete',spessore_mm:75,h_max_m:3.5,isolante:'Lana minerale',passo:600,passo_um:'mm'};
  const valori=valoriSpecificheKit(originali,'sistema_made');
  expect(valori).toEqual({tipo_struttura:'Parete',spessore_mm:'75',h_max_m:'3,5',isolante:'Lana minerale'});
  expect(specificheKitDaValori('sistema_made',valori)).toEqual({tipo_struttura:'Parete',spessore_mm:75,h_max_m:3.5,isolante:'Lana minerale'});
  expect(originali.passo).toBe(600);
});
test('FM92 specifiche numeriche configurate rifiutano valori non validi',()=>{
  expect(()=>specificheKitDaValori('sistema_made',{spessore_mm:'non numerico'})).toThrow();
  expect(()=>specificheKitDaValori('sistema_made',{h_max_m:'non numerico'})).toThrow();
});
test('FM90 il codice duplicato del database produce un errore chiaro e nessun successo',async()=>{
  const script=`
    import {mock} from 'bun:test';
    mock.module('@/integrations/supabase/client',()=>({supabase:{from:table=>({
      select:()=>({order:()=>({order:async()=>({data:[{id:'f',linea:'sistema_made',codice:'PARETE',attiva:true}],error:null})})}),
      insert:()=>({select:()=>({single:async()=>({data:null,error:{code:'23505',message:'duplicate'}})})})
    })}}));
    const {createKit}=await import('./src/lib/kit-api.ts');
    let failed=false;try{await createKit({codice:'SM-1',nome:'Parete',linea:'sistema_made',famiglia_id:'f'});}catch(e){failed=e.message==='Codice kit già utilizzato: scegli un codice diverso.';}
    if(!failed)throw Error('Codice duplicato non segnalato');
  `;
  const p=Bun.spawn(['bun','-e',script],{cwd:process.cwd(),stdout:'pipe',stderr:'pipe'});
  const err=await new Response(p.stderr).text();expect(await p.exited,err).toBe(0);
});
test('FM90 lettura kit: solo nuovi campi, Gamma a blocchi di 150, nessuna join ai listini',async()=>{
  const script=`
    import {mock} from 'bun:test';
    const batches=[],selects=[];
    const componenti=Array.from({length:151},(_,i)=>({id:'c'+i,kit_id:'k',articolo_codice:'G'+i,ordine:i}));
    mock.module('@/integrations/supabase/client',()=>({supabase:{from:table=>({select:campos=>{
      selects.push({table,campos});
      if(table==='kit')return{order:async()=>({data:[{id:'k',componenti}],error:null})};
      return{in:async(_,codici)=>{batches.push(codici.length);return{data:codici.map(codice=>({codice,descrizione:'Descrizione '+codice,um:'MQ',peso_netto:2})),error:null}}};
    }})}}));
    const {fetchKitsWithComponenti}=await import('./src/lib/kit-api.ts');
    const rows=await fetchKitsWithComponenti();
    if(JSON.stringify(batches)!=='[150,1]')throw Error('Blocchi Gamma errati');
    if(rows[0].componenti[150].articolo.descrizione!=='Descrizione G150')throw Error('Gamma non collegato');
    if(selects.some(s=>/articolo_id|listini_acquisto|listini_vendita/.test(s.campos)))throw Error('Campi storici ancora letti');
  `;
  const p=Bun.spawn(['bun','-e',script],{cwd:process.cwd(),stdout:'pipe',stderr:'pipe'});
  const err=await new Response(p.stderr).text();expect(await p.exited,err).toBe(0);
});