import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";
import { parseFornitoriGammaSheet, trovaFoglioFornitori, dataOraGamma } from "../src/lib/inngest/parsers.server";

const H = ["Codice fornitore", "Ragione sociale", "Alias", "Valida", "Partita IVA", "Persona fisica",
  "Codice pagamento", "Pagamento", "Ultima modifica", "Codice anagrafica generale", "Codice cliente collegato",
  "N codici cliente stessa anagrafica", "Colonna estranea"];

function wb(righe: unknown[][], nome = "SYNC_ANAGRAFICA_FORNITORI") {
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([H, ...righe]), nome);
  return w;
}

describe("parser fornitori Gamma (FM61)", () => {
  test("mappa i campi, trim, booleani e codici interi", () => {
    const s = trovaFoglioFornitori(wb([[101, "  ACME SRL ", "", "Valida", " 01234567890 ", "No", "RB60", "RiBa 60", "05/11/2026 08:30", 5001, 13908, 2, "x"]]))!;
    const { rows, anomalie } = parseFornitoriGammaSheet(s);
    expect(anomalie).toHaveLength(0);
    expect(rows[0]).toMatchObject({ codice_gestionale: 101, ragione_sociale: "ACME SRL", alias: null, valida: true,
      partita_iva: "01234567890", persona_fisica: false, condizione_pagamento_cod: "RB60",
      condizione_pagamento_desc: "RiBa 60", ultima_modifica_gamma: "2026-11-05T08:30:00",
      codice_anagrafica_generale: 5001, codice_cliente_gamma: 13908 });
    expect(Object.keys(rows[0])).not.toContain("Colonna estranea");
  });

  test("Non Valida → false, Si → true", () => {
    const { rows } = parseFornitoriGammaSheet(trovaFoglioFornitori(wb([[1, "A", "", "Non Valida", "", "Si"]]))!);
    expect(rows[0].valida).toBe(false);
    expect(rows[0].persona_fisica).toBe(true);
  });

  test("codice mancante → anomalia e riga scartata", () => {
    const { rows, anomalie } = parseFornitoriGammaSheet(trovaFoglioFornitori(wb([["", "SENZA CODICE"], [2, "OK"]]))!);
    expect(rows.map((r) => r.codice_gestionale)).toEqual([2]);
    expect(anomalie).toEqual([{ riga: 2, tipo: "codice_mancante", codice: null, ragione_sociale: "SENZA CODICE" }]);
  });

  test("codice duplicato → anomalia, tenuta l'ultima riga", () => {
    const { rows, anomalie } = parseFornitoriGammaSheet(trovaFoglioFornitori(wb([[7, "PRIMA"], [8, "ALTRO"], [7, "ULTIMA"]]))!);
    expect(rows.find((r) => r.codice_gestionale === 7)?.ragione_sociale).toBe("ULTIMA");
    expect(rows).toHaveLength(2);
    expect(anomalie[0]).toMatchObject({ tipo: "codice_duplicato", codice: "7", riga: 2 });
  });

  test("accetta il foglio FORNITORI o il primo con Codice fornitore", () => {
    expect(trovaFoglioFornitori(wb([[1, "A"]], "FORNITORI"))).not.toBeNull();
    expect(trovaFoglioFornitori(wb([[1, "A"]], "Foglio1"))).not.toBeNull();
  });

  test("data/ora seriale Excel", () => {
    expect(dataOraGamma(46331.5)).toBe("2026-11-05T12:00:00");
  });
});
