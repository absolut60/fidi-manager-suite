import { describe, expect, test } from "bun:test";
import { filtraCodiciPagamento } from "../src/components/condizione-pagamento-richiesta-select";

const catalogo = [
  { cod: "RB60", descrizione: "RiBa a sessanta giorni" },
  { cod: "BB30", descrizione: "Bonifico a trenta giorni città" },
  { cod: "CO", descrizione: null },
];
describe("FM71 ricerca pagamento", () => {
  test("parole in qualsiasi ordine su codice e descrizione", () => {
    expect(filtraCodiciPagamento(catalogo, "giorni RB60 sessanta").map(c => c.cod)).toEqual(["RB60"]);
  });
  test("ignora maiuscole e accenti", () => {
    expect(filtraCodiciPagamento(catalogo, "CITTA bonifico").map(c => c.cod)).toEqual(["BB30"]);
  });
  test("richiede tutte le parole e ammette descrizione nulla", () => {
    expect(filtraCodiciPagamento(catalogo, "RB60 bonifico")).toEqual([]);
    expect(filtraCodiciPagamento(catalogo, "co").map(c => c.cod)).toEqual(["BB30", "CO"]);
    expect(filtraCodiciPagamento(catalogo, "  ")).toHaveLength(3);
  });
});