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

import { datiCervedCompatto, datiSchedaCerved, scoreCervedPresentazione, gradingCervedPresentazione } from "../src/lib/cerved-presentazione";
import { normalizzaLightReportXml } from "../src/lib/cerved/cerved.server";
import { readFileSync } from "node:fs";
describe("datiCervedCompatto", () => {
  const scores = [{ codice_score: "CGS", descrizione_score: null, valore: 43, categoria_codice: "CGS_5", categoria_descrizione: "Moderata", pd: 0.06, trend_codice: null, trend_descrizione: null }];
  it("senza dati Cerved non compare", () => {
    expect(datiCervedCompatto(null, null, 1000)).toBeNull();
  });
  it("Light Report: CGS e fido certificato con confronto", () => {
    const v = datiCervedCompatto({ score_cgs: { valore: 56 }, fido_certificato: { valore: 262000 } }, null, 65500)!;
    expect(v.valore).toBe(56);
    expect(v.fido).toBe("262.000 €");
    expect(v.confronto).toBe("Il fido MADE è il 25% di quello certificato");
  });
  it("solo fotografia score: gauge con fascia, senza fido", () => {
    const v = datiCervedCompatto(null, scores, 1000)!;
    expect(v.valore).toBe(43);
    expect(v.fascia).toBe("Affidabilità moderata");
    expect(v.fido).toBeNull();
  });
});

describe("FM79: presentazione LR → fotografia → assente", () => {
  const build = normalizzaLightReportXml(readFileSync(new URL("./fixtures/cerved-light-report-build-technology.xml", import.meta.url), "utf8"));
  const deleo = normalizzaLightReportXml(readFileSync(new URL("./fixtures/cerved-light-report-deleo.xml", import.meta.url), "utf8"));
  const score = (codice: string, extra = {}) => ({ codice_score: codice, descrizione_score: null, valore: 20, categoria_codice: `${codice}_5`, categoria_descrizione: "Moderata", pd: 0.06, trend_codice: null, trend_descrizione: "Stabile", ...extra });
  it("anagrafica BUILD solo XML, telefono assente non usa granulari", () => {
    const a = datiSchedaCerved({ light_report: build, ricerca: { denominazione: "Vecchio", rea: "1" }, profilo: { telefono: "02 123", dipendenti: 100, dipendenti_anno: 2024 } }).anagrafica;
    expect(a.denominazione).toBe("BUILD TECHNOLOGY S.R.L.");
    expect(a.rea).toBe("1523414");
    expect(a.pec).toBe("BUILDTECHNOLOGY@LEGALMAIL.IT");
    expect(a.sede.comune).toBe("ROMA");
    expect(a.dipendenti).toBe(6);
    expect(a.dipendenti_anno).toBeNull();
    expect(a.unita_locali).toBe(2);
    expect(a.data_costituzione).toBe("27/09/2017");
    expect(a.telefono).toBeNull();
    expect(datiSchedaCerved({ light_report: { anagrafica: { telefono: "non usare" } } }).anagrafica.telefono).toBeNull();
  });
  it("scheda con LR non integra fotografie granulari", () => {
    const a = datiSchedaCerved({ light_report: { anagrafica: { rea: "", sede: { comune: "ROMA" } } }, ricerca: { rea: "99", sede: { indirizzo: "VIA TEST", comune: "MILANO" } }, profilo: { sito_web: "sito.it", pec: ["pec@x.it"], unita_locali: 0 } }).anagrafica;
    expect(a.rea).toBeNull(); expect(a.sede).toMatchObject({ comune: "ROMA", indirizzo: null });
    expect(a.sito_web).toBeNull(); expect(a.pec).toBeNull(); expect(a.unita_locali).toBeNull();
    expect(datiSchedaCerved({}).anagrafica.denominazione).toBeNull();
  });
  it("CGS BUILD: 64/Buona/verde; PD e andamento solo granulari", () => {
    const v = scoreCervedPresentazione(build, [score("CGS")]);
    expect(v.valore).toBe(64); expect(v.categoria).toBe("Buona"); expect(v.semaforo.tono).toBe("verde");
    expect(v.pd).toBe(0.06); expect(v.andamento).toBe("Stabile");
    expect(scoreCervedPresentazione(build).pd).toBeNull();
    expect(scoreCervedPresentazione(build).andamento).toBeNull();
    expect(scoreCervedPresentazione({ score_cgs: { pd: 0.9, trend_descrizione: "non usare" } }).pd).toBeNull();
  });
  it("semaforo sconosciuto ripiega sullo score senza inventare categorie", () => {
    const v = scoreCervedPresentazione({ score_cgs: { semaforo: "X", codice: "CGS_999" } }, [score("SEM_CGS", { categoria_codice: "R" }), score("CGS")]);
    expect(v.semaforo.tono).toBe("rosso"); expect(v.categoria).toBe("Moderata"); expect(v.valore).toBe(20);
    expect(scoreCervedPresentazione(null).valore).toBeNull();
    expect(scoreCervedPresentazione({ score_cgs: { codice: "CGS_999" } }).categoria).toBeNull();
  });
  it("DELEO solo LR: compatto 56/Media e fido 262000", () => {
    const v = datiCervedCompatto(deleo, [score("CGS")], 65500);
    expect(v?.valore).toBe(56); expect(v?.fascia).toBe("Affidabilità media"); expect(v?.fido).toBe("262.000 €");
    expect(datiCervedCompatto(build, null, 0)?.fascia).toBe("Affidabilità buona");
  });
  it("grading: decodifiche verificate LR e payline neutro", () => {
    expect(gradingCervedPresentazione(build, [score("PAY", { categoria_descrizione: "Regolari" })], "PAY")).toMatchObject({ valore: 49, classe: 3, descrizione: null, esito: "neutro" });
    expect(gradingCervedPresentazione(build, [], "NEG")).toMatchObject({ valore: 50, classe: 0, descrizione: "Assenti" });
    expect(gradingCervedPresentazione(null, [score("GOV")], "GOV").valore).toBe(20);
    expect(gradingCervedPresentazione(null, [], "GOV").valore).toBeNull();
  });
  it("bilanci: tre annate BUILD e DELEO senza bilanci non usa granulari", () => {
    const v = datiSchedaCerved({ light_report: build, bilancio: { anni: [{ ricavi: 1698217 }] } });
    expect(v.bilanciLr).toBe(true); expect(v.anni).toHaveLength(3);
    expect(v.anni[0].ricavi).toBe(1758000); expect(v.anni[0].roe).toBe(16.1); expect(v.anni[0].roi).toBe(15.3);
    expect(variazionePercentuale(v.anni[0].ricavi, v.anni[1].ricavi)).toBeCloseTo(82.5545, 3);
    expect(variazionePercentuale(v.anni[1].ricavi, v.anni[2].ricavi)).toBeCloseTo(-65.7783, 3);
    expect(datiSchedaCerved({ light_report: deleo, bilancio: { anni: [{ ricavi: 123 }] } }).anni).toEqual([]);
    expect(datiSchedaCerved({}).anni).toEqual([]);
  });
  it("eventi solo LR, collegati deduplicati senza flag di allarme", () => {
    const v = datiSchedaCerved({ light_report: build, eventi_negativi: { azienda: { procedure: true, protesti: true, cigs: false } } }).eventi;
    expect(v.azienda.procedure).toBe(false); expect(v.azienda.fallimenti_propri).toBe(false);
    expect(v.azienda.protesti).toBeNull(); expect(v.azienda.cigs).toBeNull(); expect(v.azienda.pregiudizievoli).toBe(false); // FM99: era null
    expect(v.collegati).toHaveLength(3);
    expect(v.collegati[0]).toEqual({ nome: "FINARELLI MARCO", codice_fiscale: "FNRMRC71P14H501D" });
    expect(datiSchedaCerved({ light_report: { eventi_negativi: { azienda: { protesti: true }, codici_azienda: { CgrPr: 5 } } } }).eventi.azienda.protesti).toBe(true);
    expect(Object.values(datiSchedaCerved({}).eventi.azienda)).toEqual([null, null, null, null, null, null]);
  });
});
