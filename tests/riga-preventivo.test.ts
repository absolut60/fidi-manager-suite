import { describe, expect, it } from "vitest";
import righe from "./fixtures/fm65-righe-preventivo.json";
import { importoRiga, prezzoNettoRiga } from "@/lib/riga-preventivo";

const round2 = (x: number) => Math.round(x * 100) / 100;
type R = { id: string; quantita: number | null; prezzo_unit: number | null; sconto_perc: number | null; segno: number | null };

describe("FM65 — importo riga: non regressione sulle 70 righe reali", () => {
  it("la fixture contiene le righe esportate", () => {
    expect((righe as R[]).length).toBe(70);
  });
  for (const r of righe as R[]) {
    it(`riga ${r.id}`, () => {
      const q = Number(r.quantita ?? 0), p = Number(r.prezzo_unit ?? 0), sc = Number(r.sconto_perc ?? 0);
      const segno = (r.segno ?? 1) === -1 ? -1 : 1;
      const vecchio = round2(q * p * (1 - sc / 100) * segno);
      expect(importoRiga({ ...r, sconti_gamma: [], maggiorazione_perc: 0 })).toBe(vecchio);
    });
  }
});

describe("FM65 — casi Gamma verificati con DDT", () => {
  it("3,6 × 4,167 con sconto 17 → 12,45", () => expect(importoRiga({ quantita: 3.6, prezzo_unit: 4.167, sconti_gamma: [17] })).toBe(12.45));
  it("25,2 × 4,167 con sconto 10 → 94,51", () => expect(importoRiga({ quantita: 25.2, prezzo_unit: 4.167, sconti_gamma: [10] })).toBe(94.51));
  it("3,6 × 4,63 con maggiorazione 15 → 19,17", () => expect(importoRiga({ quantita: 3.6, prezzo_unit: 4.63, maggiorazione_perc: 15 })).toBe(19.17));
  it("1 × 4,90 con maggiorazione 15 → 5,64", () => expect(importoRiga({ quantita: 1, prezzo_unit: 4.9, maggiorazione_perc: 15 })).toBe(5.64));
  it("1 × 23,70 con maggiorazione 15 → 27,26", () => expect(importoRiga({ quantita: 1, prezzo_unit: 23.7, maggiorazione_perc: 15 })).toBe(27.26));
  it("sconto extra 5% sopra sconto Gamma 10%: 1 × 100 → 85,50", () =>
    expect(importoRiga({ quantita: 1, prezzo_unit: 100, sconti_gamma: [10], sconto_perc: 5 })).toBe(85.5));
  it("il netto non viene arrotondato", () =>
    expect(prezzoNettoRiga({ prezzo_unit: 4.167, sconti_gamma: [10] })).toBeCloseTo(3.7503, 10));
  it("segno −1 rende l'importo negativo", () =>
    expect(importoRiga({ quantita: 2, prezzo_unit: 10, segno: -1 })).toBe(-20));
});
