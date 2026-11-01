import { describe, expect, it } from "bun:test";
import { applicaPerimetroFido, isPrivatoFido, PRESET_REVISIONE_FIDI_PERIMETRO } from "@/lib/fido-teorico";

describe("Privati fuori dal giro fidi", () => {
  it("partita IVA vuota", () => expect(isPrivatoFido({ partita_iva: "" })).toBe(true));
  it("partita IVA null", () => expect(isPrivatoFido({ partita_iva: null })).toBe(true));
  it("partita IVA solo spazi", () => expect(isPrivatoFido({ partita_iva: "   " })).toBe(true));
  it("partita IVA con CF sempre dentro, indipendentemente dal tipo", () => {
    const cliente = { partita_iva: " 12345678901 ", codice_fiscale: "RSSMRA80A01F205X", tipo_soggetto: "persona_fisica" };
    expect(isPrivatoFido(cliente)).toBe(false);
  });
  it("azienda senza partita IVA resta privata", () => {
    const cliente = { partita_iva: null, tipo_soggetto: "azienda" };
    expect(isPrivatoFido(cliente)).toBe(true);
  });
  it("preset Revisione applica il filtro SQL prima di paginare", () => {
    const filtri: Array<[string, boolean]> = [];
    const query = { eq: (colonna: string, valore: boolean) => { filtri.push([colonna, valore]); return query; } };
    applicaPerimetroFido(query, PRESET_REVISIONE_FIDI_PERIMETRO);
    expect(filtri).toEqual([["cliente_privato_fido", false]]);
  });
  it("lista normale non cambia il perimetro", () => {
    let chiamate = 0;
    const query = { eq: (_colonna: string, _valore: boolean) => { chiamate++; return query; } };
    expect(applicaPerimetroFido(query, { soloPartitaIvaFido: false })).toBe(query);
    expect(chiamate).toBe(0);
  });
});