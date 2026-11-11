import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";
import { parseArticoliGammaSheet, trovaFoglioArticoli, numeroGamma } from "../src/lib/inngest/parsers.server";

const H = ["Codice", "Descrizione", "Codice famiglia", "Codice marca", "Marca", "UM", "UM 2", "Fattore conversione",
  "Stato", "Data creazione", "Codice fornitore pref", "Fornitore pref", "Prezzo L10 Lombardia", "Costo listino acq L10",
  "Prezzo L20 Piemonte", "Prezzo L9", "Colonna estranea"];

function foglio(righe: unknown[][], nome = "ARTICOLI") {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([H, ...righe]), nome);
  return wb;
}

describe("parser articoli Gamma (FM61 2A)", () => {
  test("trim, maiuscole UM, stato, fornitore pref, listini solo se presenti", () => {
    const f = trovaFoglioArticoli(foglio([[" A001 ", " Cartongesso ", "FAM1   ", "KNA  ", "Knauf", "mq", "pz", 2.5,
      "In esaurimento", "15/03/2024", "1234", "IGNORATO", 10.5, 7.2, "", "", "x"]]))!;
    const { rows, marche, anomalie } = parseArticoliGammaSheet(f.sheet);
    expect(anomalie).toHaveLength(0);
    expect(rows[0]).toMatchObject({ codice: "A001", descrizione: "Cartongesso", codice_famiglia: "FAM1", marca_codice: "KNA",
      um: "MQ", um2: "PZ", fattore_conversione: 2.5, stato_gamma: "in_esaurimento", data_creazione_gamma: "2024-03-15",
      fornitore_pref_codice: 1234 });
    expect(rows[0].listini).toEqual([{ listino: 10, prezzo_vendita: 10.5, costo_acquisto: 7.2 }]);
    expect(marche).toEqual([{ codice: "KNA", descrizione: "Knauf" }]);
    expect(Object.keys(rows[0])).not.toContain("Fornitore pref");
  });

  test("In uso → in_uso; listino 9 creato con solo prezzo", () => {
    const { rows } = parseArticoliGammaSheet(trovaFoglioArticoli(foglio([["B1", "X", "", "", "", "", "", "", "In uso", "", "", "", "", "", "", 3]]))!.sheet);
    expect(rows[0].stato_gamma).toBe("in_uso");
    expect(rows[0].listini).toEqual([{ listino: 9, prezzo_vendita: 3, costo_acquisto: null }]);
  });

  test("codice mancante → anomalia e riga scartata; duplicato → tenuta l'ultima", () => {
    const { rows, anomalie } = parseArticoliGammaSheet(trovaFoglioArticoli(foglio([["", "SENZA"], ["C1", "PRIMA"], ["C1", "ULTIMA"]]))!.sheet);
    expect(rows.map((r) => r.descrizione)).toEqual(["ULTIMA"]);
    expect(anomalie.map((a) => a.tipo)).toEqual(["codice_mancante", "codice_duplicato"]);
  });

  test("foglio solo per nome ARTICOLI", () => {
    expect(trovaFoglioArticoli(foglio([["A", "B"]], "ARTICOLI_FORNITORI"))).toBeNull();
  });

  test("numeri: italiano con virgola e punto decimale", () => {
    expect(numeroGamma("1.234,5")).toBe(1234.5);
    expect(numeroGamma("12.5")).toBe(12.5);
    expect(numeroGamma("")).toBeNull();
  });
});
