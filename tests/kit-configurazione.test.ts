import { expect, test } from 'bun:test';
import { Constants } from '../src/integrations/supabase/types';
import { LINEE_PREVENTIVO } from '../src/lib/linee-preventivo';

test('FM90 ogni linea dell’enum database ha una configurazione kit', () => {
  expect(Object.keys(LINEE_PREVENTIVO).sort()).toEqual([...Constants.public.Enums.linea_preventivo].sort());
  for (const linea of Constants.public.Enums.linea_preventivo) {
    expect(LINEE_PREVENTIVO[linea].kit).toBeDefined();
  }
});

test('FM92 Sistema MADE: solo configurazione semplice completa', () => {
  expect(LINEE_PREVENTIVO.sistema_made.kit).toEqual({ prefissoCodice: 'SM', umBaseDefault: 'mq', etichettaQuantita: 'Incidenza per {um}', calcoloSemplice: 'completo', specifiche: [] });
});
for (const [linea, prefissoCodice] of [['showroom','SR'], ['edilizia','ED'], ['fotovoltaico','FV']] as const) {
  test(`FM92 ${linea}: solo quantità e peso`, () => {
    expect(LINEE_PREVENTIVO[linea].kit).toEqual({ prefissoCodice, umBaseDefault: 'kit', etichettaQuantita: 'Quantità per kit', calcoloSemplice: 'solo_quantita', specifiche: [] });
  });
}

test('FM90 duplicazione kit non riutilizza il codice univoco e conserva i dati attuali', async () => {
  const script = `
    import {mock} from 'bun:test';
    const kit={id:'originale',codice:'PROVA-1',nome:'Prova',linea:'sistema_made',famiglia_id:'famiglia',um_base:'mq',specifiche:{},componenti:[{id:'componente',kit_id:'originale',articolo_codice:null,codice_articolo_fornitore:'MAN-01',descrizione:'Lastra manuale',um:'MQ',fornitore_id:'fornitore',marca:'Marca',costo:12,listino_fornitore:20,note:'Nota',ruolo:'lastra',n_pezzi:2,passo:0.6,passo_2:0.5,consumo:0.716666666666667,lati:2,confezione:1000,sfrido:0.05,riga_rif:3,peso_unitario:8.7,ordine:1}]};
    let nuovo,componenti;
    mock.module('@/integrations/supabase/client',()=>({supabase:{from:table=>({
      select:()=>({eq:()=>({single:async()=>({data:kit,error:null})}),like:()=>({order:()=>({range:async()=>({data:[{codice:'SM-9'}],error:null})})}),order:()=>({order:async()=>({data:[{id:'famiglia',linea:'sistema_made',codice:'PARETE',attiva:true}],error:null})})}),
      insert:row=>{if(table==='kit'){nuovo=row;return{select:()=>({single:async()=>({data:{...row,id:'copia'},error:null})})}}componenti=row;return Promise.resolve({error:null})}
    })}}));
    const {duplicateKit}=await import('./src/lib/kit-api.ts');
    const copia=await duplicateKit('originale');
    if(nuovo.codice!=='SM-10' || copia.codice===kit.codice) throw Error('Codice proposto errato');
    if(nuovo.nome!=='Prova (copia)' || nuovo.famiglia_id!=='famiglia' || Object.keys(nuovo.specifiche).length!==0 || 'famiglia' in nuovo) throw Error('Dati kit persi');
    if(componenti.length!==1 || componenti[0].kit_id!=='copia' || componenti[0].n_pezzi!==2 || componenti[0].consumo!==0.716666666666667 || componenti[0].riga_rif!==3) throw Error('Componenti persi');
    for(const campo of ['n_pezzi','passo','passo_2','consumo','lati','confezione','sfrido','riga_rif','peso_unitario'])if(componenti[0][campo]!==kit.componenti[0][campo])throw Error('Campo semplice perso: '+campo);
    if(componenti[0].codice_articolo_fornitore!=='MAN-01' || componenti[0].costo!==12 || componenti[0].listino_fornitore!==20 || componenti[0].marca!=='Marca' || componenti[0].note!=='Nota' || 'articolo_id' in componenti[0] || 'id' in componenti[0]) throw Error('Campi nuovi non copiati');
  `;
  const processo = Bun.spawn(['bun', '-e', script], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  const errore = await new Response(processo.stderr).text();
  expect(await processo.exited, errore).toBe(0);
});
