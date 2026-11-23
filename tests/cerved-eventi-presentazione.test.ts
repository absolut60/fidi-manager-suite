import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { normalizzaLightReportXml } from "../src/lib/cerved/cerved.server";
import { datiSchedaCerved, elementoEventiAzienda, elementoEventiRelazionati, soggettiRelazionatiConEventi, vociProcedureAtti, eventiAziendaAssenti, TESTO_DA_VERIFICARE } from "../src/lib/cerved-presentazione";
import { eventiSoggettiCerved, nomiEventiRelazionatiCerved } from "../src/lib/cerved-collegati";

const lr = (f: string) => normalizzaLightReportXml(readFileSync(`${import.meta.dir}/fixtures/${f}`, "utf8")) as any;
const scheda = (l: any, granulari?: any) => datiSchedaCerved({ light_report: l, ...(granulari ? { eventi_negativi: granulari } : {}) }).eventi;

test("ECOCOSTRUZIONI: azienda grigia 'Solo atti informativi', un atto informativo cancellato", () => {
  const l = lr("cerved-light-report-ecocostruzioni.xml");
  expect(elementoEventiAzienda(l, scheda(l))).toEqual({ testo: "Solo atti informativi", tono: "grigio" });
  const v = vociProcedureAtti(l);
  expect(v).toHaveLength(1);
  expect(v[0]!.badge.map((b) => b.testo)).toEqual(["Informativo", "Cancellato il 07/07/2026"]);
  expect(v[0]!.soggetto).toBeNull();
  expect(eventiAziendaAssenti({ ...l, gradings: { dettagli: { eventi_negativi: { descrizione: "C4_1" } } } })).toBe(true);
});

test("GUAGROUP: azienda verde, relazionati rosso con FLORIO COSTRUZIONI e FLOVER", () => {
  const l = lr("cerved-light-report-guagroup.xml");
  const ev = scheda(l);
  expect(elementoEventiAzienda(l, ev).tono).toBe("verde");
  const nomi = soggettiRelazionatiConEventi(l);
  expect(nomi).toEqual(expect.arrayContaining(["FLORIO COSTRUZIONI S.R.L.", "FLOVER S.R.L."]));
  const r = elementoEventiRelazionati([...nomiEventiRelazionatiCerved(ev.persone, l.societa_collegate), ...nomi]);
  expect(r.tono).toBe("rosso");
  const v = vociProcedureAtti(l);
  expect(v.filter((x) => x.tipo === "procedura")).toHaveLength(2);
  expect(v.every((x) => x.soggetto)).toBe(true);
  expect(v.find((x) => x.tipo === "procedura")!.badge[0]).toEqual({ testo: "In corso", tono: "rosso" });
  expect(ev.collegati.some((c: any) => c.eventi?.length)).toBe(true);
  const s = eventiSoggettiCerved(ev.collegati, l.eventi_negativi.altri_soggetti, l.societa_collegate, l.esponenti);
  expect(Object.values(s.perCf).flat().length + s.altri.length).toBeGreaterThan(0);
});

test("ripiego granulari senza contenitori: grigio 'da verificare', mai rosso", () => {
  const ev = datiSchedaCerved({ eventi_negativi: { azienda: { procedure: true, pregiudizievoli: true } } }).eventi;
  expect(ev.azienda.procedure).toBeNull();
  expect(ev.da_verificare).toEqual(["pregiudizievoli", "procedure"]);
  const e = elementoEventiAzienda(null, ev);
  expect(e.tono).toBe("grigio");
  expect(e.testo).toContain(TESTO_DA_VERIFICARE);
  // con contenitori nel Light Report il ripiego non si usa
  const l = lr("cerved-light-report-guagroup.xml");
  expect(scheda(l, { azienda: { procedure: true } }).da_verificare).toEqual([]);
});

test("istanza respinta: niente flag rosso, testo 'istanza respinta'", () => {
  const x = "<LightReport><Subsidiaries><Othersubsidiaries><OthersubsidiarieInfos>BETA SRL</OthersubsidiarieInfos><TaxCode>01234567890</TaxCode></Othersubsidiaries></Subsidiaries><Bankruptcy><BankruptcyBlock><SubjectReport>true</SubjectReport><SingleBankruptcyBlock><EventDescription>FALLIMENTO</EventDescription><Rejected>true</Rejected></SingleBankruptcyBlock></BankruptcyBlock><BankruptcyBlock><SubjectReport>false</SubjectReport><SingleBankruptcyBlock><AgainstItemInformation><AgainstItemCompany><CompanyName>BETA SRL</CompanyName><TaxCode>01234567890</TaxCode></AgainstItemCompany></AgainstItemInformation><EventDescription>FALLIMENTO</EventDescription><Rejected>true</Rejected></SingleBankruptcyBlock></BankruptcyBlock></Bankruptcy></LightReport>";
  const l = normalizzaLightReportXml(x) as any;
  expect(l.eventi_negativi.azienda.procedure).toBe(false);
  expect(l.eventi_negativi.collegati[0].eventi).toEqual(["Fallimento (istanza respinta)"]);
  expect(soggettiRelazionatiConEventi(l)).toEqual([]);
  expect(vociProcedureAtti(l)[0]!.badge[0]).toEqual({ testo: "Istanza respinta", tono: "grigio" });
});

test("relazionati: massimo due nomi e 'e altri N'", () => {
  expect(elementoEventiRelazionati(["A", "B", "C", "D"]).testo).toBe("4 soggetti: A, B e altri 2");
  expect(elementoEventiRelazionati([])).toEqual({ testo: "Nessuno segnalato", tono: "verde" });
});
