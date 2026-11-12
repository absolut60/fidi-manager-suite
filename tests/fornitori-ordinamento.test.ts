import { describe, expect, it } from "bun:test";
import { elencoFornitoriInput, idsFornitoriInput, ordinamentoFornitoriValido } from "../src/lib/fornitori";

describe("ordinamento elenco fornitori", () => {
  it("default ragione sociale crescente", () => {
    const d = elencoFornitoriInput.parse({});
    expect([d.ordina, d.direzione]).toEqual(["ragione_sociale", "asc"]);
  });
  it("colonna fuori whitelist torna a ragione sociale", () => {
    expect(ordinamentoFornitoriValido("condizione_pagamento", "desc")).toEqual({ ordina: "ragione_sociale", direzione: "desc" });
    expect(() => elencoFornitoriInput.parse({ ordina: "id; drop table" })).toThrow();
  });
  it("direzione diversa da desc diventa asc", () => {
    expect(ordinamentoFornitoriValido("citta", "boh").direzione).toBe("asc");
  });
  it("gli id filtrati non hanno ordinamento", () => {
    expect("ordina" in idsFornitoriInput.shape).toBe(false);
  });
});
