import { describe, expect, it } from "bun:test";
import { propostaPrezzoCantiere, mostraAvvisoPrezziCantiere, contaPrezziCantieri, testoPrezziDedicati } from "@/lib/cantiere-listini-api";
import { parseScontiGamma, prezzoNettoRiga, rigaInUnita } from "@/lib/riga-preventivo";

describe("FM69 prezzi cantiere", () => {
  it("un prezzo è singolare, due prezzi sono plurali", () => {
    expect(testoPrezziDedicati(1)).toBe("1 prezzo dedicato");
    expect(testoPrezziDedicati(2)).toBe("2 prezzi dedicati");
  });
  it("conteggia tutti gli ID con una sola lettura, senza duplicati", async () => {
    const chiamate: string[][] = [];
    const risultato = await contaPrezziCantieri(["a", "b", "a", "c"], async ids => {
      chiamate.push(ids);
      return [{ cantiere_id: "a" }, { cantiere_id: "a" }, { cantiere_id: "b" }];
    });
    expect(chiamate).toEqual([["a", "b", "c"]]);
    expect(risultato).toEqual({ a: 2, b: 1, c: 0 });
  });
  it("suddivide 501 cantieri in blocchi di massimo 500", async () => {
    const chiamate: string[][] = [];
    const ids = Array.from({ length: 501 }, (_, i) => `c${i}`);
    const risultato = await contaPrezziCantieri(ids, async blocco => { chiamate.push(blocco); return blocco.map(cantiere_id => ({ cantiere_id })); });
    expect(chiamate.map(c => c.length)).toEqual([500, 1]);
    expect(Object.keys(risultato)).toHaveLength(501);
    expect(risultato.c500).toBe(1);
  });
  it("nessun cantiere non esegue letture", async () => {
    let chiamate = 0;
    expect(await contaPrezziCantieri([], async () => { chiamate++; return []; })).toEqual({});
    expect(chiamate).toBe(0);
  });
  it("interpreta 17+5 e riusa il netto in cascata con maggiorazione", () => {
    const s = parseScontiGamma("17+5");
    expect(s).toEqual([17, 5]);
    expect(prezzoNettoRiga({ prezzo_unit: 100, sconti_gamma: s, maggiorazione_perc: 10 })).toBeCloseTo(86.735, 8);
  });
  it("accetta sei sconti e rifiuta sette", () => {
    expect(parseScontiGamma("1+2+3+4+5+6")).toEqual([1,2,3,4,5,6]);
    expect(parseScontiGamma("1+2+3+4+5+6+7")).toBeNull();
  });
  it("senza listino lascia il prezzo vuoto e non inventa il costo speciale", () => {
    expect(propostaPrezzoCantiere(null)).toEqual({ prezzo_vendita_speciale: null, sconti: [], maggiorazione_perc: 0, listino_cliente: null, costo_ultimo: null });
  });
  it("propone lordo, sconti e maggiorazione originali dal motore", () => {
    expect(propostaPrezzoCantiere({ prezzo_base: 100, sc1: 17, sc2: 5, sc3: 0, sc4: null, sc5: null, sc6: null, maggiorazione_perc: 10, costo_ultimo: 40 })).toEqual({ prezzo_vendita_speciale: 100, sconti: [17,5], maggiorazione_perc: 10, listino_cliente: 86.735, costo_ultimo: 40 });
  });
  it("articolo senza prezzo resta vuoto anche se è noto il costo ultimo", () => {
    expect(propostaPrezzoCantiere({ prezzo_base: null, sc1: 17, sc2: null, sc3: null, sc4: null, sc5: null, sc6: null, maggiorazione_perc: 5, costo_ultimo: 40 }).prezzo_vendita_speciale).toBeNull();
  });
  it("l'editing UM2 salva prezzo e costo unitario in UM1", () => {
    const v = rigaInUnita({ quantita: 1, prezzo_unit: 10, costo: 4, um_scelta: "um2" }, { um: "KG", um2: "NR", fattore_conversione: 25 }, { prezzo_unit: 300, costo_unit: 100 });
    expect(v.prezzo_unit).toBe(250);
    expect(v.patchUm1).toEqual({ prezzo_unit: 12, costo: 4 });
  });
});

describe("FM69 avviso prezzi nel preventivo", () => {
  it("mostra l’etichetta solo con prezzi visibili", () => {
    expect(mostraAvvisoPrezziCantiere(0)).toBe(false);
    expect(mostraAvvisoPrezziCantiere(undefined)).toBe(false);
    expect(mostraAvvisoPrezziCantiere(3)).toBe(true);
  });
  it("la scelta di un cantiere con prezzi genera l’avviso", () => {
    expect(mostraAvvisoPrezziCantiere(3, "scelta")).toBe(true);
    expect(mostraAvvisoPrezziCantiere(0, "scelta")).toBe(false);
  });
  it("l’apertura di un preventivo salvato non genera avvisi", () => {
    expect(mostraAvvisoPrezziCantiere(3, "apertura")).toBe(false);
  });
});
