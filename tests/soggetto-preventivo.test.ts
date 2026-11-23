import { describe, expect, test } from "bun:test";
import { campiSoggettoPreventivo, nomeLeadPreventivo, riferimentoVuoto, type LeadPreventivo } from "../src/lib/soggetto-preventivo";
import { sedeGiacenzePreventivo } from "../src/lib/preventivo-creazione";

const lead: LeadPreventivo = { id: "lead-1", ragione_sociale: "Impresa nuova", nome: null, cognome: null, telefono: null, email: null, store_id: "sede-lead", agente_codice: "7", condizione_pagamento_cod: "RB60", listino_rif: 30, macrocategoria_rif: "01", categoria_rif: "01" };
describe("FM71 soggetto preventivo", () => {
  test("lead esistente scrive riferimento e mai cliente insieme", () => {
    expect(campiSoggettoPreventivo({ tipo: "lead", id: lead.id, lead }, lead)).toEqual({ cliente_id: null, lead_id: "lead-1", listino_rif: 30, macrocategoria_rif: "01", categoria_rif: "01" });
  });
  test("lead senza listino o senza macrocategoria non può essere salvato", () => {
    expect(() => campiSoggettoPreventivo({ tipo: "lead", id: lead.id, lead }, riferimentoVuoto)).toThrow();
    expect(() => campiSoggettoPreventivo({ tipo: "lead", id: lead.id, lead }, { ...lead, macrocategoria_rif: null })).toThrow();
  });
  test("passaggio a cliente azzera sempre il lead", () => {
    expect(campiSoggettoPreventivo({ tipo: "cliente", id: "cliente-1" }, lead)).toEqual({ cliente_id: "cliente-1", lead_id: null });
  });
  test("lead senza categoria non può essere creato o collegato", () => {
    expect(() => campiSoggettoPreventivo({ tipo: "lead", id: lead.id, lead }, { ...lead, categoria_rif: null })).toThrow();
  });
  test("sede lead è solo riserva di giacenza e non modifica il documento", () => {
    const prev = { store_id: null, filiale: null };
    expect(sedeGiacenzePreventivo(prev, { store_id: lead.store_id, sede_nome: "Cambiago" })).toEqual({ sedeGiacenzaId: "sede-lead", sedeNome: "Cambiago" });
    expect(prev).toEqual({ store_id: null, filiale: null });
  });
});
describe("nomeIntestatarioPdf", () => {
  test("stampa la ragione sociale del lead quando manca il cliente", async () => {
    const { nomeIntestatarioPdf } = await import("../src/lib/soggetto-preventivo");
    expect(nomeIntestatarioPdf({ cliente: null, lead: { ragione_sociale: "PIPPO SRL", nome: null, cognome: null } })).toBe("PIPPO SRL");
  });
  test("per il cliente resta la sua ragione sociale", async () => {
    const { nomeIntestatarioPdf } = await import("../src/lib/soggetto-preventivo");
    expect(nomeIntestatarioPdf({ cliente: { ragione_sociale: "ROSSI SPA" }, lead: null })).toBe("ROSSI SPA");
    expect(nomeIntestatarioPdf({ cliente: null, lead: null })).toBe("—");
  });
});

describe("bloccoDaKit per linea", () => {
  test("Da Kit spento solo per Showroom", async () => {
    const { lineaPreventivo } = await import("../src/lib/linee-preventivo");
    expect(lineaPreventivo("showroom").blocchi.bloccoDaKit).toBe(false);
    for (const l of ["sistema_made", "edilizia", "fotovoltaico"]) expect(lineaPreventivo(l as never).blocchi.bloccoDaKit).toBe(true);
  });
});
