import { describe, expect, it } from "bun:test";
import { datiMancantiRigaGamma } from "../src/lib/articolo-in-definizione";

const completa = { tipo_riga: "manuale", articolo_codice: null, fornitore_id: "f1", codice_articolo_fornitore: "FX-1", descrizione: "Lavabo", um: "PZ", costo: 10, marca: "MarcaX" };

describe("datiMancantiRigaGamma", () => {
  it("riga completa: nessun dato mancante", () => {
    expect(datiMancantiRigaGamma(completa)).toEqual([]);
  });
  it("riga parziale: elenca i dati mancanti", () => {
    expect(datiMancantiRigaGamma({ ...completa, fornitore_id: null, um: " ", costo: null })).toEqual(["fornitore", "U.M.", "costo"]);
  });
  it("riga con articolo Gamma: nessun dato mancante", () => {
    expect(datiMancantiRigaGamma({ tipo_riga: "articolo_singolo", articolo_codice: "ABC", descrizione: null })).toEqual([]);
  });
  it("riga non valorizzata (nota): nessun dato mancante", () => {
    expect(datiMancantiRigaGamma({ tipo_riga: "nota", descrizione: null })).toEqual([]);
  });
});
