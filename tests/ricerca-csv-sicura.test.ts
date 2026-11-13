import { describe, expect, test } from "bun:test";
import { testoPerFiltroOr } from "../src/lib/ricerca-sicura";
import { cellaCsvSicura } from "../src/lib/csv-sicuro";
import { buildEmailCampagna } from "../src/lib/campagna-marketing-email";

describe("testoPerFiltroOr (FM64)", () => {
  test("testi normali invariati", () => {
    expect(testoPerFiltroOr("D'ANGELO")).toBe("D'ANGELO");
    expect(testoPerFiltroOr("EDIL 2N")).toBe("EDIL 2N");
    expect(testoPerFiltroOr("  rossi  ")).toBe("rossi");
  });
  test("caratteri speciali neutralizzati, nessuna condizione aggiunta", () => {
    const t = testoPerFiltroOr('x%,id.not.is.null,(a):"b"\\*');
    expect(t).not.toMatch(/[,.():"\\*%]/);
    expect(t).toBe("x__id_not_is_null__a___b___");
  });
});

describe("cellaCsvSicura (FM64)", () => {
  test("testo che inizia con formula prefissato", () => {
    expect(cellaCsvSicura("=1+1")).toBe("'=1+1");
    expect(cellaCsvSicura("+39 02")).toBe("'+39 02");
    expect(cellaCsvSicura("-SOMMA(A1)")).toBe("'-SOMMA(A1)");
    expect(cellaCsvSicura("@cmd")).toBe("'@cmd");
    expect(cellaCsvSicura("\tx")).toBe("'\tx");
    expect(cellaCsvSicura("\nx")).toBe("'\nx");
  });
  test("numeri veri e testo normale invariati", () => {
    expect(cellaCsvSicura(-12.5)).toBe(-12.5);
    expect(cellaCsvSicura(0)).toBe(0);
    expect(cellaCsvSicura("LASTRA 12,5")).toBe("LASTRA 12,5");
    expect(cellaCsvSicura(null)).toBe("");
  });
});

describe("campagne: valori cliente (FM64)", () => {
  const dati = { ragione_sociale: "B&B <Srl>", citta: "B&B <Srl>", agente: "x", categoria: "y" };
  const r = buildEmailCampagna({ oggetto: "Ciao {{ragione_sociale}} di {{citta}}", corpo: "<p>{{ragione_sociale}} - {{citta}}</p>", dati, linkRecesso: null, useCid: false });
  test("nel corpo i valori sono con escape", () => {
    expect(r.html).toContain("<p>B&amp;B &lt;Srl&gt; - B&amp;B &lt;Srl&gt;</p>");
    expect(r.html).not.toContain("<Srl>");
  });
  test("nell'oggetto restano letterali", () => {
    expect(r.oggetto).toBe("Ciao B&B <Srl> di B&B <Srl>");
  });
});
