import { describe, expect, it } from "bun:test";
import righe from "./fixtures/fm65-righe-preventivo.json";
import { importoRiga, isIntestazioneKit, isRigaValorizzata, margineTotaliRighe, pesoRigaGamma, prezzoNettoRiga } from "@/lib/riga-preventivo";

const round2 = (x: number) => Math.round(x * 100) / 100;
describe("FM65 2b-3 — margine, gruppi kit e peso", () => {
  it("PRV-161: 150,01 − 120,40 = 29,61 e margine 19,7%", () => {
    const m = margineTotaliRighe({ totale: 150.01, costo: 120.4 });
    expect(m.euro).toBe(29.61);
    expect(Number(m.perc.toFixed(1))).toBe(19.7);
  });
  it("margine nullo senza importi", () => expect(margineTotaliRighe({ totale: 0, costo: 0 }).perc).toBe(0));
  it("STRATI senza articolo e codice è intestazione esclusa dai valori", () => {
    const r = { tipo_riga: "da_kit", articolo_id: null, articolo_codice: null };
    expect(isIntestazioneKit(r)).toBe(true);
    expect(isRigaValorizzata(r)).toBe(false);
  });
  it("articolo tecnico senza codice non è intestazione", () => {
    const r = { tipo_riga: "da_kit", articolo_id: "articolo-tecnico", articolo_codice: null };
    expect(isIntestazioneKit(r)).toBe(false);
    expect(isRigaValorizzata(r)).toBe(true);
  });
  it("articolo Gamma senza articolo tecnico non è intestazione", () => expect(isIntestazioneKit({ tipo_riga: "da_kit", articolo_codice: "FASL00H003300A0" })).toBe(false));
  it("peso = peso netto × quantità, senza effetto sul prezzo", () => {
    expect(pesoRigaGamma(8.7, 40)).toBe(348);
    expect(importoRiga({ quantita: 40, prezzo_unit: 4.167, sconti_gamma: [10] })).toBe(150.01);
  });
  it("peso assente resta assente, zero resta zero", () => {
    expect(pesoRigaGamma(null, 40)).toBeNull();
    expect(pesoRigaGamma(0, 40)).toBe(0);
  });
});
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

import { campiPrezzoDaMotore, formatScontiGamma, parseScontiGamma, patchConImporto } from "@/lib/riga-preventivo";

describe("FM65 2b-1 — sconti come in Gamma e riga dal motore", () => {
  it("formato 17+5", () => expect(formatScontiGamma([17, 5])).toBe("17+5"));
  it("lettura con virgola e zeri tolti", () => expect(parseScontiGamma("10 + 2,5 + 0")).toEqual([10, 2.5]));
  it("oltre 6 sconti non valido", () => expect(parseScontiGamma("1+1+1+1+1+1+1")).toBeNull());
  it("testo non valido", () => expect(parseScontiGamma("10+abc")).toBeNull());
  const lastraAN = { prezzo_base: 4.167, sc1: 10, sc2: 0, sc3: 0, sc4: 0, sc5: 0, sc6: 0, maggiorazione_perc: 0, costo_ultimo: 3.01 };
  it("A.N. lastra 25,2: sconti [10], importo 94,51", () => {
    const c = campiPrezzoDaMotore(lastraAN, 25.2, 0);
    expect(c.sconti_gamma).toEqual([10]);
    expect(c.importo).toBe(94.51);
    expect(c.costo).toBe(75.852);
  });
  it("sconto a piede finisce nello sconto extra", () => expect(campiPrezzoDaMotore(lastraAN, 1, 5).sconto_perc).toBe(5));
  it("senza prezzo dal motore: riga senza prezzo, importo 0", () => {
    const c = campiPrezzoDaMotore({ ...lastraAN, prezzo_base: null }, 2, 0);
    expect(c.prezzo_unit).toBeNull();
    expect(c.importo).toBe(0);
  });
  it("cambio quantità ricalcola importo e costo totale", () => {
    const riga = { tipo_riga: "articolo_singolo", quantita: 1, prezzo_unit: 23.7, sconti_gamma: [], maggiorazione_perc: 0, sconto_perc: 0, costo: 10 };
    expect(patchConImporto(riga, { quantita: 2 })).toEqual({ quantita: 2, costo: 20, importo: 47.4 });
  });
  it("nota: nessun importo", () => expect(patchConImporto({ tipo_riga: "nota" }, { quantita: 2 })).toEqual({ quantita: 2 }));
});

import { costoRiga } from "@/lib/riga-preventivo";
describe("FM65 2b-2 — costo di riga a 4 decimali", () => {
  it("lastra 25,2 × 3,01 = 75,852 (costo unitario resta 3,0100)", () => {
    expect(costoRiga(3.01, 25.2)).toBe(75.852);
  });
  it("guida kit 7,17 × 0,728 = 5,2198", () => {
    expect(costoRiga(0.728, 7.17)).toBe(5.2198);
  });
});
