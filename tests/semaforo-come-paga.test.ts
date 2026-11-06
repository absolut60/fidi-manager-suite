import { describe, expect, test } from "bun:test";
import { testoNumeroSemaforo } from "../src/lib/semaforo-ui";
import { testiEsperienzaPagamento, type EsperienzaPagamento } from "../src/hooks/use-esperienza-pagamento";

const base: EsperienzaPagamento = {
  nPagate: 20, nInRitardo: 6, pctInRitardo: 30, ritardoMedio: 10, maxRitardo: 70,
  nInRitardo12m: 3, ritardoMedioRitardi: 25, tolleranza: 5,
  nPagate12m: 10, ritardoMedio12m: 17.6, ritardoMedioRitardi12m: 28, primaPagata: "2024-01-15",
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

describe("testiEsperienzaPagamento", () => {
  test("nessun pagamento", () => {
    const t = testiEsperienzaPagamento({ ...base, nPagate: 0, nInRitardo: 0, nPagate12m: 0, nInRitardo12m: 0 });
    expect(t.valore).toBe("Nessun pagamento registrato");
    expect(t.dettaglio).toBeUndefined();
    expect(t.nonPuntuali12m).toBe(false);
  });
  test("nessun pagamento negli ultimi 12 mesi", () => {
    const t = testiEsperienzaPagamento({ ...base, nPagate12m: 0, nInRitardo12m: 0 });
    expect(t.valore).toBe("Nessun pagamento negli ultimi 12 mesi");
    expect(t.dettaglio).toBe("storico 6 su 20 dal 01/2024");
    expect(t.nonPuntuali12m).toBe(false);
  });
  test("ultimi 12 mesi in primo piano, niente ritardo medio", () => {
    const t = testiEsperienzaPagamento(base);
    expect(t.label).toBe("Pagamenti non puntuali");
    expect(t.valore).toBe("3 su 10 negli ultimi 12 mesi");
    expect(t.dettaglio).toBe("storico 6 su 20 dal 01/2024");
    expect(t.titolo).toContain("oltre 5 giorni");
    expect(t.nonPuntuali12m).toBe(true);
  });
});
