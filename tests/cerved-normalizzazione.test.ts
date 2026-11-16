import { test, expect } from 'bun:test';
import { normalizzaAziendaCerved, formattaAtecoCerved } from '../src/lib/cerved/cerved.server';

const azienda = {
  dati_anagrafici: {
    id_soggetto: 'SOGJ123456',
    denominazione: 'EDILZETA SRL',
    partita_iva: '01234567890',
    codice_fiscale: '01234567890',
    indirizzo: {
      descrizione: 'VIA ROMA 15',
      cap: '20020',
      descrizione_comune: 'MAGENTA',
      provincia: 'MI',
      codice_comune_istat: '015128',
    },
  },
  dati_attivita: {
    codice_stato_attivita: 'A',
    flag_operativa: 'S',
    codice_ateco_2025: '410000',
    ateco_2025: 'Costruzione di edifici',
    company_form: { code: 'SR', description: 'Societa a responsabilita limitata', company_form_class: 'SC' },
    codice_rea: 'MI-1234567',
    data_iscrizione_rea: '2005-03-12',
    ateco_infocamere_2025_secondario: [{ codice_ateco: '439900', ateco: 'Altri lavori di costruzione' }],
  },
  dati_pa: { ente: 'N', fornitore: 'S', partecipata: null },
};

test('estrazione dai blocchi dati_anagrafici / dati_attivita / dati_pa', () => {
  const r = normalizzaAziendaCerved(azienda);
  expect(r.id_soggetto).toBe('SOGJ123456');
  expect(r.denominazione).toBe('EDILZETA SRL');
  expect(r.partita_iva).toBe('01234567890');
  expect(r.codice_fiscale).toBe('01234567890');
  expect(r.stato_attivita_codice).toBe('A');
  expect(r.stato_attivita_descrizione).toBe('attiva');
  expect(r.operativa).toBe(true);
  expect(r.forma_giuridica).toBe('Societa a responsabilita limitata');
  expect(r.classe_forma).toBe('SC');
  expect(r.classe_forma_descrizione).toBe('società di capitali');
  expect(r.ateco_2025_codice).toBe('41.00.00');
  expect(r.ateco_2025_descrizione).toBe('Costruzione di edifici');
  expect(r.rea).toBe('MI-1234567');
  expect(r.data_iscrizione_rea).toBe('2005-03-12');
  expect(r.sede).toEqual({ indirizzo: 'VIA ROMA 15', cap: '20020', comune: 'MAGENTA', provincia: 'MI' });
  expect(r.ente_pa).toBe(false);
});

test('ATECO: 6 cifre col punto, già formattato e valore mancante', () => {
  expect(formattaAtecoCerved('410000')).toBe('41.00.00');
  expect(formattaAtecoCerved('011000')).toBe('01.10.00');
  expect(formattaAtecoCerved('41.00.00')).toBe('41.00.00');
  expect(formattaAtecoCerved('41000')).toBe('41000');
  expect(formattaAtecoCerved(null)).toBeNull();
});

test('tutti gli stati attività documentati hanno la descrizione', () => {
  const attese: Record<string, string> = {
    A: 'attiva', C: 'cessata', D: 'in procedure', F: 'fallita', G: 'amministrazione giudiziaria',
    I: 'inattiva', L: 'in scioglimento/liquidazione', N: 'in procedura concorsuale',
    P: 'iscrizione', R: 'registrata', S: 'sospesa', T: 'cancellata',
  };
  for (const [codice, descrizione] of Object.entries(attese)) {
    expect(normalizzaAziendaCerved({ dati_attivita: { codice_stato_attivita: codice } }).stato_attivita_descrizione)
      .toBe(descrizione);
  }
  expect(normalizzaAziendaCerved({ dati_attivita: { codice_stato_attivita: 'Z' } }).stato_attivita_descrizione).toBeNull();
});

test('classi forma: conosciute tradotte, sconosciute scartate', () => {
  const con = (classe: string) =>
    normalizzaAziendaCerved({ dati_attivita: { company_form: { company_form_class: classe, description: 'X' } } });
  expect(con('SP').classe_forma_descrizione).toBe('società di persone');
  expect(con('di').classe_forma_descrizione).toBe('ditta individuale');
  expect(con('AL').classe_forma_descrizione).toBe('altre forme');
  expect(con('XX').classe_forma).toBeNull();
  expect(con('XX').classe_forma_descrizione).toBeNull();
});

test('pubblica amministrazione vera solo con ente presente', () => {
  expect(normalizzaAziendaCerved({ dati_pa: { ente: 'S' } }).ente_pa).toBe(true);
  expect(normalizzaAziendaCerved({ dati_pa: { ente: 'N' } }).ente_pa).toBe(false);
  expect(normalizzaAziendaCerved({}).ente_pa).toBe(false);
});

test('elemento vuoto o mancante non esplode', () => {
  for (const vuota of [null, undefined, {}, { dati_anagrafici: null }]) {
    const r = normalizzaAziendaCerved(vuota);
    expect(r.id_soggetto).toBeNull();
    expect(r.denominazione).toBeNull();
    expect(r.operativa).toBeNull();
    expect(r.sede).toBeNull();
    expect(r.ente_pa).toBe(false);
  }
});

import { normalizzaProfiloCerved, normalizzaScoreCerved } from '../src/lib/cerved/cerved.server';
test('profilo: importi di bilancio da migliaia a euro, date GG/MM/AAAA', () => {
  const p = normalizzaProfiloCerved({
    dati_anagrafici: { pec: { email: ['a@pec.it'] } },
    dati_attivita: { data_costituzione: '05-01-2007' },
    dati_economici_dimensionali: { fatturato: 2500, utile_perdita_esercizio: -12, capitale_sociale: 10000 },
  });
  expect(p.fatturato).toBe(2500000);
  expect(p.utile_perdita_esercizio).toBe(-12000);
  expect(p.capitale_sociale).toBe(10000);
  expect(p.data_costituzione).toBe('05/01/2007');
  expect(p.pec).toEqual(['a@pec.it']);
});
test('score: legge scores[]', () => {
  const s = normalizzaScoreCerved({ scores: [{ codice_score: 'SEM_CGS', valore: 70, categoria_descrizione: 'VERDE' }] });
  expect(s[0].codice_score).toBe('SEM_CGS');
  expect(s[0].valore).toBe(70);
});

import { formattaDataCerved } from '../src/lib/cerved/cerved.server';
test('date Cerved GG-MM-AAAA → GG/MM/AAAA, altrimenti invariate', () => {
  expect(formattaDataCerved('14-12-2006')).toBe('14/12/2006');
  expect(formattaDataCerved('2006-12-14')).toBe('2006-12-14');
  expect(formattaDataCerved(null)).toBeNull();
});
test('profilo: url_sito_web in minuscolo, rating e chiusura bilancio', () => {
  const p = normalizzaProfiloCerved({
    dati_anagrafici: { url_sito_web: 'WWW.MADE.IT' },
    dati_attivita: { rating_legalita: { rating: '**+', data_rinnovo: '01-02-2025' }, stato_attivita: 'ATTIVA' },
    dati_economici_dimensionali: { anno_numero_dipendenti_inps: 2024, data_chiusura_ultimo_bilancio: '30-09-2025' },
  });
  expect(p.sito_web).toBe('www.made.it');
  expect(p.rating_legalita).toBe('**+');
  expect(p.rating_legalita_rinnovo).toBe('01/02/2025');
  expect(p.dipendenti_anno).toBe('2024');
  expect(p.data_chiusura_ultimo_bilancio).toBe('30/09/2025');
  expect(p.stato_attivita_descrizione).toBe('ATTIVA');
});
test('score: pd frazione, semaforo V, ordine SEM_CGS, CGS, altri', () => {
  const s = normalizzaScoreCerved({ scores: [
    { codice_score: 'ALTRO', valore: 50 },
    { codice_score: 'CGS', valore: 60, pd: 0.02671 },
    { codice_score: 'SEM_CGS', categoria_codice: 'V', categoria_descrizione: 'VERDE' },
  ] });
  expect(s.map((x) => x.codice_score)).toEqual(['SEM_CGS', 'CGS', 'ALTRO']);
  expect(s[0].categoria_codice).toBe('V');
  expect(s[1].pd! * 100).toBeCloseTo(2.671, 3);
  expect(s[2].pd).toBeNull();
});

import { normalizzaDocumentoCerved, normalizzaArchivioCerved, normalizzaProdottiCerved, reportPiuRecente } from "../src/lib/cerved/cerved.server";
import { describe as d2, it as i2, expect as e2 } from "bun:test";

d2("archivio Cerved", () => {
  i2("decodifica il contenuto base64 in XML UTF-8", () => {
    const content = Buffer.from("<x>Società</x>", "utf-8").toString("base64");
    const r = normalizzaDocumentoCerved({ content, delivery_status: "DELIVERED", format: "XML", request_id: "9" });
    e2(r.contenuto_xml).toBe("<x>Società</x>");
    e2(r).not.toHaveProperty("content");
  });
  i2("sceglie il report più recente (GG-MM-AAAA)", () => {
    const rs = normalizzaArchivioCerved({ reports: [
      { request_id: "a", request_date: "31-12-2024" }, { request_id: "b", request_date: "01-02-2025" },
    ] });
    e2(reportPiuRecente(rs)?.request_id).toBe("b");
  });
  i2("legge i prodotti", () => {
    e2(normalizzaProdottiCerved({ available_products: [{ code: "52015", description: "Light Report" }], subject_id: 7883047 })).toEqual([{ codice: "52015", descrizione: "Light Report" }]);
    e2(normalizzaProdottiCerved({ products: [{ code: "X" }] })).toEqual([]);
  });
  i2("archivio vuoto reale", () => {
    e2(normalizzaArchivioCerved({ pagination: {}, reports: [], reports_count: 0 })).toEqual([]);
    e2(normalizzaArchivioCerved({ documents: [{ request_id: "a" }] })).toEqual([]);
  });
});

import { scegliAziendaPerPiva } from "../src/lib/cerved/cerved.server";
d2("scegliAziendaPerPiva", () => {
  const az = (piva: string, id: number) => ({ dati_anagrafici: { partita_iva: piva, id_soggetto: id } });
  i2("tiene la corrispondenza esatta e scarta P.IVA diverse", () => {
    const r = { companies: [az("99999999999", 1), az("01234567890", 2)] };
    e2(scegliAziendaPerPiva(r, "IT 01234567890")).toEqual(az("01234567890", 2));
  });
  i2("più corrispondenze: la prima", () => {
    e2(scegliAziendaPerPiva({ companies: [az("01234567890", 3), az("01234567890", 4)] }, "01234567890")).toEqual(az("01234567890", 3));
  });
  i2("nessuna corrispondenza: null", () => {
    e2(scegliAziendaPerPiva({ companies: [az("99999999999", 1)] }, "01234567890")).toBeNull();
    e2(scegliAziendaPerPiva({}, "01234567890")).toBeNull();
  });
});

import { normalizzaBilancioCerved, normalizzaEventiNegativiCerved, normalizzaFidoCerved } from "../src/lib/cerved/cerved.server";

test("bilancio: MOL ABBRUSCATO 30/09/2025 e valori già in euro", () => {
  const b = normalizzaBilancioCerved({
    data_chiusura: "30-09-2025", tipo_bilancio: "E",
    voci_integrale: {
      conto_economico: [
        { codice_voce: "270", valore: 2582103 }, { codice_voce: "320", valore: 519363 },
        { codice_voce: "330", valore: 389075 }, { codice_voce: "302", valore: 1319118 },
        { codice_voce: "304", valore: 38720 }, { codice_voce: "370", valore: 211958 },
      ],
      stato_patrimoniale: [{ codice_voce: "160", valore: 50000 }],
    },
  });
  expect(b.mol).toBe(103869);
  expect(b.valore_produzione).toBe(2582103);
  expect(b.patrimonio_netto).toBe(50000);
  expect(b.data_chiusura).toBe("30/09/2025");
  expect(b.tipo_bilancio).toBe("E");
  expect(b.ricavi).toBeNull();
});

test("bilancio senza voci: tutto null, MOL null", () => {
  const b = normalizzaBilancioCerved({ data_chiusura: "31-12-2024" });
  expect(b.mol).toBeNull();
  expect(b.valore_produzione).toBeNull();
  expect(b.data_chiusura).toBe("31/12/2024");
});

test("eventi negativi: nomi reali", () => {
  const e = normalizzaEventiNegativiCerved({
    companies: [{ protests: false, prejudicialEvents: false, procedures: false, crisisEvents: false, cigs: false, personalBankruptcies: false }],
    people: [],
  });
  expect(e.azienda).toEqual({ protesti: false, pregiudizievoli: false, procedure: false, eventi_crisi: false, cigs: false, fallimenti_propri: false });
  expect(e.persone).toEqual([]);
  const e2b = normalizzaEventiNegativiCerved({ companies: [{ prejudicialEvents: true }], people: [{ name: "MARIO ROSSI", protests: true }] });
  expect(e2b.azienda?.pregiudizievoli).toBe(true);
  expect(e2b.azienda?.protesti).toBeNull();
  expect(e2b.persone[0].nome).toBe("MARIO ROSSI");
  expect(e2b.persone[0].protesti).toBe(true);
  expect(normalizzaEventiNegativiCerved({ companies: [{ protesti: true }] }).azienda?.protesti).toBeNull();
  expect(normalizzaEventiNegativiCerved({}).azienda).toBeNull();
});

test("fido: campi reali piatti", () => {
  expect(normalizzaFidoCerved({ codice_fido: "FCERT", descrizione_fido: "Fido certificato", valore_fido: 25000 }))
    .toEqual({ codice: "FCERT", descrizione: "Fido certificato", valore: 25000 });
  expect(normalizzaFidoCerved({ dati: { valore_fido: 1 } }).valore).toBeNull();
});

import { normalizzaLightReportXml } from "../src/lib/cerved/cerved.server";
import { readFileSync } from "node:fs";
const XML_DELEO = readFileSync(new URL("./fixtures/cerved-light-report-deleo.xml", import.meta.url), "utf8");

test("Light Report DELEO: fido, CGS, payline, richieste e immobili dai percorsi reali", () => {
  const d = normalizzaLightReportXml(XML_DELEO);
  expect(d.data_report).toBe("2026-11-06");
  expect(d.fido_certificato).toEqual({ valore: 262000, codice: "DF07" });
  expect(d.score_cgs).toMatchObject({ valore: 56, codice: "CGS_4" });
  expect(d.gradings).toMatchObject({ eventi_negativi: 50, payline: 60, governance: 48 });
  expect(d.payline?.giorni_effettivi).toBe(113);
  expect(d.payline?.giorni_concordati).toBe(115);
  expect(d.payline?.esperienze).toBe(165);
  expect(d.payline?.score).toBe(6);
  expect(d.payline?.trend).toBe("P1");
  expect(d.payline?.trimestri[0]).toEqual({ trimestre: "1", azienda: 120, settore: 80 });
  expect(d.payline?.trimestri).toHaveLength(4);
  // Il totale viene da DeliveryAndSummaryDetails, non dal "2" delle aziende collegate.
  expect(d.richieste_12_mesi.totale).toBe(30);
  expect(d.richieste_12_mesi.per_mese[0]).toEqual({ mese: "11", anno: "2025", banche_finanziarie: 1, aziende: 0, altri: 2, totale: 3 });
  expect(d.immobili).toEqual({ valore_stimato: 502183, numero_stimati: 3, terreni: 1, fabbricati: 5 });
  expect(d.eventi_straordinari?.conteggi.trasferimenti).toBe(2);
  expect(d.eventi_straordinari?.elenco[0]?.tipo_trasferimento).toBe("COMPRAVENDITA");
  expect(d.eventi_straordinari?.elenco[0]?.data_atto).toBe("2005-11-03");
  expect(d.protesti).toEqual({ possibile_omonimia: true, fallimento: false, procedure: false });
});

test("Light Report: tag con namespace e attributi, campi assenti a null", () => {
  const d = normalizzaLightReportXml(`<ns:R xmlns:ns="x"><ns:AverageGrantableCredit a="1"><ns:CreditLimit Over="false"><ns:Value>1&#44;5</ns:Value></ns:CreditLimit></ns:AverageGrantableCredit></ns:R>`);
  expect(d.fido_certificato).toEqual({ valore: 1.5, codice: null });
  expect(d.score_cgs).toBeNull();
  expect(d.payline).toBeNull();
  expect(d.protesti).toEqual({ possibile_omonimia: null, fallimento: null, procedure: null });
});

const XML_BUILD = readFileSync(new URL("./fixtures/cerved-light-report-build-technology.xml", import.meta.url), "utf8");

test("FM79: ogni valore preesistente DELEO resta identico (incluse tutte le righe)", () => {
  const precedente = JSON.parse(readFileSync(new URL("./fixtures/cerved-light-report-deleo-prima.json", import.meta.url), "utf8"));
  const attuale = normalizzaLightReportXml(XML_DELEO);
  const { score_cgs, gradings, ...resto } = precedente;
  for (const [chiave, valore] of Object.entries(resto)) expect(attuale[chiave as keyof typeof attuale]).toEqual(valore);
  expect({ valore: attuale.score_cgs?.valore, codice: attuale.score_cgs?.codice }).toEqual(score_cgs);
  expect({ eventi_negativi: attuale.gradings.eventi_negativi, payline: attuale.gradings.payline, governance: attuale.gradings.governance }).toEqual(gradings);
});

test("FM79: anagrafica azienda principale, provincia in attributo e ATECO 2025", () => {
  expect(normalizzaLightReportXml(XML_BUILD).anagrafica).toEqual({
    denominazione: "BUILD TECHNOLOGY S.R.L.", partita_iva: "14475121001", codice_fiscale: "14475121001", rea: "1523414",
    forma_giuridica: "SOCIETA' A RESPONSABILITA' LIMITATA", ateco_2025_codice: "43.21.01",
    ateco_2025_descrizione: "Installazione di impianti di illuminazione e fotovoltaici in edifici",
    stato_attivita_codice: "A", stato_attivita_descrizione: "ATTIVA",
    sede: { indirizzo: "PIAZZALE DELLE PROVINCIE 8", cap: "00162", comune: "ROMA", provincia: "RM" },
    pec: "BUILDTECHNOLOGY@LEGALMAIL.IT", sito_web: "buildtecnology.it", telefono: null, dipendenti: 6, unita_locali: 2,
    data_costituzione: "2017-09-27", data_inizio_attivita: "2017-11-03",
  });
});

test("FM79: CGS non prende PD CEBI né trend Payline; grading e CEBI verificati", () => {
  const r = normalizzaLightReportXml(XML_BUILD);
  expect(r.score_cgs).toEqual({ valore: 64, codice: "CGS_3", pd: null, trend_codice: null, trend_descrizione: null, semaforo: "V" });
  expect(r.gradings).toEqual({
    eventi_negativi: 50, payline: 49, governance: 40, richieste: 45,
    dettagli: { eventi_negativi: { classe: 0, descrizione: "C4_1" }, payline: { classe: 3, descrizione: "C3_1" }, governance: { classe: 3, descrizione: "C6_1" }, richieste: { classe: 3, descrizione: "C5_1" } },
    cebi: { classe: 4, codice: "S4", descrizione: null, pd: 0.0012, data_chiusura: "2025-12-31" },
  });
  expect(normalizzaLightReportXml(XML_DELEO).gradings.cebi).toBeNull();
});

test("FM79: tre bilanci XML in migliaia convertiti in euro, indici collegati per data", () => {
  expect(normalizzaLightReportXml(XML_BUILD).bilanci).toEqual([
    { data_chiusura: "2025-12-31", ricavi: 1758000, acquisti: 337000, mol: 105000, utile: 68000, patrimonio_netto: 457000, debiti_banche: 19000, debiti_fornitori: 588000, crediti_clienti: 864000, liquidita: 92000, roe: 16.1, roi: 15.3 },
    { data_chiusura: "2024-12-31", ricavi: 963000, acquisti: 234000, mol: 80000, utile: 43000, patrimonio_netto: 389000, debiti_banche: 23000, debiti_fornitori: 79000, crediti_clienti: 115000, liquidita: 311000, roe: 11.7, roi: 11.2 },
    { data_chiusura: "2023-12-31", ricavi: 2814000, acquisti: 517000, mol: 231000, utile: 147000, patrimonio_netto: 347000, debiti_banche: 27000, debiti_fornitori: 266000, crediti_clienti: 381000, liquidita: 440000, roe: 53.8, roi: 48.6 },
  ]);
  expect(normalizzaLightReportXml(XML_DELEO).bilanci).toEqual([]);
});

test("FM79: debiti banca sommano due componenti, una mancante non azzera l'altra", () => {
  const a = "<STDebtsTowardsBanks><Value>12</Value></STDebtsTowardsBanks>";
  const b = "<MiddleLongTermDebtsTowardsBanks><Value>34</Value></MiddleLongTermDebtsTowardsBanks>";
  const parse = (v: string) => normalizzaLightReportXml(`<LightReport><BalanceSheetCebi><BalanceSheetInfo><LiabilitiesAndShareholderEquity>${v}</LiabilitiesAndShareholderEquity></BalanceSheetInfo></BalanceSheetCebi></LightReport>`).bilanci[0];
  expect(parse(a + b).debiti_banche).toBe(46000);
  expect(parse(a).debiti_banche).toBe(12000);
  expect(parse("").debiti_banche).toBeNull();
  expect(parse("").roe).toBeNull();
});

test("FM79: eventi non confondono omonimia, codici numerici e flag collegati con negatività accertata", () => {
  const e = normalizzaLightReportXml(XML_BUILD).eventi_negativi;
  expect(e.azienda).toEqual({ protesti: null, pregiudizievoli: null, procedure: false, eventi_crisi: null, cigs: null, fallimenti_propri: false });
  expect(e.codici_azienda).toEqual({ CgrPr: 5, CgrPa: 10, CgrPb: 10, CgrPc: 0, CgrF: 99, CgrPrA: 99, CgrPrC: 1 });
  expect(e.persone.map((p) => p.nome)).toEqual(["FINARELLI MARCO", "MARTELLA LAILA"]);
  expect(e.persone[0].protesti).toBeNull();
  expect(e.collegati).toHaveLength(4);
  expect(e.collegati[0]).toMatchObject({ nome: "FINARELLI MARCO", codice_fiscale: "FNRMRC71P14H501D", persona: true, flag_pc: false, flag_pp: true });
  expect(e.collegati[2]).toMatchObject({ persona: false, flag_pc: true, flag_pp: true });
});

test("FM79: nuovi dati assenti restano null, sezioni collegate non contaminano l'azienda", () => {
  const r = normalizzaLightReportXml("<LightReport><PositionCompany><ItemInformation><OfficialCompanyName>ALTRA AZIENDA</OfficialCompanyName></ItemInformation></PositionCompany></LightReport>");
  expect(r.anagrafica).toBeNull();
  expect(r.gradings.dettagli.payline).toBeNull();
  expect(r.gradings.cebi).toBeNull();
  expect(r.eventi_negativi).toEqual({ azienda: null, persone: [], codici_azienda: null, collegati: [] });
  const e = normalizzaLightReportXml("<LightReport><Bankruptcy><Event>procedura</Event></Bankruptcy><AgreedWindingUpProcedures><Event>procedura</Event></AgreedWindingUpProcedures></LightReport>");
  expect(e.eventi_negativi.azienda?.procedure).toBe(true);
  expect(e.eventi_negativi.azienda?.fallimenti_propri).toBe(true);
});
