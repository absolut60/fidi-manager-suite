import { describe, it, test, expect } from "bun:test";
import { etichettaScoreCerved, coloreSemaforo, statoAttivitaAnomalo, formattaPdCerved, formattaAggiornatoIl, livelloCategoria, esitoScore, sigleEcofin, formattaEuroCompatto, variazionePercentuale, settoreGaugeCerved, SETTORI_GAUGE_CERVED } from "@/lib/cerved-presentazione";

describe("cerved-presentazione", () => {
  it("etichette semplici e fallback alla descrizione", () => {
    expect(etichettaScoreCerved({ codice_score: "PAY", descrizione_score: "x" })).toBe("Come paga gli altri fornitori");
    expect(etichettaScoreCerved({ codice_score: "CGS", descrizione_score: null })).toBe("Affidabilità Cerved");
    expect(etichettaScoreCerved({ codice_score: "ZZZ", descrizione_score: "Altro score" })).toBe("Altro score");
  });
  it("semaforo V/G/R e neutro", () => {
    expect(coloreSemaforo("V").tono).toBe("verde");
    expect(coloreSemaforo("g").classe).toContain("bg-warning");
    expect(coloreSemaforo("R").classe).toContain("bg-destructive");
    expect(coloreSemaforo("X").tono).toBe("neutro");
    expect(coloreSemaforo(null).tono).toBe("neutro");
  });
  it("stato attività: A normale, altro anomalo", () => {
    expect(statoAttivitaAnomalo("A")).toBe(false);
    expect(statoAttivitaAnomalo("C")).toBe(true);
    expect(statoAttivitaAnomalo(null)).toBe(false);
  });
  it("pd frazione → percentuale con 2 decimali", () => {
    expect(formattaPdCerved(0.0123)).toBe("1,23%");
    expect(formattaPdCerved(null)).toBeNull();
  });
  it("aggiornato il in ora di Roma", () => {
    expect(formattaAggiornatoIl("2026-11-05T15:04:00Z")).toBe("05/11/2026 alle 16:04");
  });
  it("livello dal categoria_codice", () => {
    expect(livelloCategoria("PAY_2")).toBe(2);
    expect(livelloCategoria("ECOFIN_10")).toBe(10);
    expect(livelloCategoria("V")).toBeNull();
    expect(livelloCategoria(null)).toBeNull();
  });
  it("esitoScore: fasce per score", () => {
    expect(esitoScore("PAY", "PAY_2")).toBe("verde");
    expect(esitoScore("PAY", "PAY_3")).toBe("ambra");
    expect(esitoScore("PAY", "PAY_4")).toBe("rosso");
    expect(esitoScore("NEG", "NEG_1")).toBe("verde");
    expect(esitoScore("NEG", "NEG_3")).toBe("ambra");
    expect(esitoScore("NEG", "NEG_5")).toBe("rosso");
    expect(esitoScore("GOV", "GOV_1")).toBe("verde");
    expect(esitoScore("GOV", "GOV_2")).toBe("ambra");
    expect(esitoScore("ECOFIN", "ECOFIN_4")).toBe("verde");
    expect(esitoScore("ECOFIN", "ECOFIN_6")).toBe("ambra");
    expect(esitoScore("ECOFIN", "ECOFIN_7")).toBe("rosso");
    expect(esitoScore("ECOFIN", "ECOFIN_10")).toBe("rosso");
    expect(esitoScore("CNSL", "CNSL_1")).toBe("verde");
    expect(esitoScore("CNSL", "CNSL_2")).toBe("ambra");
    expect(esitoScore("CNSL", "CNSL_3")).toBe("rosso");
    expect(esitoScore("IMMO", "IMMO_1")).toBe("neutro");
    expect(esitoScore("ZZZ", "ZZZ_1")).toBe("neutro");
    expect(esitoScore("PAY", null)).toBe("neutro");
  });
  it("sigle ECOFIN", () => {
    expect(sigleEcofin).toHaveLength(10);
    expect(sigleEcofin[0]).toBe("S1");
    expect(sigleEcofin[9]).toBe("R4");
  });
  it("euro compatto", () => {
    expect(formattaEuroCompatto(2419063)).toBe("2,42 mln €");
    expect(formattaEuroCompatto(519363)).toBe("519 mila €");
    expect(formattaEuroCompatto(850)).toBe("850 €");
    expect(formattaEuroCompatto(null)).toBeNull();
  });
  it("variazione percentuale", () => {
    expect(variazionePercentuale(2419063, 3516421)!).toBeCloseTo(-31.21, 2);
    expect(variazionePercentuale(54886, 43730)!).toBeCloseTo(25.51, 2);
    expect(variazionePercentuale(1, 0)).toBeNull();
    expect(variazionePercentuale(1, null)).toBeNull();
  });
});

test("settore del gauge CGS", () => {
  expect(SETTORI_GAUGE_CERVED.length).toBe(8);
  expect(settoreGaugeCerved(0)).toBe(0);
  expect(settoreGaugeCerved(10)).toBe(0);
  expect(settoreGaugeCerved(36)).toBe(2);
  expect(settoreGaugeCerved(49.9)).toBe(3);
  expect(settoreGaugeCerved(50)).toBe(4);
  expect(settoreGaugeCerved(56)).toBe(4);
  expect(settoreGaugeCerved(95)).toBe(7);
  expect(settoreGaugeCerved(100)).toBe(7);
  expect(settoreGaugeCerved(null)).toBeNull();
});

import { dataIsoIt, testoConfrontoFido, testoGiorniPayline, eventoRecenteCerved, meseBreveIt } from "../src/lib/cerved-presentazione";
describe("Light Report: presentazione", () => {
  it("data e mese in italiano", () => {
    expect(dataIsoIt("2026-11-06")).toBe("06/11/2026");
    expect(meseBreveIt("11", "2025")).toBe("nov 25");
  });
  it("confronto fido MADE / certificato", () => {
    expect(testoConfrontoFido(65500, 262000)).toBe("Il fido MADE è il 25% di quello certificato");
    expect(testoConfrontoFido(1000, null)).toBeNull();
  });
  it("giorni payline DELEO", () => {
    expect(testoGiorniPayline(113, 115)).toBe("Paga in 113 gg · concordati 115 gg");
  });
  it("evento recente entro 24 mesi", () => {
    expect(eventoRecenteCerved("2025-01-10", "2026-11-06")).toBe(true);
    expect(eventoRecenteCerved("2024-11-05", "2026-11-06")).toBe(false);
  });
});

import { testiLightReportRischio as tlr } from "../src/lib/cerved-presentazione";
describe("testiLightReportRischio", () => {
  it("senza Light Report non produce celle", () => {
    expect(tlr(null, 1000)).toEqual({ fido: null, payline: null });
  });
  it("DELEO: fido certificato, confronto e payline", () => {
    const r = tlr({ fido_certificato: { valore: 262000 }, payline: { giorni_effettivi: 113, giorni_concordati: 115, incidenza_scaduto: 0, aperte_scadute: 2 } }, 65500);
    expect(r.fido?.confronto).toBe("Il fido MADE è il 25% di quello certificato");
    expect(r.payline?.valore).toBe("Paga in 113 gg · concordati 115 gg");
    expect(r.payline?.dettaglio).toBe("2 aperte scadute");
  });
});
