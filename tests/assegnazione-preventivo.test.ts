import { expect, test } from 'bun:test';
import { assegnazioneModificabile, filtroPreventiviPerMe } from '../src/lib/assegnazione-preventivo';

test('FM72 Per me include responsabile oppure copia', () => {
  const id = '30c9d579-76c3-4312-b47e-3f9f4680fc40';
  expect(filtroPreventiviPerMe(id)).toBe(`assegnato_a.eq.${id},assegnati_copia.cs.{${id}}`);
  expect(() => filtroPreventiviPerMe('x,stato.eq.bozza')).toThrow();
});
test('FM72 confermato è in sola lettura anche per chi scrive', () => {
  expect(assegnazioneModificabile({ stato: 'confermato', tipo: 'preventivo' }, ['preventivi_write'])).toBe(false);
});
test('FM72 ordine è in sola lettura anche per amministratore', () => {
  expect(assegnazioneModificabile({ stato: 'bozza', tipo: 'ordine' }, ['amministratore'])).toBe(false);
});
test('FM72 assegnazione richiede scrittura preventivi', () => {
  expect(assegnazioneModificabile({ stato: 'bozza', tipo: 'preventivo' }, ['preventivi_read'])).toBe(false);
  expect(assegnazioneModificabile({ stato: 'bozza', tipo: 'preventivo' }, ['preventivi_write'])).toBe(true);
});
test('FM72 query Per me e ricerca sono in AND, con array cs e lettura RLS', async () => {
  const script = `
    import {mock} from 'bun:test';
    let calls=[];
    const q={select(v){calls.push(['select',v]);return this},is(){return this},order(){return this},limit(){return this},eq(){return this},in(){return this},or(v){calls.push(['or',v]);return this},then(done){return Promise.resolve({data:[],error:null}).then(done)}};
    mock.module('@/integrations/supabase/client',()=>({supabase:{from:()=>q,rpc:async()=>({data:[],error:null})}}));
    const {fetchElencoPreventivi}=await import('./src/lib/preventivi-api.ts');
    const id='30c9d579-76c3-4312-b47e-3f9f4680fc40';
    await fetchElencoPreventivi({per_me:id});
    if(calls.find(x=>x[0]==='or')[1]!==('assegnato_a.eq.'+id+',assegnati_copia.cs.{'+id+'}')) throw Error('Filtro Per me errato');
    calls=[];await fetchElencoPreventivi({per_me:id,search:'cantiere'});
    const ors=calls.filter(x=>x[0]==='or');
    if(ors.length!==1 || ors[0][1]!==('and(or(numero.ilike.%cantiere%,titolo.ilike.%cantiere%),or(assegnato_a.eq.'+id+',assegnati_copia.cs.{'+id+'}))')) throw Error('Ricerca e Per me non congiunti');
    if(!calls.find(x=>x[0]==='select')[1].startsWith('*')) throw Error('Campi assegnazione assenti');
  `;
  const p = Bun.spawn(['bun','-e',script],{cwd:process.cwd(),stdout:'pipe',stderr:'pipe'});
  const errore=await new Response(p.stderr).text(); expect(await p.exited,errore).toBe(0);
});