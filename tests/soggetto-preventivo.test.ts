import { describe, expect, test } from "bun:test";
import { campiLeadRapido, campiSoggettoPreventivo, nomeLeadPreventivo, riferimentoVuoto, type LeadPreventivo } from "../src/lib/soggetto-preventivo";
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
  test("lead rapido usa valori fissi e lascia stato, tipo e priorità ai default", () => {
    const v = campiLeadRapido({ ragione_sociale: " Nuova impresa ", store_id: null }, "7");
    expect(v).toMatchObject({ ragione_sociale: "Nuova impresa", fonte: "manuale", fonte_dettaglio: "preventivatore", agente_codice: "7", email: null, telefono: null });
    expect(v).not.toHaveProperty("stato"); expect(v).not.toHaveProperty("tipo_lead"); expect(v).not.toHaveProperty("priorita");
  });
  test("lead rapido ammette persona e rifiuta identità vuota o email errata", () => {
    expect(campiLeadRapido({ nome: "Mario", cognome: "Rossi", store_id: null }, null).nome).toBe("Mario");
    expect(() => campiLeadRapido({ store_id: null }, null)).toThrow();
    expect(() => campiLeadRapido({ nome: "Mario", email: "errata", store_id: null }, null)).toThrow();
    expect(nomeLeadPreventivo({ ragione_sociale: null, nome: "Mario", cognome: "Rossi" })).toBe("Mario Rossi");
  });
  test("sede lead è solo riserva di giacenza e non modifica il documento", () => {
    const prev = { store_id: null, filiale: null };
    expect(sedeGiacenzePreventivo(prev, { store_id: lead.store_id, sede_nome: "Cambiago" })).toEqual({ sedeGiacenzaId: "sede-lead", sedeNome: "Cambiago" });
    expect(prev).toEqual({ store_id: null, filiale: null });
  });
});