import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { partiMadeCerved } from "../src/lib/cerved/cerved-parti-made";

const fonte = readFileSync(new URL("../src/components/cliente-cerved-tab.tsx", import.meta.url), "utf8");

describe("FM90 scheda Cerved per entità", () => {
  it("lead: nessuna parte MADE", () => {
    expect(partiMadeCerved(false)).toEqual({ fidoMade: false, comePagaMade: false, confrontoMade: false });
  });
  it("cliente: parti MADE invariate", () => {
    expect(partiMadeCerved(true)).toEqual({ fidoMade: true, comePagaMade: true, confrontoMade: true });
  });
  it("ClienteCervedTab è solo un involucro di SchedaCervedEntita", () => {
    const sf = ts.createSourceFile("x.tsx", fonte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const fn = sf.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === "ClienteCervedTab");
    const corpo = fn?.body?.statements ?? [];
    expect(corpo.length).toBe(1);
    const testo = corpo[0]!.getText();
    expect(testo.startsWith("return <SchedaCervedEntita")).toBe(true);
    expect(testo).toContain('entita="cliente"');
  });
  it("le parti MADE dipendono da datiMade", () => {
    expect(fonte).toContain("{datiMade && <div className=\"min-w-0\">");
    expect(fonte).toContain("{datiMade && (lettura.certificato");
    expect(fonte).toContain("made.comePagaMade ? clienteId : null");
  });
});
