import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { fetchPrezziPreventivo, type ClientPrezziPreventivo, type CondizioniPrezziPreventivo, type PrezzoPreventivoGamma } from "../src/lib/prezzi-preventivo";
import { patchConFontePrezzo, prezzoConPrioritaCantiere } from "../src/lib/riga-preventivo";

const base: CondizioniPrezziPreventivo = { cliente_id: "cliente", store_id: "sede-preventivo", listino_rif: null, macrocategoria_rif: null, categoria_rif: null, data: "2026-11-14" };
const prezzo = { articolo_codice: "ART", prezzo_base: 10 } as PrezzoPreventivoGamma;
function clientProva() {
  const chiamate: { nome: string; parametri: unknown }[] = [];
  const client = { rpc: async (nome: string, parametri: unknown) => { chiamate.push({ nome, parametri }); return { data: [prezzo], error: null }; } } as ClientPrezziPreventivo;
  return { client, chiamate };
}
describe("FM71 dispatcher prezzi", () => {
  test("senza riferimento chiama cliente, preservando codici unici e data", async () => {
    const { client, chiamate } = clientProva();
    expect((await fetchPrezziPreventivo(base, ["ART", "ART", ""], client)).get("ART")).toBe(prezzo);
    expect(chiamate).toEqual([{ nome: "prezzi_preventivo_cliente", parametri: { _cliente_id: "cliente", _codici: ["ART"], _data: "2026-11-14" } }]);
  });
  test("riferimento usa categorie e sede del preventivo anche senza cliente", async () => {
    const { client, chiamate } = clientProva();
    await fetchPrezziPreventivo({ ...base, cliente_id: null, listino_rif: 30, macrocategoria_rif: "01", categoria_rif: "01" }, ["ART"], client);
    expect(chiamate).toEqual([{ nome: "prezzi_preventivo_riferimento", parametri: { _listino: 30, _macrocategoria: "01", _categoria: "01", _store_id: "sede-preventivo", _codici: ["ART"], _data: "2026-11-14" } }]);
  });
  test("sede NULL resta NULL senza riserva cliente", async () => {
    const { client, chiamate } = clientProva();
    await fetchPrezziPreventivo({ ...base, listino_rif: 10, store_id: null }, ["ART"], client);
    expect(chiamate[0]?.parametri).toEqual({ _listino: 10, _macrocategoria: null, _categoria: null, _store_id: null, _codici: ["ART"], _data: "2026-11-14" });
  });
  test("senza cliente né riferimento, o senza codici, non chiama RPC", async () => {
    const { client, chiamate } = clientProva();
    expect((await fetchPrezziPreventivo({ ...base, cliente_id: null }, ["ART"], client)).size).toBe(0);
    await fetchPrezziPreventivo(base, [], client);
    expect(chiamate).toHaveLength(0);
  });
  test("riferimento mantiene fonte listino e priorità del cantiere", async () => {
    const { client } = clientProva();
    const p = (await fetchPrezziPreventivo({ ...base, listino_rif: 30 }, ["ART"], client)).get("ART");
    expect(patchConFontePrezzo({}, { prezzo_unit: 10 }, prezzoConPrioritaCantiere(p).fonte).fonte_prezzo).toBe("listino");
    const scelta = prezzoConPrioritaCantiere(p, { prezzo_vendita_speciale: 6.5, sconti: [], maggiorazione_perc: 0, costo_netto_speciale: null });
    expect(scelta.prezzo?.prezzo_base).toBe(6.5);
    expect(scelta.fonte).toBe("cantiere");
  });
  test("duplicazione copia tutti i tre campi riferimento", () => {
    const s = readFileSync("src/lib/preventivi-api.ts", "utf8");
    const copia = s.slice(s.indexOf("export async function duplicaPreventivo"), s.indexOf("export async function insertBlocco"));
    for (const campo of ["listino_rif", "macrocategoria_rif", "categoria_rif"]) expect(copia).toContain(`${campo}: src.${campo}`);
  });
});

// Nessuna eccezione tecnica: i lettori cliente storici delegano anch'essi al dispatcher.
const eccezioniTecniche: { file: string; espressione: string }[] = [];
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
}
function chiamateRpc(file: string, source: string) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  function visita(n: ts.Node) {
    if (ts.isCallExpression(n) && ((ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "rpc") || (ts.isElementAccessExpression(n.expression) && n.expression.argumentExpression?.getText(ast) === '"rpc"'))) {
      const nome = n.arguments[0];
      if (nome && /prezzi_preventivo_(cliente|riferimento)/.test(nome.getText(ast))) out.push(n.getText(ast));
    }
    ts.forEachChild(n, visita);
  }
  visita(ast); return out;
}
test("guardia: le due RPC prezzi si chiamano solo dalla fonte unica", () => {
  const violazioni = files("src").filter(f => f !== "src/lib/prezzi-preventivo.ts").flatMap(file => chiamateRpc(file, readFileSync(file, "utf8")).filter(espressione => !eccezioniTecniche.some(e => e.file === file && e.espressione === espressione)).map(espressione => ({ file, espressione })));
  expect(violazioni).toEqual([]);
});
test("guardia rileva un nuovo chiamante diretto", () => {
  expect(chiamateRpc("prova.ts", 'db.rpc("prezzi_preventivo_cliente", {})')).toHaveLength(1);
  expect(chiamateRpc("prova.ts", 'db.rpc("prezzi_preventivo_riferimento", {})')).toHaveLength(1);
});