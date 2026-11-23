import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { normalizzaLightReportXml } from "../src/lib/cerved/cerved.server";
import { costruisciGrafoCerved, chiaviFiscaliGrafo, riepilogoGruppoMade, type ClienteMadeGrafo, type NodoGrafo } from "../src/lib/cerved-grafo";
import { statoSocietaCerved } from "../src/lib/cerved-collegati";

const grafo = (f: string) => {
  const r = normalizzaLightReportXml(readFileSync(`${import.meta.dir}/fixtures/${f}`, "utf8"));
  const a = r.anagrafica;
  return costruisciGrafoCerved(r, { nome: a?.denominazione ?? null, partita_iva: a?.partita_iva ?? null, codice_fiscale: a?.codice_fiscale ?? null });
};
const nessunDoppione = (nodi: NodoGrafo[]) => {
  const k = nodi.filter((n) => n.codice_fiscale).map((n) => `${n.tipo === "persona" ? "p" : "s"}${n.codice_fiscale}`);
  expect(new Set(k).size).toBe(k.length);
};

test("ECOCOSTRUZIONI: Robecchi Efrem un solo nodo, Ecotema un solo nodo con 50% dal centro e arco dall'esponente", () => {
  const g = grafo("cerved-light-report-ecocostruzioni.xml");
  nessunDoppione(g.nodi);
  expect(g.nodi.filter((n) => n.tipo === "centro")).toHaveLength(1);
  const efrem = g.nodi.filter((n) => n.tipo === "persona" && n.nome === "ROBECCHI EFREM");
  expect(efrem).toHaveLength(1);
  const a = g.archi.find((x) => x.da === efrem[0]!.id && x.a === "centro")!;
  expect(a.tipi).toEqual(["socio", "titolare_effettivo", "esponente"]);
  expect(a.etichette.slice(0, 2)).toEqual(["80%", "Titolare effettivo — quote 80%"]);
  const giorgio = g.nodi.find((n) => n.nome === "ROBECCHI GIORGIO")!;
  expect(g.archi.find((x) => x.da === giorgio.id && x.a === "centro")!.etichette).toEqual(["20%"]);
  const ecotema = g.nodi.filter((n) => n.nome === "ECOTEMA SRL");
  expect(ecotema).toHaveLength(1);
  expect(ecotema[0]!.livello).toBe(1);
  expect(g.archi.find((x) => x.da === "centro" && x.a === ecotema[0]!.id)!.etichette).toEqual(["50%"]);
  expect(g.archi.some((x) => x.da === efrem[0]!.id && x.a === ecotema[0]!.id)).toBe(true);
  // Ditta individuale con lo stesso CF della persona: nodo società distinto, nessun auto-arco.
  expect(g.nodi.find((n) => n.nome === "ECOCOSTRUZIONI DI ROBECCHI EFREM")!.tipo).toBe("societa");
  expect(g.archi.every((x) => x.da !== x.a)).toBe(true);
});

test("GUAGROUP: Florio Costruzioni e Flover con eventi, centro senza eventi", () => {
  const g = grafo("cerved-light-report-guagroup.xml");
  nessunDoppione(g.nodi);
  expect(g.nodi.find((n) => n.tipo === "centro")!.eventi).toEqual([]);
  for (const nome of ["FLORIO COSTRUZIONI S.R.L.", "FLOVER S.R.L."]) {
    const n = g.nodi.find((x) => x.nome === nome)!;
    expect(n.eventi.length).toBeGreaterThan(0);
    expect(n.eventi.some((e) => e.startsWith("Liquidazione giudiziale"))).toBe(true);
  }
});

test("socio società con soci principali → nodi solo_nome livello 2, uniti a persona con nome identico", () => {
  const xml = `<?xml version="1.0"?><LightReport><Shareholders><ShareholdersList>
  <Shareholder><ShareholderItem><Aziendaslim><CompanyInformation><IDCompany>1</IDCompany><CompanyName>BIG SRL</CompanyName><TaxCode>02992680344</TaxCode></CompanyInformation><MainShareholders><ShareHolderName>BARALDI MARTINA</ShareHolderName><ShareHolderName>ROSSI MARIO</ShareHolderName></MainShareholders></Aziendaslim></ShareholderItem><PercentageShares>95</PercentageShares></Shareholder>
  <Shareholder><ShareholderItem><IndividualInformation><IDPerson>9</IDPerson><Name>ROSSI MARIO</Name><TaxCode>RSSMRA80A01F205X</TaxCode></IndividualInformation></ShareholderItem><PercentageShares>5</PercentageShares></Shareholder>
  </ShareholdersList></Shareholders></LightReport>`;
  const r = normalizzaLightReportXml(xml);
  const g = costruisciGrafoCerved(r, { nome: "RADICE", partita_iva: "01234567890", codice_fiscale: null });
  const big = g.nodi.find((n) => n.nome === "BIG SRL")!;
  const martina = g.nodi.find((n) => n.nome === "BARALDI MARTINA")!;
  expect(martina).toMatchObject({ tipo: "solo_nome", livello: 2 });
  expect(g.archi.find((a) => a.da === martina.id && a.a === big.id)!.etichette).toEqual(["Socio principale"]);
  // ROSSI MARIO: una persona del report con nome identico → un solo nodo.
  expect(g.nodi.filter((n) => n.nome === "ROSSI MARIO")).toHaveLength(1);
});

test("chiaviFiscaliGrafo: segnaposto esclusi, centro escluso, persone incluse", () => {
  const n = (id: string, tipo: NodoGrafo["tipo"], cf: string | null): NodoGrafo => ({ id, tipo, nome: id, codice_fiscale: cf, stato: "non_indicato", stato_testo: null, eventi: [], livello: 1, dettagli: [] });
  expect(chiaviFiscaliGrafo([
    n("c", "centro", "03882690161"), n("a", "societa", "IT 04835640162"),
    n("p", "persona", " rbcfrm74m07d952z "), n("x", "societa", "102730"), n("y", "societa_estera", null), n("d", "societa", "04835640162"),
  ])).toEqual(["04835640162", "RBCFRM74M07D952Z"]);
});

test("riepilogoGruppoMade: stesso cliente da due chiavi contato una volta, questo cliente separato", () => {
  const c = (chiave: string, id: string, fido: number, questo = false): ClienteMadeGrafo => ({ chiave, cliente_id: id, ragione_sociale: id, codice: null, sede: null, fido, esposizione: 100, scaduto: 10, scaduto_oltre_60: 5, bloccato: false, in_gestione_legale: false, visibile: true, e_questo_cliente: questo, chiave_centro: false });
  const r = riepilogoGruppoMade([c("A", "1", 1000), c("B", "1", 1000), c("C", "2", 500), c("D", "3", 200, true)]);
  expect(r.altri).toEqual({ clienti: 2, fido: 1500, esposizione: 200, scaduto: 20, scaduto_oltre_60: 10 });
  expect(r.questo).toEqual({ clienti: 1, fido: 200, esposizione: 100, scaduto: 10, scaduto_oltre_60: 5 });
  expect(r.totale.clienti).toBe(3);
});

test("statoSocietaCerved: risultati invariati per le chiamate esistenti", () => {
  expect(statoSocietaCerved({ stato_codice: "A", stato_descrizione: "ATTIVA", stato_dal: null })).toEqual({ testo: "Attiva", tono: "verde" });
  expect(statoSocietaCerved({ stato_codice: "T", stato_descrizione: null, stato_dal: "2020-05-04" })).toEqual({ testo: "Cancellata il 04/05/2020", tono: "neutro" });
  expect(statoSocietaCerved({ stato_codice: "T", stato_descrizione: null, stato_dal: null })).toEqual({ testo: "Cancellata", tono: "neutro" });
  expect(statoSocietaCerved({ stato_codice: "L", stato_descrizione: "IN LIQUIDAZIONE", stato_dal: null })).toEqual({ testo: "IN LIQUIDAZIONE", tono: "rosso" });
  expect(statoSocietaCerved({ stato_codice: null, stato_descrizione: null, stato_dal: null })).toEqual({ testo: "Stato non indicato", tono: "neutro" });
});
