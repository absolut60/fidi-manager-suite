import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { normalizzaLightReportXml } from "../src/lib/cerved/cerved.server";
import { rileggiLightReport } from "../src/lib/cerved/cerved-rilettura.server";

const leggi = (f: string) => normalizzaLightReportXml(readFileSync(`${import.meta.dir}/fixtures/${f}`, "utf8"));

test("ECOCOSTRUZIONI: atto proprio non pregiudizievole e cancellato, nessuna procedura", () => {
  const r = leggi("cerved-light-report-ecocostruzioni.xml");
  expect(r.eventi_negativi.azienda?.procedure).toBe(false);
  expect(r.eventi_negativi.azienda?.fallimenti_propri).toBe(false);
  expect(r.eventi_negativi.azienda?.pregiudizievoli).toBe(false);
  expect(r.protesti.procedure).toBe(false);
  expect(r.protesti.fallimento).toBe(false);
  expect(r.procedure_concorsuali).toEqual([]);
  expect(r.atti_conservatoria).toHaveLength(1);
  const a = r.atti_conservatoria[0]!;
  expect(a).toMatchObject({ riguarda_azienda: true, pregiudizievole: false, cancellato: true, data_cancellazione: "2026-07-07",
    descrizione: "ESECUZIONE IN FORMA SPECIFICA", data: "2026-05-04", conservatoria: "BERGAMO", importo_iscritto: null,
    a_favore_di: "CATIA GRITTI", numero_registrazione: "23756/17210" });
  expect(r.eventi_negativi.altri_soggetti).toEqual([]);
});

test("GUAGROUP: procedure e atti dei collegati, mai sull'azienda", () => {
  const r = leggi("cerved-light-report-guagroup.xml");
  expect(r.eventi_negativi.azienda?.procedure).toBe(false);
  expect(r.eventi_negativi.azienda?.fallimenti_propri).toBe(false);
  expect(r.eventi_negativi.azienda?.pregiudizievoli).toBe(false);
  expect(r.protesti.fallimento).toBe(false);
  expect(r.procedure_concorsuali).toHaveLength(2);
  expect(r.procedure_concorsuali.every((p) => !p.riguarda_azienda && p.tipo === "LIQUIDAZIONE GIUDIZIALE")).toBe(true);
  expect(r.procedure_concorsuali[0]).toMatchObject({ soggetto: "FLORIO COSTRUZIONI S.R.L.", codice_fiscale: "02851440129", data_apertura: "2025-09-08", codice_evento: "LZ" });
  const florio = r.eventi_negativi.collegati.find((c) => c.codice_fiscale === "02851440129");
  expect(florio?.eventi?.[0]).toBe("Liquidazione giudiziale — Tribunale di Busto Arsizio");
  expect(florio?.eventi?.some((e) => e.includes("3.571.845 €"))).toBe(true);
  const ruolo = r.atti_conservatoria.find((a) => a.importo_iscritto === 3571845);
  expect(ruolo).toMatchObject({ riguarda_azienda: false, pregiudizievole: true, cancellato: false, a_favore_di: "AGENZIA DELLE ENTRATE-RISCOSSIONE" });
});

test("fixture esistenti: nessuna procedura, pregiudizievoli false", () => {
  for (const f of ["cerved-light-report-build-technology.xml", "cerved-light-report-deleo.xml", "cerved-light-report-ge-trade.xml"]) {
    const r = leggi(f);
    expect(r.eventi_negativi.azienda?.pregiudizievoli).toBe(false);
    expect(r.eventi_negativi.altri_soggetti).toEqual([]);
  }
});

function dbFinto(foto: { id: string; chiamata_id: string | null; id_soggetto: number }[], xml: Record<string, string>) {
  const aggiornati: { id: string; campi: Record<string, unknown> }[] = [];
  const tabelle: string[] = [];
  const from = (t: string) => {
    tabelle.push(t);
    const q: any = { _f: {} as Record<string, unknown>, _upd: null as any };
    q.select = () => q; q.order = () => q; q.limit = () => Promise.resolve({ data: [], error: null });
    q.not = () => q; q.in = () => q;
    q.eq = (k: string, v: unknown) => {
      q._f[k] = v;
      if (q._upd) { aggiornati.push({ id: v as string, campi: q._upd }); return Promise.resolve({ error: null }); }
      if (t === "cerved_fotografie") return Promise.resolve({ data: foto, error: null });
      if (t === "cerved_report") return Promise.resolve({ data: [], error: null });
      return q;
    };
    q.maybeSingle = () => Promise.resolve({ data: xml[q._f.id] ? { risposta: { contenuto_xml: xml[q._f.id] } } : null, error: null });
    q.update = (c: Record<string, unknown>) => { q._upd = c; return q; };
    return q;
  };
  return { db: { from }, aggiornati, tabelle };
}

test("rilettura: aggiorna solo dati, salta righe senza XML, nessuna chiamata a Cerved", async () => {
  const x = readFileSync(`${import.meta.dir}/fixtures/cerved-light-report-ecocostruzioni.xml`, "utf8");
  const f = dbFinto([{ id: "f1", chiamata_id: "c1", id_soggetto: 1 }, { id: "f2", chiamata_id: null, id_soggetto: 2 }], { c1: x });
  const orig = globalThis.fetch; let chiamate = 0;
  globalThis.fetch = (() => { chiamate++; throw new Error("no"); }) as never;
  try {
    const r = await rileggiLightReport(f.db);
    expect(r).toEqual({ lette: 2, aggiornate: 1, senza_xml: 1, errori: [] });
  } finally { globalThis.fetch = orig; }
  expect(chiamate).toBe(0);
  expect(f.aggiornati).toHaveLength(1);
  expect(f.aggiornati[0]!.id).toBe("f1");
  expect(Object.keys(f.aggiornati[0]!.campi)).toEqual(["dati"]);
  expect(f.tabelle.includes("cerved_soggetti")).toBe(false);
});
