import { describe, expect, it } from "bun:test";
import { applicaLeva, parseCascata } from "../src/lib/leve-prezzo-showroom";
import { prezzoNettoRiga } from "../src/lib/riga-preventivo";

describe("leve prezzo showroom", () => {
  it("ricarico: costo 50, ricarico 40 → 70", () => {
    expect(applicaLeva({ leva: "ricarico", costoUnit: 50, ricaricoPerc: 40 })).toEqual(
      { prezzo_unit: 70, sconti_gamma: [], ricarico: 40, leva_prezzo: "ricarico", fonte_prezzo: "manuale" });
  });
  it("sconto dal listino: 100 con -45+5 → netto 57,75 via prezzoNettoRiga", () => {
    const p = applicaLeva({ leva: "sconto_listino", listinoFornitore: 100, cascata: parseCascata("-45+5"), costoUnit: 50 })!;
    expect(p.prezzo_unit).toBe(100);
    expect(p.sconti_gamma).toEqual([45, -5]);
    expect(prezzoNettoRiga(p)).toBeCloseTo(57.75, 10);
    expect(p.ricarico).toBe(15.5);
  });
  it("prezzo a mano 80 con costo 50 → ricarico implicito 60%", () => {
    const p = applicaLeva({ leva: "prezzo_manuale", prezzoManuale: 80, costoUnit: 50 })!;
    expect(p).toMatchObject({ prezzo_unit: 80, sconti_gamma: [], ricarico: 60, leva_prezzo: "prezzo_manuale" });
  });
  it("4 decimali", () => {
    expect(applicaLeva({ leva: "ricarico", costoUnit: 12.3456, ricaricoPerc: 33.3 })!.prezzo_unit).toBe(16.4567);
    expect(applicaLeva({ leva: "prezzo_manuale", prezzoManuale: 1.234567 })!.prezzo_unit).toBe(1.2346);
  });
  it("cascata vuota: netto = listino", () => {
    const p = applicaLeva({ leva: "sconto_listino", listinoFornitore: 100, cascata: parseCascata("") })!;
    expect(p.sconti_gamma).toEqual([]);
    expect(prezzoNettoRiga(p)).toBe(100);
  });
  it("costo o listino assenti", () => {
    expect(applicaLeva({ leva: "ricarico", costoUnit: null, ricaricoPerc: 40 })).toBeNull();
    expect(applicaLeva({ leva: "sconto_listino", listinoFornitore: null, cascata: [45] })).toBeNull();
    expect(applicaLeva({ leva: "prezzo_manuale", prezzoManuale: 80 })!.ricarico).toBeNull();
    expect(applicaLeva({ leva: "sconto_listino", listinoFornitore: 100, cascata: [45] })!.ricarico).toBeNull();
  });
  it("parseCascata: notazioni e testo non valido", () => {
    expect(parseCascata("−45+5")).toEqual([45, -5]);
    expect(parseCascata("-45 +5")).toEqual([45, -5]);
    expect(parseCascata("45")).toEqual([45]);
    expect(parseCascata("45+5")).toEqual([45, 5]);
    expect(parseCascata("-12,5")).toEqual([12.5]);
    expect(parseCascata("-45+x")).toBeNull();
    expect(parseCascata("-1-1-1-1-1-1-1")).toBeNull();
  });
});
