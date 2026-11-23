import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizzaLightReportXml } from "../src/lib/cerved/cerved.server";
import { componiClientiGrafo, costruisciGrafoCerved, type ClienteMadeGrafo, type RigaClienteGrafo } from "../src/lib/cerved-grafo";
import { DettaglioNodoGrafo, VistaGrafoCollegati, clientiPerNodo, filtraGrafo } from "../src/components/cerved/grafo-collegati-cerved";

const r = normalizzaLightReportXml(readFileSync(`${import.meta.dir}/fixtures/cerved-light-report-ecocostruzioni.xml`, "utf8"));
const grafo = costruisciGrafoCerved(r, { nome: r.anagrafica?.denominazione ?? null, partita_iva: r.anagrafica?.partita_iva ?? null, codice_fiscale: r.anagrafica?.codice_fiscale ?? null });
const ecotema = (visibile: boolean): ClienteMadeGrafo => ({ chiave: "04835640162", cliente_id: "c-eco", ragione_sociale: "ECOTEMA SRL", codice: "C123", sede: "Lissone", fido: 10000, esposizione: 4000, scaduto: 500, scaduto_oltre_60: 100, bloccato: false, in_gestione_legale: false, visibile, e_questo_cliente: false, chiave_centro: false });
const link = (id: string, t: unknown) => <a data-cliente={id}>{t as string}</a>;

test("grafico ECOCOSTRUZIONI con cliente MADE su ECOTEMA: targhetta e riepilogo", () => {
  const html = renderToStaticMarkup(<VistaGrafoCollegati grafo={grafo} clienti={[ecotema(true)]} entita="cliente" />);
  expect(html).toContain("Grafico dei collegamenti");
  expect(html).toContain("1 società/persona collegata è già cliente MADE");
  expect(html).toMatch(/data-nodo="societa:cf:04835640162"[^]*?>MADE</);
});

test("filtro Legami cessati: spento nasconde gli archi non in corso", () => {
  const spento = renderToStaticMarkup(<VistaGrafoCollegati grafo={grafo} clienti={[]} entita="cliente" />);
  const acceso = renderToStaticMarkup(<VistaGrafoCollegati grafo={grafo} clienti={[]} entita="cliente" cessatiIniziali />);
  expect(grafo.archi.some((a) => !a.in_corso)).toBe(true);
  expect(spento).not.toContain('data-in-corso="false"');
  expect(acceso).toContain('data-in-corso="false"');
  expect(filtraGrafo(grafo, false).nodi.some((n) => n.nome === "ECOCOSTRUZIONI DI ROBECCHI EFREM")).toBe(false);
});

test("dettaglio: Apri scheda cliente solo se visibile", () => {
  const nodo = grafo.nodi.find((n) => n.nome === "ECOTEMA SRL")!;
  const si = renderToStaticMarkup(<DettaglioNodoGrafo nodo={nodo} grafo={grafo} clienti={clientiPerNodo(grafo, [ecotema(true)]).get(nodo.id)!} linkCliente={link} />);
  const no = renderToStaticMarkup(<DettaglioNodoGrafo nodo={nodo} grafo={grafo} clienti={clientiPerNodo(grafo, [ecotema(false)]).get(nodo.id)!} linkCliente={link} />);
  expect(si).toContain("Apri scheda cliente");
  expect(no).not.toContain("Apri scheda cliente");
  expect(no).toContain("ECOTEMA SRL (C123)");
});

test("Elenco: Soci con 80% e 20%", () => {
  const html = renderToStaticMarkup(<VistaGrafoCollegati grafo={grafo} clienti={[]} entita="cliente" vistaIniziale="elenco" />);
  const soci = html.slice(html.indexOf('aria-label="Soci"'), html.indexOf('aria-label="Titolari effettivi"'));
  expect(soci).toContain("ROBECCHI EFREM");
  expect(soci).toContain("80%");
  expect(soci).toContain("ROBECCHI GIORGIO");
  expect(soci).toContain("20%");
});

test("grafo solo centro: nulla", () => {
  const g = costruisciGrafoCerved({ soci: [], titolari_effettivi: [], partecipazioni: [], esponenti: [], societa_collegate: [] }, { nome: "X", partita_iva: "01234567890", codice_fiscale: null });
  expect(renderToStaticMarkup(<VistaGrafoCollegati grafo={g} clienti={[]} entita="cliente" />)).toBe("");
});

test("server: e_questo_cliente e chiave_centro per cliente e lead", () => {
  const riga = (id: string, piva: string): RigaClienteGrafo => ({ id, ragione_sociale: id, codice_gestionale: null, partita_iva: piva, codice_fiscale: null, totale_rischio: 0, bloccato: false, in_gestione_legale: false, fido_gestionale: 0, stores: { nome: "Lissone" } });
  const righe = [riga("self", "03882690161"), riga("eco", "04835640162")];
  const base = { chiavi: ["03882690161", "04835640162"], chiaviCentro: ["03882690161"], scaduti: new Map(), visibili: new Set(["eco"]) };
  const cliente = componiClientiGrafo(righe, { ...base, entita: "cliente", id: "self" });
  expect(cliente.map((c) => [c.cliente_id, c.e_questo_cliente, c.chiave_centro, c.visibile, c.sede])).toEqual([["self", true, true, false, "Lissone"], ["eco", false, false, true, "Lissone"]]);
  const lead = componiClientiGrafo(righe, { ...base, entita: "lead", id: "lead-1" });
  expect(lead.map((c) => [c.cliente_id, c.e_questo_cliente, c.chiave_centro])).toEqual([["self", true, true], ["eco", false, false]]);
});
