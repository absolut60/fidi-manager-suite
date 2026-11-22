import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function sorgente(path: string) {
  return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function trova<T extends ts.Node>(sf: ts.Node, predicato: (n: ts.Node) => n is T): T {
  let trovato: T | undefined;
  const visita = (n: ts.Node) => { if (predicato(n)) trovato = n; else ts.forEachChild(n, visita); };
  visita(sf); if (!trovato) throw new Error('Regola da verificare non trovata'); return trovato;
}

test('FM95: creazione ordine ammette lead tramite lo stesso selettore, senza gate tipo documento', () => {
  const sf = sorgente('src/components/preventivatore/NuovoPreventivoDialog.tsx');
  const picker = trova(sf, (n): n is ts.JsxSelfClosingElement => ts.isJsxSelfClosingElement(n) && n.tagName.getText(sf) === 'SoggettoPreventivoPicker');
  const attr = picker.attributes.properties.find(n => ts.isJsxAttribute(n) && n.name.getText(sf) === 'consentiLead');
  expect(attr && ts.isJsxAttribute(attr) && attr.initializer === undefined).toBe(true);
});

test('FM95: guardia effettiva finestra solo ordine amministratore, nessuna concessione a manage o direzione', () => {
  const sf = sorgente('src/routes/_app/preventivatore.$id.tsx');
  const dialog = trova(sf, (n): n is ts.JsxSelfClosingElement => ts.isJsxSelfClosingElement(n) && n.tagName.getText(sf) === 'FileGammaDiProvaDialog');
  if (!ts.isBinaryExpression(dialog.parent)) throw new Error('Guardia del dialog assente');
  const valuta = new Function('prev', 'hasRole', 'fileGammaOpen', `return Boolean(${dialog.parent.left.getText(sf)});`) as (prev: { tipo: string }, hasRole: (role: string) => boolean, aperta: boolean) => boolean;
  expect(valuta({ tipo: 'ordine' }, r => r === 'amministratore', true)).toBe(true);
  for (const ruolo of ['preventivi_manage', 'direzione', 'store_manager', 'showroom', 'responsabile_showroom'])
    expect(valuta({ tipo: 'ordine' }, r => r === ruolo, true)).toBe(false);
  expect(valuta({ tipo: 'preventivo' }, r => r === 'amministratore', true)).toBe(false);
});

test('FM95: download assente con bloccanti o senza file, presente solo con ordine esportabile', () => {
  const sf = sorgente('src/components/preventivatore/FileGammaDiProvaDialog.tsx');
  const fn = trova(sf, (n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === 'FileGammaDiProvaContenuto');
  const dichiarazione = trova(fn, (n): n is ts.VariableDeclaration => ts.isVariableDeclaration(n) && n.name.getText(sf) === 'pronto');
  if (!dichiarazione.initializer) throw new Error('Regola download assente');
  const valuta = new Function('bloccanti', 'esito', `return ${dichiarazione.initializer.getText(sf)};`) as (bloccanti: unknown[], esito: { ordiniEsportati: string[] }) => boolean;
  expect(valuta([{}], { ordiniEsportati: ['o'] })).toBe(false);
  expect(valuta([], { ordiniEsportati: [] })).toBe(false);
  expect(valuta([], { ordiniEsportati: ['o'] })).toBe(true);
});