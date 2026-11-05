import { describe, expect, test } from "bun:test";
import { testoNumeroSemaforo } from "../src/lib/semaforo-ui";
import { testiPagateInRitardo, type EsperienzaPagamento } from "../src/hooks/use-esperienza-pagamento";

const base: EsperienzaPagamento = {
  nPagate: 20, nInRitardo: 6, pctInRitardo: 30, ritardoMedio: 10, maxRitardo: 70,
  nInRitardo12m: 3, ritardoMedioRitardi: 25, tolleranza: 5,
  nPagate12m: 10, ritardoMedio12m: 17.6, ritardoMedioRitardi12m: 28,
};

describe("testoNumeroSemaforo", () => {
  test("unità nulla o numero <= 0 → null", () => {
    expect(testoNumeroSemaforo(18, null)).toBeNull();
    expect(testoNumeroSemaforo(0, "gg")).toBeNull();
    expect(testoNumeroSemaforo(-3, "eur")).toBeNull();
  });
  test("gg arrotondati", () => {
    expect(testoNumeroSemaforo(17.6, "gg")).toBe("18 gg");
  });
  test("eur in formato italiano", () => {
    const t = testoNumeroSemaforo(12345.5, "eur")!;
    expect(t).toContain("12.345,50");
    expect(t).toContain("€");
  });
});

describe("testiPagateInRitardo", () => {
  test("nessuna pagata non RiBa", () => {
    const t = testiPagateInRitardo({ ...base, nPagate: 0, nInRitardo: 0, nPagate12m: 0, nInRitardo12m: 0 });
    expect(t.valore).toBe("Nessun pagamento non RiBa");
    expect(t.inRitardo).toBe(false);
  });
  test("nessuna pagata negli ultimi 12 mesi", () => {
    const t = testiPagateInRitardo({ ...base, nPagate12m: 0, nInRitardo12m: 0 });
    expect(t.valore).toBe("Nessun pagamento negli ultimi 12 mesi");
    expect(t.dettaglio).toBe("storico 6 su 20 in ritardo");
    expect(t.inRitardo).toBe(false);
  });
  test("ultimi 12 mesi in primo piano", () => {
    const t = testiPagateInRitardo(base);
    expect(t.valore).toBe("3 su 10 negli ultimi 12 mesi");
    expect(t.dettaglio).toBe("ritardo medio 18 gg · storico 6 su 20");
    expect(t.titolo).toContain("oltre 5 giorni");
    expect(t.inRitardo).toBe(true);
  });
});
