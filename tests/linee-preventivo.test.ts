import { expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { LINEE_PREVENTIVO, lineaPreventivo, lineeAttive, mostraFiltroLinee } from '../src/lib/linee-preventivo';

test('F7 catalogo: quattro linee, attive Sistema MADE e Showroom', () => {
  expect(Object.keys(LINEE_PREVENTIVO)).toEqual(['sistema_made', 'showroom', 'edilizia', 'fotovoltaico']);
  expect(lineeAttive().map(l => l.codice)).toEqual(['sistema_made', 'showroom']);
  expect(mostraFiltroLinee).toBe(true);
});
test('FM72 fallback sicuro anche per proprietà del prototipo e valori mancanti', () => {
  for (const valore of ['ignota', '__proto__', 'constructor', null, undefined]) expect(lineaPreventivo(valore)).toBe(LINEE_PREVENTIVO.sistema_made);
  expect(lineaPreventivo('showroom')).toBe(LINEE_PREVENTIVO.showroom);
});

const codici = new Set(Object.keys(LINEE_PREVENTIVO));
function confronti(file: string, source: string): string[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const letteraleLinea = (n: ts.Node): boolean => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && codici.has(n.text);
  function visita(n: ts.Node) {
    if (ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(n.operatorToken.kind) && (letteraleLinea(n.left) || letteraleLinea(n.right))) out.push(n.getText(ast));
    if (ts.isCaseClause(n) && letteraleLinea(n.expression)) out.push(n.getText(ast));
    ts.forEachChild(n, visita);
  }
  visita(ast);
  return out;
}
function sorgenti(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? sorgenti(join(dir, e.name)) : /\.[cm]?[jt]sx?$/.test(e.name) ? [join(dir, e.name)] : []);
}
test('FM72 guardia: nessun confronto diretto fuori dal catalogo', () => {
  const esclusi = new Set(['src/lib/linee-preventivo.ts', 'src/integrations/supabase/types.ts', 'src/routeTree.gen.ts']);
  expect(sorgenti('src').filter(f => !esclusi.has(f)).flatMap(file => confronti(file, readFileSync(file, 'utf8')).map(espressione => ({ file, espressione })))).toEqual([]);
});
test('FM72 guardia rileva confronti invertiti, disuguaglianze e switch', () => {
  expect(confronti('prova.ts', `if (linea === 'showroom') {}; if ('edilizia' != linea) {}; switch(linea) { case 'fotovoltaico': break; }`)).toHaveLength(3);
});
test('FM72 creazione omette linea, copia e alternativa conservano origine', async () => {
  const script = `
    import {mock} from 'bun:test';
    const payloads=[];
    mock.module('@/integrations/supabase/client',()=>({supabase:{from:()=>({insert:v=>{payloads.push(v);return {select:()=>({single:async()=>({data:{id:'p'},error:null})})}}})}}));
    const {createPreventivo}=await import('./src/lib/preventivi-api.ts');
    await createPreventivo({titolo:'Nuovo',linea:'showroom'});
    await createPreventivo({titolo:'Copia'}, {linea:'edilizia'});
    if ('linea' in payloads[0] || payloads[1].linea !== 'edilizia') throw Error('Default/copia errati');
  `;
  const processo = Bun.spawn(['bun', '-e', script], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  const errore = await new Response(processo.stderr).text();
  expect(await processo.exited, errore).toBe(0);
  const api = readFileSync('src/lib/preventivi-api.ts', 'utf8');
  const duplicazione = api.slice(api.indexOf('export async function duplicaPreventivo'), api.indexOf('export async function insertBlocco'));
  expect(duplicazione).toContain('}, { linea: src.linea });');
});
test('FM72 filtro elenco multiplo mantiene tutti i codici selezionati', async () => {
  const script = `
    import {mock} from 'bun:test';
    const calls=[];
    mock.module('@/integrations/supabase/client',()=>({supabase:{from:()=>{
      const q={}; for(const m of ['select','is','order','limit','eq','in']) q[m]=(...args)=>{calls.push({m,args});return q};
      q.then=resolve=>resolve({data:[],error:null});return q;
    }}}));
    const {fetchElencoPreventivi}=await import('./src/lib/preventivi-api.ts');
    await fetchElencoPreventivi({linea:['sistema_made','showroom']});
    const filtro=calls.find(c=>c.m==='in'&&c.args[0]==='linea');
    if(JSON.stringify(filtro?.args[1])!==JSON.stringify(['sistema_made','showroom'])) throw Error('Filtro OR errato');
  `;
  const processo = Bun.spawn(['bun', '-e', script], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  const errore = await new Response(processo.stderr).text();
  expect(await processo.exited, errore).toBe(0);
});test('FM75 F1 comportamenti blocchi per linea', () => {
  const flag = Object.fromEntries(Object.values(LINEE_PREVENTIVO).map(l => [l.codice, l.blocchi]));
  expect(flag).toEqual({
    sistema_made: { bloccoConMisure: true, bloccoDaKit: true, righeStampabili: false, regimiIva: false, articoloInDefinizione: true, importoInTestataBlocco: true, colonneGammaRiga: true },
    showroom: { bloccoConMisure: false, bloccoDaKit: false, righeStampabili: true, regimiIva: true, articoloInDefinizione: true, importoInTestataBlocco: false, colonneGammaRiga: false },
    edilizia: { bloccoConMisure: true, bloccoDaKit: true, righeStampabili: false, regimiIva: false, articoloInDefinizione: false, importoInTestataBlocco: true, colonneGammaRiga: true },
    fotovoltaico: { bloccoConMisure: true, bloccoDaKit: true, righeStampabili: false, regimiIva: false, articoloInDefinizione: false, importoInTestataBlocco: true, colonneGammaRiga: true },
  });
  expect(lineaPreventivo(null).blocchi.bloccoConMisure).toBe(true);
});

test('Corpo showroom: senza Peso/±/Magg./Extra, con Ricarico % e importo solo nel piede', () => {
  const src = readFileSync('src/components/preventivatore/RigheTable.tsx', 'utf8');
  expect(src).toContain('colonneGammaRiga: gamma');
  expect(src).toMatch(/\{gamma && <th[^>]*>Peso<\/th>\}/);
  expect(src).toMatch(/\{gamma && <th[^>]*>±<\/th>\}/);
  expect(src).toMatch(/: <th[^>]*>Ricarico %<\/th>\}/);
  expect(src).toContain('applicaLeva({ leva: "ricarico"');
});
