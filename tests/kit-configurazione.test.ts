import { expect, test } from 'bun:test';
import { Constants } from '../src/integrations/supabase/types';
import { LINEE_PREVENTIVO } from '../src/lib/linee-preventivo';

test('FM90 ogni linea dell’enum database ha una configurazione kit', () => {
  expect(Object.keys(LINEE_PREVENTIVO).sort()).toEqual([...Constants.public.Enums.linea_preventivo].sort());
  for (const linea of Constants.public.Enums.linea_preventivo) {
    expect(LINEE_PREVENTIVO[linea].kit).toBeDefined();
  }
});

test('FM90 Sistema MADE: prefisso SM, mq, sei colonne e sei specifiche tipizzate', () => {
  expect(LINEE_PREVENTIVO.sistema_made.kit).toEqual({
    prefissoCodice: 'SM', umBaseDefault: 'mq', etichettaQuantita: 'Incidenza per {um}',
    regole: 'complete', parametri: true,
    colonneComponente: ['ruolo', 'lato', 'strato', 'tipo_driver', 'valore_driver', 'incidenza'],
    specifiche: [
      { codice: 'tipo_struttura', etichetta: 'Tipo struttura', tipo: 'testo' },
      { codice: 'spessore_mm', etichetta: 'Spessore (mm)', tipo: 'numero' },
      { codice: 'h_max_m', etichetta: 'Altezza massima (m)', tipo: 'numero' },
      { codice: 'passo', etichetta: 'Passo', tipo: 'numero' },
      { codice: 'passo_um', etichetta: 'U.M. passo', tipo: 'testo' },
      { codice: 'isolante', etichetta: 'Isolante', tipo: 'testo' },
    ],
  });
});

for (const [linea, prefissoCodice] of [ ['showroom', 'SR'], ['edilizia', 'ED'], ['fotovoltaico', 'FV'] ] as const) {
  test(`FM90 ${linea}: prefisso ${prefissoCodice}, unità kit, ruolo/incidenza e nessuna specifica`, () => {
    expect(LINEE_PREVENTIVO[linea].kit).toEqual({
      prefissoCodice, umBaseDefault: 'kit', etichettaQuantita: 'Quantità per kit',
      regole: 'solo_base', parametri: false,
      colonneComponente: ['ruolo', 'incidenza'], specifiche: [],
    });
  });
}

test('FM90 duplicazione kit non riutilizza il codice univoco e conserva i dati attuali', async () => {
  const script = `
    import {mock} from 'bun:test';
    const kit={id:'originale',codice:'PROVA-1',nome:'Prova',linea:'sistema_made',famiglia_id:'famiglia',um_base:'mq',specifiche:{passo:600},componenti:[{id:'componente',kit_id:'originale',articolo_codice:null,codice_articolo_fornitore:'MAN-01',descrizione:'Lastra manuale',um:'MQ',fornitore_id:'fornitore',marca:'Marca',costo:12,listino_fornitore:20,note:'Nota',ruolo:'lastra',lato:1,strato:2,tipo_driver:'CONSUMO',valore_driver:5,incidenza:2,ordine:0}]};
    let nuovo,componenti;
    mock.module('@/integrations/supabase/client',()=>({supabase:{from:table=>({
      select:()=>({eq:()=>table==='kit_parametri'?{order:()=>({order:async()=>({data:[],error:null})})}:{single:async()=>({data:kit,error:null})},like:()=>({order:()=>({range:async()=>({data:[{codice:'SM-9'}],error:null})})}),order:()=>({order:async()=>({data:[{id:'famiglia',linea:'sistema_made',codice:'PARETE',attiva:true}],error:null})})}),
      insert:row=>{if(table==='kit'){nuovo=row;return{select:()=>({single:async()=>({data:{...row,id:'copia'},error:null})})}}componenti=row;return Promise.resolve({error:null})}
    })}}));
    const {duplicateKit}=await import('./src/lib/kit-api.ts');
    const copia=await duplicateKit('originale');
    if(nuovo.codice!=='SM-10' || copia.codice===kit.codice) throw Error('Codice proposto errato');
    if(nuovo.nome!=='Prova (copia)' || nuovo.famiglia_id!=='famiglia' || nuovo.specifiche.passo!==600) throw Error('Dati kit persi');
    if(componenti.length!==1 || componenti[0].kit_id!=='copia' || componenti[0].incidenza!==2 || componenti[0].valore_driver!==5) throw Error('Componenti persi');
    if(componenti[0].codice_articolo_fornitore!=='MAN-01' || componenti[0].costo!==12 || componenti[0].listino_fornitore!==20 || componenti[0].marca!=='Marca' || componenti[0].note!=='Nota' || 'articolo_id' in componenti[0] || 'id' in componenti[0]) throw Error('Campi nuovi non copiati');
  `;
  const processo = Bun.spawn(['bun', '-e', script], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  const errore = await new Response(processo.stderr).text();
  expect(await processo.exited, errore).toBe(0);
});

test('FM90 incidenza esplicita, anche zero, prevale sul driver nel motore attuale', async () => {
  const script = `
    import {mock} from 'bun:test';
    mock.module('@/integrations/supabase/client',()=>({supabase:{}}));
    const {calcolaRigaKit}=await import('./src/lib/kit-api.ts');
    const c={tipo_driver:'CONSUMO',valore_driver:5,incidenza:2};
    if(calcolaRigaKit(c,null,'A').incidenza_effettiva!==2) throw Error('Driver prevale su incidenza 2');
    if(calcolaRigaKit({...c,incidenza:0},null,'A').incidenza_effettiva!==0) throw Error('Driver prevale su incidenza zero');
  `;
  const processo = Bun.spawn(['bun', '-e', script], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  const errore = await new Response(processo.stderr).text();
  expect(await processo.exited, errore).toBe(0);
});