import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { normalizzaLightReportXml } from "../src/lib/cerved/cerved.server";

const leggi = (f: string) => normalizzaLightReportXml(readFileSync(`${import.meta.dir}/fixtures/${f}`, "utf8"));
const xml = (corpo: string) => normalizzaLightReportXml(`<?xml version="1.0"?><LightReport>${corpo}</LightReport>`);

test("ECOCOSTRUZIONI: soci, titolare effettivo e partecipazione", () => {
  const r = leggi("cerved-light-report-ecocostruzioni.xml");
  expect(r.soci.map((s) => [s.tipo, s.nome, s.percentuale, s.diritto])).toEqual([
    ["persona", "ROBECCHI EFREM", 80, "PROPRIETA'"], ["persona", "ROBECCHI GIORGIO", 20, "PROPRIETA'"]]);
  expect(r.titolari_effettivi).toEqual([{ nome: "ROBECCHI EFREM", codice_fiscale: "RBCFRM74M07D952Z", id_soggetto: "341441497", criterio: "POSSESSO_QUOTE", persona: true, percentuale: 80 }]);
  expect(r.partecipazioni).toHaveLength(1);
  expect(r.partecipazioni[0]).toMatchObject({ nome: "ECOTEMA SRL", codice_fiscale: "04835640162", percentuale: 50, stato_codice: "A", stato_descrizione: "ATTIVA", ateco_codice: "412" });
});

test("socio società italiana (Aziendaslim) con soci principali", () => {
  const r = xml(`<Shareholders><CompanySheet><CompanyInformation><CompanyName>RADICE</CompanyName></CompanyInformation></CompanySheet><ShareholdersList><Shareholder><LinkCode>01</LinkCode><DescriptionLinkCode>PROPRIETA'</DescriptionLinkCode><ShareholderItem><Aziendaslim><CompanyInformation><IDCompany>398732590</IDCompany><CompanyName>BIG SRL</CompanyName><CompanyForm LegalFormCode="SR" LegalFormDescription="S.r.l.">SOCIETA' A RESPONSABILITA' LIMITATA</CompanyForm><TaxCode>02992680344</TaxCode></CompanyInformation><ActivityStatus>I</ActivityStatus><ActivityDescription>Attiva</ActivityDescription><Ateco2025 Code="410000/25">Costruzione di edifici</Ateco2025><NegativeEvents>false</NegativeEvents><Group>BARALDI</Group><MainShareholders><ShareHolderName>BARALDI MARTINA</ShareHolderName><ShareHolderName>BARALDI LUCA</ShareHolderName></MainShareholders></Aziendaslim></ShareholderItem><PercentageShares>95</PercentageShares><ValueOfPart>193600</ValueOfPart><CurrencyValueOfPart>EURO</CurrencyValueOfPart></Shareholder></ShareholdersList></Shareholders>`);
  expect(r.soci).toEqual([{ tipo: "societa", id_cerved: "398732590", subject_id: null, nome: "BIG SRL", codice_fiscale: "02992680344", percentuale: 95, diritto: "PROPRIETA'", codice_diritto: "01", valore_quota: 193600, valuta: "EURO", stato_codice: "I", stato_descrizione: "Attiva", stato_dal: null, forma: "SOCIETA' A RESPONSABILITA' LIMITATA", ateco_codice: "410000", ateco_descrizione: "Costruzione di edifici", eventi_negativi: false, gruppo: "BARALDI", nazionalita: null, soci_principali: ["BARALDI MARTINA", "BARALDI LUCA"] }]);
});

test("socio società estera (CompanyInformation diretto, senza codice fiscale)", () => {
  const r = xml(`<Shareholders><ShareholdersList><Shareholder><LinkCode>01</LinkCode><DescriptionLinkCode>PROPRIETA'</DescriptionLinkCode><ShareholderItem><CompanyInformation><IDCompany>409910230</IDCompany><CompanyName>ARIM HOLDING SARL</CompanyName><Nationality>Lussemburgo</Nationality></CompanyInformation></ShareholderItem><PercentageShares>66.26</PercentageShares></Shareholder></ShareholdersList></Shareholders>`);
  expect(r.soci[0]).toMatchObject({ tipo: "societa_estera", id_cerved: "409910230", nome: "ARIM HOLDING SARL", codice_fiscale: null, percentuale: 66.26, nazionalita: "Lussemburgo", soci_principali: [] });
});

test("contenitori assenti → array vuoti; tag simili fuori radice ignorati", () => {
  const r = xml(`<PositionCompany><PositionRelatedCompany><Shareholders><ShareholdersList><Shareholder><ShareholderItem><IndividualInformation><Name>X</Name></IndividualInformation></ShareholderItem></Shareholder></ShareholdersList></Shareholders></PositionRelatedCompany></PositionCompany>`);
  expect(r.soci).toEqual([]); expect(r.titolari_effettivi).toEqual([]); expect(r.partecipazioni).toEqual([]);
});

test("titolare persona giuridica: PG → persona false", () => {
  const r = xml(`<BeneficialOwnersV2><BeneficialOwner Strategy="POTERI_AMMINISTRAZIONE_DIREZIONE_RAPPRESENTANZA"><FlagStatus>PG</FlagStatus><CompanyName>ALFA SPA</CompanyName><TaxCode>01234567890</TaxCode></BeneficialOwner></BeneficialOwnersV2>`);
  expect(r.titolari_effettivi[0]).toEqual({ nome: "ALFA SPA", codice_fiscale: "01234567890", id_soggetto: null, criterio: "POTERI_AMMINISTRAZIONE_DIREZIONE_RAPPRESENTANZA", persona: false, percentuale: null });
});
