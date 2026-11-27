import { describe, expect, test } from "bun:test";
import { costoUnitAcquistoManuale, costoUnitRiga, margineUnitario, marginePercRiga, patchConImporto, rigaInUnita } from "../src/lib/riga-preventivo";

// Caso reale PRV-182/26 "boost 30x60": listino 78, sconti 50/10/10, magg € 1,5, ricarico 60.
const acq = { listino_fornitore: 78, acq_sc1: 50, acq_sc2: 10, acq_sc3: 10, acq_magg_perc: null, acq_magg_euro: 1.5 };
const riga = { tipo_riga: "manuale", ...acq, quantita: null, prezzo_unit: 52.944, sconti_gamma: [], maggiorazione_perc: 0, sconto_perc: 0, segno: 1, costo: 0 };

describe("FM101 costo righe manuali", () => {
  test("costo unitario, prezzo e margine unitario", () => {
    expect(costoUnitAcquistoManuale(acq)).toBeCloseTo(33.09, 6);
    expect(33.09 * 1.6).toBeCloseTo(52.944, 6);
    const m = margineUnitario(52.944, 33.09)!;
    expect(m.euro).toBeCloseTo(19.854, 6);
    expect(m.perc).toBe(37.5);
    expect(margineUnitario(52.944, null)).toBeNull();
  });
  test("quantità vuota: costo unitario 33,09 e margine 37,5", () => {
    expect(costoUnitRiga(riga)).toBeCloseTo(33.09, 6);
    expect(rigaInUnita(riga).costo_unit).toBeCloseTo(33.09, 6);
    expect(marginePercRiga(riga)).toBe(37.5);
  });
  test("arriva la quantità 10,08", () => {
    const p = patchConImporto(riga, { quantita: 10.08 });
    expect(p.costo).toBe(333.5472);
    expect(p.importo).toBe(533.68);
  });
  test("cambio sconto acq_sc3 senza costo nel patch", () => {
    const r = { ...riga, quantita: 10.08, costo: 333.5472 };
    const p = patchConImporto(r, { acq_sc3: 0 });
    expect(p.costo).toBe(Math.round((78 * 0.5 * 0.9 + 1.5) * 10.08 * 10000) / 10000);
  });
  test("riga Gamma invariata", () => {
    const g = { tipo_riga: "articolo_singolo", articolo_codice: "X", quantita: 0, prezzo_unit: 10, costo: 5, listino_fornitore: 78 };
    expect(patchConImporto(g, { quantita: 2 }).costo).toBeUndefined();
    const g2 = { ...g, quantita: 2, costo: 8 };
    expect(patchConImporto(g2, { quantita: 4 }).costo).toBe(16);
    expect(costoUnitRiga(g2)).toBe(4);
    expect(marginePercRiga(g2)).toBe(60);
    expect(marginePercRiga({ ...g2, quantita: 0 })).toBe(100);
  });
  test("riga manuale senza listino: logica precedente", () => {
    const m = { tipo_riga: "manuale", quantita: 0, prezzo_unit: 10, costo: 5 };
    expect(patchConImporto(m, { quantita: 2 }).costo).toBeUndefined();
  });
});
