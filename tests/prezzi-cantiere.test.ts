import { describe, expect, it } from "bun:test";
import { propostaPrezzoCantiere, mostraAvvisoPrezziCantiere } from "@/lib/cantiere-listini-api";
import { parseScontiGamma, prezzoNettoRiga, rigaInUnita } from "@/lib/riga-preventivo";

describe("FM69 prezzi cantiere", () => {
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
