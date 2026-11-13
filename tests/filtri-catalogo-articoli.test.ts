import { describe, expect, test } from "bun:test";
import { compattaTerne, espandiTerne, opzioniCascata, parametriRicerca, puliziaScelte, type TernaArticoliFiltri } from "../src/lib/filtri-catalogo-articoli";

// Terne reali da terne_articoli_filtri (13/11/2026).
const T = (cf: string | null, f: string | null, cs: string | null, s: string | null, mc: string | null, m: string | null, n: number): TernaArticoliFiltri =>
  ({ codice_famiglia: cf, famiglia: f, codice_sottofamiglia: cs, sottofamiglia: s, marca_codice: mc, marca: m, conteggio: n });
const terne = [
  T("FE", "FERRAMENTA", "AB", "ABBIGLIAMENTO", "KAP", "KAPRIOL", 1297),
  T("FE", "FERRAMENTA", "AB", "ABBIGLIAMENTO", "DIA", "DIADORA", 321),
  T("SR", "SHOWROOM", "AB", "ARREDO BAGNO", "ARB", "ARBI", 320),
  T("SR", "SHOWROOM", "AB", "ARREDO BAGNO", "POZ", "POZZEBON", 205),
  T("SR", "SHOWROOM", null, null, null, null, 840),
  T(null, null, null, null, null, null, 5),
];
const vuoto = { famiglie: [], coppie: [], marche: [] };

describe("filtri a cascata articoli", () => {
  test("nessuna scelta = tutto", () => {
    const o = opzioniCascata(terne, vuoto);
    expect(o.famiglie.map(f => [f.valore, f.conteggio])).toEqual([["FE", 1618], ["__none__", 5], ["SR", 1365]]);
    expect(o.sottofamiglie.map(s => s.valore).sort()).toEqual(["FE|AB", "SR|AB", "SR|__none__", "__none__|__none__"]);
    expect(o.marche.reduce((a, m) => a + m.conteggio, 0)).toBe(2988);
  });
  test("AB in FE e SR: chiavi distinte, etichette per nome", () => {
    const o = opzioniCascata(terne, { famiglie: ["FE", "SR"], coppie: [], marche: [] });
    expect(o.sottofamiglie.find(s => s.valore === "FE|AB")).toEqual({ valore: "FE|AB", etichetta: "ABBIGLIAMENTO", conteggio: 1618 });
    expect(o.sottofamiglie.find(s => s.valore === "SR|AB")).toEqual({ valore: "SR|AB", etichetta: "ARREDO BAGNO", conteggio: 525 });
    expect(opzioniCascata(terne, { famiglie: ["SR"], coppie: ["SR|AB"], marche: [] }).marche.map(m => m.etichetta)).toEqual(["ARBI", "POZZEBON"]);
  });
  test("stesso nome in due famiglie: famiglia tra parentesi", () => {
    const o = opzioniCascata(terne, { famiglie: ["SR", "__none__"], coppie: [], marche: [] });
    expect(o.sottofamiglie.map(s => s.etichetta)).toEqual(["ARREDO BAGNO", "Senza sottofamiglia (Senza famiglia)", "Senza sottofamiglia (SHOWROOM)"]);
  });
  test("famiglia vuota (5 articoli) e marca null", () => {
    const o = opzioniCascata(terne, { famiglie: ["__none__"], coppie: [], marche: [] });
    expect(o.marche).toEqual([{ valore: "__none__", etichetta: "Senza marca", conteggio: 5 }]);
    expect(opzioniCascata(terne, { famiglie: ["SR"], coppie: ["SR|__none__"], marche: [] }).marche)
      .toEqual([{ valore: "__none__", etichetta: "Senza marca", conteggio: 840 }]);
  });
  test("cambio famiglia pulisce coppie e marche", () => {
    expect(puliziaScelte(terne, { famiglie: ["FE"], coppie: ["SR|AB", "FE|AB"], marche: ["ARB", "KAP"] }))
      .toEqual({ famiglie: ["FE"], coppie: ["FE|AB"], marche: ["KAP"] });
    expect(puliziaScelte(terne, { famiglie: [], coppie: ["SR|AB"], marche: ["KAP"] }))
      .toEqual({ famiglie: [], coppie: ["SR|AB"], marche: [] });
  });
  test("parametri per cerca_articoli", () => {
    expect(parametriRicerca({ famiglie: ["SR"], coppie: ["SR|AB", "SR|__none__", "__none__|__none__"], marche: ["ARB"] }))
      .toEqual({ famiglie: ["SR"], coppie: ["SR|AB", "SR|", "|"], marche: ["ARB"] });
  });
  test("formato compatto senza perdita", () => {
    expect(espandiTerne(compattaTerne(terne))).toEqual(terne);
  });
});

import { convertiSottofamiglieSalvate } from "../src/lib/filtri-catalogo-articoli";
import { FILTRI_ARTICOLI, parametriArticoli } from "../src/lib/catalogo-articoli";
describe("FM65 F3 catalogo articoli", () => {
  test("filtri salvati vecchi: AB ambigua scartata, univoca se la famiglia la decide", () => {
    expect(convertiSottofamiglieSalvate(terne, ["AB"], [])).toEqual([]);
    expect(convertiSottofamiglieSalvate(terne, ["AB"], ["SR"])).toEqual(["SR|AB"]);
    expect(convertiSottofamiglieSalvate(terne, ["ZZ"], [])).toEqual([]);
  });
  test("la ricerca usa le coppie e mai il vecchio parametro sottofamiglie", () => {
    const p = parametriArticoli({ ...FILTRI_ARTICOLI, famiglie: ["SR"], coppie: ["SR|AB"], marche: ["__none__"], sottofamiglie: ["AB"] });
    expect([p.famiglie, p.coppie, p.sottofamiglie, p.marche]).toEqual([["SR"], ["SR|AB"], [], ["__none__"]]);
  });
});
