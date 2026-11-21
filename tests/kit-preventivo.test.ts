import { expect, test } from 'bun:test';
import { preparaRigheKitPreventivo, gruppiKitPreventivo } from '../src/lib/kit-preventivo';
import { campiRigaGammaPreventivo } from '../src/lib/riga-gamma-preventivo';
import { patchConImporto, pesoUnitarioRigaPreventivo, type PrezzoClienteGamma } from '../src/lib/riga-preventivo';
import type { KitConComponenti, KitFamiglia } from '../src/lib/kit-api';

const campi = [
  { n_pezzi: 1, peso_unitario: 8.7, ruolo: 'LASTRE' },
  { n_pezzi: 1, consumo: 0.716666666666667, ruolo: 'GUIDE' },
  { n_pezzi: 2, passo: 0.6, sfrido: 0.05, ruolo: 'MONTANTI' },
  { n_pezzi: 1, peso_unitario: 0.59, ruolo: 'ISOLANTI' },
  { n_pezzi: 1, peso_unitario: 8.7, ruolo: 'LASTRE' },
  { n_pezzi: 1, confezione: 20, ruolo: 'NASTRO' },
  { riga_rif: 2, passo: 0.5, peso_unitario: 0.0043, ruolo: 'TASSELLI' },
  { riga_rif: 3, lati: 2, passo: 0.2, confezione: 1000, peso_unitario: 1.4, ruolo: 'VITI' },
  { consumo: 0.4, lati: 2, confezione: 10, peso_unitario: 10, ruolo: 'STUCCO' },
  { consumo: 1.44, lati: 2, confezione: 90, peso_unitario: 0.3, ruolo: 'NASTRO' },
];
const kit = { id: 'kit', linea: 'sistema_made', famiglia_id: 'pareti', componenti: campi.map((c, i) => ({ ...c, ordine: i + 1, articolo_codice: `G${i + 1}`, articolo: { codice: `G${i + 1}`, descrizione: `Descrizione Gamma ${i + 1}`, um: 'MQ', peso_netto: 0.25 } })) } as unknown as KitConComponenti;
const prezzo: PrezzoClienteGamma = { prezzo_base: 10, sc1: 17, sc2: 5, sc3: 0, sc4: 0, sc5: 0, sc6: 0, maggiorazione_perc: 10, costo_ultimo: 3 };
const prezzi = new Map(kit.componenti.map(c => [c.articolo_codice ?? '', prezzo]));
const prepara = (k = kit) => preparaRigheKitPreventivo({ kit: k, quantitaBase: 100, scontoPiede: 2, prezzi, dedicati: new Map() });

test('FM91 Da kit: dieci righe Gamma a 100 mq con incidenza completa, quantità e sottocategoria', () => {
  const { righe, saltate } = prepara();
  expect(saltate).toEqual([]);
  expect(righe).toHaveLength(10);
  for (const [i, r] of righe.entries()) {
    expect(r.articolo_codice).toBe(`G${i + 1}`);
    expect(r.tipo_riga).toBe('articolo_singolo');
    expect(r.descrizione).toBe(`Descrizione Gamma ${i + 1}`);
    expect(r.ruolo_kit).toBe(campi[i]?.ruolo);
    expect(r.ordine).toBe(i + 1);
    expect(r.um_scelta).toBe('um1');
    expect(r.aliquota_iva).toBeNull();
  }
  expect(righe[2]?.incidenza).toBeCloseTo(3.3833333333333333, 14);
  expect(righe[2]?.quantita).toBe(338.33);
  expect(righe[6]?.incidenza).toBeCloseTo(1.433333333333334, 14);
  expect(righe[6]?.quantita).toBe(143.33);
  expect(righe[7]?.incidenza).toBeCloseTo(0.016916666666666667, 14);
  expect(righe[7]?.quantita).toBe(1.69);
});

test('FM91 Da kit e picker Gamma chiamano gli stessi campi prezzo, incluso il cantiere', () => {
  const dedicato = { prezzo_vendita_speciale: 12, sconti: [10, 5], maggiorazione_perc: 3, costo_netto_speciale: 4 };
  const output = preparaRigheKitPreventivo({ kit, quantitaBase: 100, scontoPiede: 2, prezzi, dedicati: new Map([['G1', dedicato]]) });
  const r = output.righe[0];
  if (!r) throw new Error('Riga non generata');
  const manualeGamma = campiRigaGammaPreventivo({}, { codice: 'G1', descrizione: 'Descrizione Gamma 1', um: 'MQ' }, 100, 2, prezzo, dedicato);
  for (const campo of ['prezzo_unit', 'sconti_gamma', 'maggiorazione_perc', 'sconto_perc', 'costo', 'importo', 'fonte_prezzo', 'um', 'um_scelta'] as const)
    expect(r[campo]).toEqual(manualeGamma[campo]);
  expect(r.fonte_prezzo).toBe('cantiere');
  expect(r.costo).toBe(400);
});

test('FM91 Da kit: ricalcolo mq usa incidenza salvata e mantiene il peso unitario del kit', () => {
  const r = prepara().righe[0];
  if (!r) throw new Error('Riga non generata');
  expect(r.peso).toBeCloseTo(870, 12);
  const corrente = { ...r, peso_gamma_unit: pesoUnitarioRigaPreventivo(r, 0.25) };
  const patch = patchConImporto(corrente, { incidenza: r.incidenza }, 200);
  expect(patch.quantita).toBe(200);
  expect(patch.peso).toBeCloseTo(1740, 12);
  expect(patch.costo).toBe(600);
  expect(pesoUnitarioRigaPreventivo({ quantita: 100, peso: 870, ruolo_kit: null }, 0.25)).toBe(0.25);
  const guida = prepara().righe[1];
  expect(guida?.peso).toBeCloseTo(71.67 * 0.25, 12);
});

test('FM91 Da kit: articolo manuale conserva anagrafica, costo unitario e prezzo nuovo vuoto', () => {
  const k = { ...kit, componenti: [{ ordine: 1, n_pezzi: 2, articolo_codice: null, articolo: null, codice_articolo_fornitore: 'MAN-1', descrizione: 'Articolo in definizione', um: 'NR', fornitore_id: 'fornitore', marca: 'Marca', costo: 3, listino_fornitore: 12, ruolo: 'LASTRE', peso_unitario: 4 }] } as unknown as KitConComponenti;
  expect(prepara(k).righe[0]).toMatchObject({ tipo_riga: 'manuale', articolo_codice: null, codice_articolo_fornitore: 'MAN-1', descrizione: 'Articolo in definizione', um: 'NR', fornitore_id: 'fornitore', marca: 'Marca', costo: 600, listino_fornitore: 12, incidenza: 2, quantita: 200, prezzo_unit: null, importo: 0, fonte_prezzo: 'manuale', peso: 800, ruolo_kit: 'LASTRE' });
});

test('FM91 Da kit: righe con divisore zero o Gamma assente escluse e segnalate, ordine conservato', () => {
  const k = { ...kit, componenti: kit.componenti.map(c => c.ordine === 3 ? { ...c, passo: 0 } : c.ordine === 4 ? { ...c, articolo: null } : c) };
  const result = prepara(k);
  expect(result.saltate.map(r => r.ordine)).toEqual([3, 4, 8]);
  expect(result.saltate[0]?.motivo).toContain('Divisione per zero');
  expect(result.saltate[1]?.motivo).toContain('Articolo Gamma non disponibile');
  expect(result.saltate[2]?.motivo).toContain('riga 3 contiene un errore');
  expect(result.righe.map(r => r.ordine)).toEqual([1, 2, 5, 6, 7, 9, 10]);
});

test('FM91 scelta kit: solo linea documento e gruppi per famiglia, senza perdita dei kit senza famiglia', () => {
  const showroom = { ...kit, id: 'showroom', linea: 'showroom' } as KitConComponenti;
  const altro = { ...kit, id: 'altro', famiglia_id: null };
  const famiglie = [{ id: 'pareti', nome: 'Pareti', linea: 'sistema_made' }] as KitFamiglia[];
  expect(gruppiKitPreventivo([kit, showroom, altro], famiglie, 'sistema_made').map(g => ({ nome: g.nome, ids: g.kits.map(k => k.id) })))
    .toEqual([{ nome: 'Pareti', ids: ['kit'] }, { nome: 'Senza famiglia', ids: ['altro'] }]);
  expect(gruppiKitPreventivo([kit, showroom, altro], famiglie, 'sistema_made', 'pareti').flatMap(g => g.kits).map(k => k.id)).toEqual(['kit']);
});

for (const altraLinea of [false, true]) test(`FM91 API inserimento kit: ${altraLinea ? 'linea diversa bloccata prima di scrivere' : 'dispatcher FM71, inserimento e ricalcolo reali'}`, async () => {
  const script = `
    import { mock } from 'bun:test';
    const kit=${JSON.stringify(kit)};
    const prezzo=${JSON.stringify(prezzo)};
    let rows=[],blocchi=[],rpcCalls=[],insertCalls=0;
    const documento={linea:${JSON.stringify(altraLinea ? 'showroom' : 'sistema_made')},iva_perc:22,regime_iva:'ordinaria'};
    mock.module('@/integrations/supabase/client',()=>({supabase:{
      rpc:async(nome,args)=>{rpcCalls.push({nome,args});return {data:kit.componenti.map(c=>({...prezzo,articolo_codice:c.articolo_codice})),error:null}},
      from:table=>{
        let select='',action='select',payload,filterId;
        const q={select:s=>{select=s??'*';return q},eq:(k,v)=>{if(k==='id')filterId=v;return q},in:()=>q,
          insert:p=>{action='insert';payload=p;insertCalls++;if(table==='righe_preventivo')rows=p.map((r,i)=>({...r,id:'r'+i}));if(table==='blocchi_preventivo')blocchi=[{...p,id:'bloc'}];return q},
          update:p=>{action='update';payload=p;return q},
          single:async()=>({data:table==='preventivi'?documento:select==='preventivo_id, preventivo:preventivi(iva_perc, regime_iva)'?{preventivo_id:'prev',preventivo:documento}:blocchi[0],error:null}),
          then:resolve=>{if(action==='update'&&table==='righe_preventivo')rows=rows.map(r=>r.id===filterId?{...r,...payload}:r);
            return Promise.resolve(resolve({error:null,data:table==='blocchi_preventivo'?blocchi.map(b=>({...b,righe:rows})):table==='articoli_gamma'?kit.componenti.map(c=>({codice:c.articolo_codice,peso_netto:0.25,um:'MQ',um2:null,fattore_conversione:null})):null}));}
        };return q;
      }
    }}));
    mock.module('@/lib/kit-api',()=>({fetchKit:async()=>kit,fetchKitParametri:async()=>[]}));
    const {addBloccoDaKit,ricalcolaBloccoSuNuovaQuantita}=await import('./src/lib/preventivi-api.ts');
    let errore='';let risultato;
    try{risultato=await addBloccoDaKit({preventivo_id:'prev',kit_id:'kit',quantita_base:100,ordine:1,cliente_id:null,sconto_piede:2,condizioni_prezzi:{cliente_id:null,listino_rif:1,macrocategoria_rif:'01',categoria_rif:'02',store_id:'sede'}});}catch(e){errore=e.message}
    if(${altraLinea}){if(!errore.includes('stessa linea')||insertCalls!==0)throw Error('Linea diversa inserita');}
    else{
      if(errore)throw Error(errore);
      if(rows.length!==10||risultato.righeSaltate.length!==0||rows[2].quantita!==338.33||rows[2].ruolo_kit!=='MONTANTI')throw Error('Righe incomplete');
      if(rpcCalls.length!==1||rpcCalls[0].nome!=='prezzi_preventivo_riferimento'||rpcCalls[0].args._store_id!=='sede')throw Error('Dispatcher FM71 non riusato');
      await ricalcolaBloccoSuNuovaQuantita('bloc',200,rows);
      if(rows[0].quantita!==200||Math.abs(rows[0].peso-1740)>1e-10||rows[2].quantita!==676.67)throw Error('Ricalcolo errato');
    }
  `;
  const p = Bun.spawn(['bun', '-e', script], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  const err = await new Response(p.stderr).text();
  expect(await p.exited, err).toBe(0);
});