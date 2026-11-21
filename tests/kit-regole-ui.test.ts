import { expect, test } from 'bun:test';
import { anteprimaQuantitaKit, CAMPI_REGOLA_KIT, descrizioneOperandoKit, fraseRegolaKit, normalizzaPatchRegoleKit, righeUsanoParametroKit, sceltaOperandoKit, validaParametroKit, type SalvataggioParametroKit } from '../src/lib/kit-regole-ui';
import { calcolaKitRegole } from '../src/lib/kit-regole';
import { LINEE_PREVENTIVO } from '../src/lib/linee-preventivo';

const parametri = [
  { codice: 'MONTANTE', etichetta: 'Montante', um: 'n.', valore_default: 2 },
  { codice: 'PASSO', etichetta: 'Passo montanti', um: null, valore_default: 0.6 },
];
const p: SalvataggioParametroKit = { codice: 'PASSO', etichetta: 'Passo', tipo: 'numero', valori_ammessi: null, valore_default: 0.6, um: 'm', note: null, ordine: 0 };

test('FM91 frase in parole: etichette parametri, unità e numero italiano', () => {
  expect(fraseRegolaKit({ regola_base: 'PARAM:MONTANTE', regola_dividi_1: 'PARAM:PASSO', regola_aggiunta: '0.05' }, parametri)).toBe('Montante (n.) ÷ Passo montanti + 0,05');
});
test('FM91 frase quantità riga e divisore', () => {
  expect(fraseRegolaKit({ regola_base: 'RIGA:2', regola_dividi_1: '0.5' }, [])).toBe('Quantità riga 2 ÷ 0,5');
});
test('FM91 frase non include moltiplicatori/divisori neutri e aggiunta zero', () => {
  expect(fraseRegolaKit({ regola_base: '1,44', regola_moltiplica: '1', regola_dividi_1: '1', regola_dividi_2: '', regola_confezione: '90', regola_aggiunta: '0' }, [])).toBe('1,44 ÷ 90');
});
test('FM91 riferimenti scelti dal menu salvano gli operandi canonici', () => {
  expect(sceltaOperandoKit('parametro', 'PASSO')).toBe('PARAM:PASSO');
  expect(sceltaOperandoKit('riga', 2)).toBe('RIGA:2');
  expect(() => sceltaOperandoKit('parametro', 'passo')).toThrow();
  expect(() => sceltaOperandoKit('riga', 'guide')).toThrow();
  expect(descrizioneOperandoKit('PARAM:PASSO', parametri)).toBe('Passo montanti');
});
test('FM91 tutti i sei operandi si normalizzano, senza toccare gli altri dati', () => {
  const valori = Object.fromEntries(CAMPI_REGOLA_KIT.map(c => [c.codice, ' 0,6 ']));
  const risultato = normalizzaPatchRegoleKit({ ...valori, regola_base: '0,6', note: 'nota', incidenza: 4 });
  for (const campo of CAMPI_REGOLA_KIT) expect(risultato[campo.codice]).toBe('0.6');
  expect(risultato.note).toBe('nota'); expect(risultato.incidenza).toBe(4);
  expect(normalizzaPatchRegoleKit({ regola_base: '', regola_dividi_1: 'PARAM:PASSO' })).toEqual({ regola_base: null, regola_dividi_1: 'PARAM:PASSO' });
  expect(() => normalizzaPatchRegoleKit({ regola_confezione: '1000*2' })).toThrow();
});
test('FM91 eliminazione/rinomina: individua ogni campo e riporta ordine/descrizione, non modifica regole', () => {
  const componenti = CAMPI_REGOLA_KIT.map((campo, indice) => ({ ordine: indice + 1, [campo.codice]: 'PARAM:PASSO', descrizione: `Articolo ${indice + 1}` }));
  const prima = JSON.stringify(componenti);
  expect(righeUsanoParametroKit('PASSO', componenti).map(r => r.ordine)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(righeUsanoParametroKit('PASSO', componenti)[0]?.descrizione).toBe('Articolo 1');
  expect(righeUsanoParametroKit('PASS', componenti)).toEqual([]);
  expect(JSON.stringify(componenti)).toBe(prima);
});
test('FM91 codice parametro maiuscolo e validazione Numero/Scelta', () => {
  expect(validaParametroKit({ ...p, codice: ' passo_1 ' }).codice).toBe('PASSO_1');
  expect(() => validaParametroKit({ ...p, codice: 'PASSO-M' })).toThrow();
  expect(() => validaParametroKit({ ...p, tipo: 'scelta', valori_ammessi: [0.4] })).toThrow();
  expect(validaParametroKit({ ...p, tipo: 'scelta', valori_ammessi: [0.4, 0.6] }).valori_ammessi).toEqual([0.4, 0.6]);
});
test('FM91 anteprima identica al motore unico con valori italiani di prova e default', () => {
  const componenti = [{ ordine: 1, regola_base: 'PARAM:MONTANTE', regola_dividi_1: 'PARAM:PASSO' }, { ordine: 2, regola_base: 'RIGA:1', regola_confezione: '1000' }];
  expect(anteprimaQuantitaKit(componenti, parametri, { PASSO: '0,4' })).toEqual(calcolaKitRegole({ componenti, parametri, valoriParametri: { PASSO: 0.4 } }));
  expect(anteprimaQuantitaKit(componenti, parametri, {})).toEqual(calcolaKitRegole({ componenti, parametri }));
  expect(anteprimaQuantitaKit(componenti, parametri, { PASSO: '0,4' })[0]?.quantitaPerUnita).toBe(5);
});
test('FM91 valore di prova vuoto non diventa zero o default silenzioso', () => {
  const risultato = anteprimaQuantitaKit([{ ordine: 1, regola_base: 'PARAM:PASSO' }], parametri, { PASSO: '' });
  expect(risultato[0]?.quantitaPerUnita).toBeNull();
  expect(risultato[0]?.errore).toContain('numero finito');
});
test('FM91 configurazione: complete con parametri, altre linee solo_base senza parametri', () => {
  expect(LINEE_PREVENTIVO.sistema_made.kit.regole).toBe('complete');
  expect(LINEE_PREVENTIVO.sistema_made.kit.parametri).toBe(true);
  for (const linea of ['showroom', 'edilizia', 'fotovoltaico'] as const) {
    expect(LINEE_PREVENTIVO[linea].kit.regole).toBe('solo_base');
    expect(LINEE_PREVENTIVO[linea].kit.parametri).toBe(false);
  }
});

async function esegui(script: string) {
  const processo = Bun.spawn(['bun', '-e', script], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  const errore = await new Response(processo.stderr).text();
  expect(await processo.exited, errore).toBe(0);
}
test('FM91 API: INSERT/UPDATE passano sempre dal normalizzatore prima di scrivere', async () => {
  await esegui(`
    import {mock} from 'bun:test';
    const patches=[];
    mock.module('@/integrations/supabase/client',()=>({supabase:{from:()=>({
      insert:p=>{patches.push(p);return{select:()=>({single:async()=>({data:p,error:null})})}},
      update:p=>{patches.push(p);return{eq:()=>({select:()=>({single:async()=>({data:p,error:null})})})}}
    })}}));
    const {insertComponente,updateComponente}=await import('./src/lib/kit-api.ts');
    await insertComponente({kit_id:'k',regola_base:'0,6',regola_confezione:' 1000 '});
    await updateComponente('c',{regola_base:'',regola_moltiplica:'PARAM:PASSO',n_pezzi:2,passo:0.6,peso_unitario:8.7,riga_rif:1});
    if(patches[1].n_pezzi!==2||patches[1].passo!==0.6||patches[1].peso_unitario!==8.7||patches[1].riga_rif!==1)throw Error('Campi semplici persi');
    let invalid=false;try{await updateComponente('c',{passo:0});}catch{invalid=true;}if(!invalid||patches.length!==2)throw Error('Divisore invalido scritto');
    if(patches[0].regola_base!=='0.6'||patches[0].regola_confezione!=='1000'||patches[1].regola_base!==null)throw Error('Operandi non normalizzati');
    let fail=false;try{await updateComponente('c',{regola_dividi_1:'1/2'});}catch{fail=true;}
    if(!fail||patches.length!==2)throw Error('Scrittura operando invalido');
  `);
});
for (const erroreCopia of [null, 'kit_parametri', 'kit_componenti']) {
  test(`FM91 duplicazione: parametri e regole completi, errore esplicito ${erroreCopia ?? 'nessuno'}`, async () => {
    await esegui(`
      import {mock} from 'bun:test';
      const errorTable=${JSON.stringify(erroreCopia)}, inserts={};
      const kit={id:'orig',nome:'Kit',linea:'sistema_made',codice:'SM-1',famiglia_id:'f',um_base:'mq',specifiche:{},componenti:[{id:'c',kit_id:'orig',ordine:1,articolo_codice:null,descrizione:'Manuale',n_pezzi:2,passo:0.6,passo_2:0.5,consumo:0.716666666666667,lati:2,confezione:1000,sfrido:0.05,peso_unitario:8.7,riga_rif:3,regola_base:'PARAM:PASSO',regola_moltiplica:'2,5',regola_dividi_1:'2',regola_dividi_2:null,regola_confezione:'1000',regola_aggiunta:'0,05'}]};
      const parametro={id:'p',kit_id:'orig',codice:'PASSO',etichetta:'Passo',tipo:'scelta',valori_ammessi:[0.4,0.6],valore_default:0.6,ordine:0,created_at:'ieri',updated_at:'ieri'};
      mock.module('@/integrations/supabase/client',()=>({supabase:{from:table=>({
        select:()=>({eq:()=>table==='kit_parametri'?{order:()=>({order:async()=>({data:[parametro],error:null})})}:{single:async()=>({data:kit,error:null})},like:()=>({order:()=>({range:async()=>({data:[{codice:'SM-1'}],error:null})})}),order:()=>({order:async()=>({data:[{id:'f',linea:'sistema_made',codice:'PARETE',attiva:true}],error:null})})}),
        insert:rows=>{inserts[table]=rows;if(table==='kit')return{select:()=>({single:async()=>({data:{...rows,id:'new'},error:null})})};return Promise.resolve({error:table===errorTable?{message:'errore prova'}:null});}
      })}}));
      const {duplicateKit}=await import('./src/lib/kit-api.ts');
      let message='';try{await duplicateKit('orig');}catch(e){message=e.message;}
      if(errorTable){if(!message.includes('copia '+(errorTable==='kit_parametri'?'parametri':'componenti')+' non completata'))throw Error('Errore parziale non esplicito');}
      else{
        const c=inserts.kit_componenti[0],p=inserts.kit_parametri[0];
        for(const [campo,valore]of Object.entries({n_pezzi:2,passo:0.6,passo_2:0.5,consumo:0.716666666666667,lati:2,confezione:1000,sfrido:0.05,peso_unitario:8.7,riga_rif:3}))if(c[campo]!==valore)throw Error('Campo semplice perso: '+campo);
        if(c.regola_base!=='PARAM:PASSO'||c.regola_moltiplica!=='2.5'||c.regola_aggiunta!=='0.05'||c.regola_confezione!=='1000')throw Error('Regole perse');
        if(p.kit_id!=='new'||p.valori_ammessi.length!==2||p.valore_default!==0.6||'id'in p||'created_at'in p||'updated_at'in p)throw Error('Parametri non copiati correttamente');
      }
    `);
  });
}
test('FM91 codice parametro duplicato dal database: errore italiano', async () => {
  await esegui(`
    import{mock}from'bun:test';mock.module('@/integrations/supabase/client',()=>({supabase:{from:()=>({insert:()=>({select:()=>({single:async()=>({data:null,error:{code:'23505',message:'duplicate'}})})})})}}));
    const{salvaKitParametro}=await import('./src/lib/kit-api.ts');let message='';try{await salvaKitParametro('k',null,${JSON.stringify(p)});}catch(e){message=e.message;}
    if(message!=='Codice parametro già usato in questo kit.')throw Error('Errore non italiano');
  `);
});