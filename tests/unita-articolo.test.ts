import { describe, expect, test } from "bun:test";
import { inUnita, unitaArticolo, prezzoConUnita, quantitaConUnita } from "../src/lib/scheda-articolo";
const close = (a: number | null, b: number) => expect(Math.abs((a ?? NaN) - b)).toBeLessThan(1e-9);
describe("unità di misura Gamma", () => {
  test("MQ/NR fattore 3,6: 5.223,6 MQ = 1.451 NR; 4,1670 €/MQ = 15,0012 €/NR", () => {
    close(inUnita(5223.6, "quantita", "secondaria", 3.6), 1451);
    expect(quantitaConUnita(5223.6, "MQ")).toBe("5.223,6 MQ");
    close(inUnita(4.167, "prezzo", "secondaria", 3.6), 15.0012);
    close(inUnita(3.01, "prezzo", "secondaria", 3.6), 10.836);
    expect(quantitaConUnita(inUnita(5223.6, "quantita", "secondaria", 3.6), "NR")).toBe("1.451 NR");
    expect(prezzoConUnita(inUnita(4.167, "prezzo", "secondaria", 3.6), "NR")).toBe("15,0012 €/NR");
  });
  test("KG/NR 25: 100 KG = 4 NR, prezzo × 25", () => {
    close(inUnita(100, "quantita", "secondaria", 25), 4);
    close(inUnita(2, "prezzo", "secondaria", 25), 50);
  });
  test("MQ/RT 50 e NR/PAL 75", () => {
    close(inUnita(100, "quantita", "secondaria", 50), 2);
    close(inUnita(1, "prezzo", "secondaria", 50), 50);
    close(inUnita(150, "quantita", "secondaria", 75), 2);
    close(inUnita(0.5, "prezzo", "secondaria", 75), 37.5);
  });
  test("CO/PZ 0,01: 100 CO = 10.000 PZ (mai UM1 × fattore)", () => {
    close(inUnita(100, "quantita", "secondaria", 0.01), 10000);
    close(inUnita(10, "prezzo", "secondaria", 0.01), 0.1);
  });
  test("primaria invariata", () => {
    expect(inUnita(5223.6, "quantita", "primaria", 3.6)).toBe(5223.6);
    expect(inUnita(4.167, "prezzo", "primaria", 3.6)).toBe(4.167);
  });
  test("convertibile solo con UM2 diversa e fattore > 0 e ≠ 1", () => {
    expect(unitaArticolo({ um: "MQ", um2: "NR", fattore_conversione: 3.6 }).convertibile).toBe(true);
    expect(unitaArticolo({ um: "MQ", um2: "NR", fattore_conversione: 1 }).convertibile).toBe(false);
    expect(unitaArticolo({ um: "MQ", um2: "NR", fattore_conversione: 0 }).convertibile).toBe(false);
    expect(unitaArticolo({ um: "NR", um2: "NR", fattore_conversione: 3 }).convertibile).toBe(false);
    expect(unitaArticolo({ um: "NR", um2: null, fattore_conversione: 3 }).convertibile).toBe(false);
  });
});
