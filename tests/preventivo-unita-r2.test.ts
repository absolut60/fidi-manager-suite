import { describe, expect, it } from "bun:test";
import { rigaInUnita, patchConImporto, importoRiga } from "@/lib/riga-preventivo";

const gamma = { um: "MQ", um2: "NR", fattore_conversione: 3.6 };
const lastra = { tipo_riga: "articolo_singolo", articolo_codice: "FASL00H003300A0", quantita: 40, incidenza: 2, prezzo_unit: 4.167, sconti_gamma: [10], costo: 120.4, um_scelta: "um2" };
describe("FM65 R2 — unità di presentazione, dati sempre UM1", () => {
  it("40 MQ → 11,11 NR senza arrotondare i dati di calcolo", () => expect(rigaInUnita(lastra, gamma).quantita).toBeCloseTo(11.1111111111, 9));
  it("incidenza 2 MQ → 0,5556 NR", () => expect(rigaInUnita(lastra, gamma).incidenza).toBeCloseTo(0.5555555556, 9));
  it("lordo NR 15,0012", () => expect(rigaInUnita(lastra, gamma).prezzo_unit).toBeCloseTo(15.0012, 10));
  it("netto NR 13,50108, mostrato 13,5011", () => expect(rigaInUnita(lastra, gamma).netto).toBeCloseTo(13.50108, 10));
  it("costo NR 10,8360", () => expect(rigaInUnita(lastra, gamma).costo_unit).toBeCloseTo(10.836, 10));
  it("11 NR scritti → 39,6 MQ, incidenza 1,98, importo 148,51, costo 119,196", () => {
    const patch = patchConImporto(lastra, rigaInUnita(lastra, gamma, { quantita: 11 }).patchUm1, 20);
    expect(patch.quantita).toBe(39.6); expect(patch.incidenza).toBe(1.98);
    expect(patch.importo).toBe(148.51); expect(patch.costo).toBe(119.196);
  });
  it("prezzo NR scritto 15,0012 → 4,167 UM1", () => expect(rigaInUnita(lastra, gamma, { prezzo_unit: 15.0012 }).patchUm1.prezzo_unit).toBeCloseTo(4.167, 12));
  it("costo NR scritto 10,836 → totale UM1 120,4", () => expect(rigaInUnita(lastra, gamma, { costo_unit: 10.836 }).patchUm1.costo).toBe(120.4));
  it("incidenza NR scritta 0,5 → 1,8 UM1 e quantità 36", () => expect(patchConImporto(lastra, rigaInUnita(lastra, gamma, { incidenza: 0.5 }).patchUm1, 20).quantita).toBe(36));
  it("andata/ritorno esatti conservano importo 150,01", () => {
    const v = rigaInUnita(lastra, gamma);
    const patch = rigaInUnita(lastra, gamma, { quantita: v.quantita, prezzo_unit: v.prezzo_unit, costo_unit: v.costo_unit }).patchUm1;
    expect(importoRiga({ ...lastra, ...patch })).toBe(150.01);
    expect(patch.costo).toBe(120.4);
  });
  for (const fattore_conversione of [0, 1, -3, null]) it(`fattore ${fattore_conversione}: nessuna conversione`, () => {
    const v = rigaInUnita(lastra, { ...gamma, fattore_conversione });
    expect(v.secondaria).toBe(false); expect(v.quantita).toBe(40); expect(v.um).toBe("MQ");
  });
  it("sigle uguali: nessuna UM2", () => expect(rigaInUnita(lastra, { ...gamma, um2: "MQ" }).secondaria).toBe(false));
  it("selezione UM1 conserva quantità e prezzi", () => {
    const v = rigaInUnita({ ...lastra, um_scelta: "um1" }, gamma);
    expect(v.quantita).toBe(40); expect(v.prezzo_unit).toBe(4.167);
    expect(importoRiga(lastra)).toBe(150.01);
  });
});