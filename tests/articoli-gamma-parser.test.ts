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

const acquistoNull = { acq_prezzo: null, acq_sc1: null, acq_sc2: null, acq_sc3: null,
  acq_trasporto_perc: null, acq_trasporto_euro: null };

describe("parser articoli Gamma (FM61 2A)", () => {
  test("trim, maiuscole UM, stato, fornitore pref, listini solo se presenti", () => {
    const f = trovaFoglioArticoli(foglio([[" A001 ", " Cartongesso ", "FAM1   ", "KNA  ", "Knauf", "mq", "pz", 2.5,
      "In esaurimento", "15/03/2024", "1234", "IGNORATO", 10.5, 7.2, "", "", "x"]]))!;
    const { rows, marche, anomalie } = parseArticoliGammaSheet(f.sheet);
    expect(anomalie).toHaveLength(0);
    expect(rows[0]).toMatchObject({ codice: "A001", descrizione: "Cartongesso", codice_famiglia: "FAM1", marca_codice: "KNA",
      um: "MQ", um2: "PZ", fattore_conversione: 2.5, stato_gamma: "in_esaurimento", data_creazione_gamma: "2024-03-15",
      fornitore_pref_codice: 1234 });
    expect(rows[0].listini).toEqual([{ listino: 10, prezzo_vendita: 10.5, costo_acquisto: 7.2, ...acquistoNull }]);
    expect(marche).toEqual([{ codice: "KNA", descrizione: "Knauf" }]);
    expect(Object.keys(rows[0])).not.toContain("Fornitore pref");
  });

  test("In uso → in_uso; listino 9 creato con solo prezzo", () => {
    const { rows } = parseArticoliGammaSheet(trovaFoglioArticoli(foglio([["B1", "X", "", "", "", "", "", "", "In uso", "", "", "", "", "", "", 3]]))!.sheet);
    expect(rows[0].stato_gamma).toBe("in_uso");
    expect(rows[0].listini).toEqual([{ listino: 9, prezzo_vendita: 3, costo_acquisto: null, ...acquistoNull }]);
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

  test("intestazioni reali: tutti i sei valori di acquisto per 10, 20, 30 e 9 arrivano nel JSON", () => {
    const headers = ["Codice", "Costo listino acq L9",
      "Acq L10 Prezzo", "Acq L10 Sc1 %", "Acq L10 Sc2 %", "Acq L10 Sc3 %", "Acq L10 Trasporto %", "Acq L10 Trasporto euro",
      "Acq L20 Prezzo", "Acq L20 Sc1 %", "Acq L20 Sc2 %", "Acq L20 Sc3 %", "Acq L20 Trasporto %", "Acq L20 Trasporto euro",
      "Acq L30 Prezzo", "Acq L30 Sc1 %", "Acq L30 Sc2 %", "Acq L30 Sc3 %", "Acq L30 Trasporto %", "Acq L30 Trasporto euro",
      "Acq L9 Prezzo", "Acq L9 Sc1 %", "Acq L9 Sc2 %", "Acq L9 Sc3 %", "Acq L9 Trasporto %", "Acq L9 Trasporto euro"];
    const sheet = XLSX.utils.aoa_to_sheet([headers, ["A2", 7.77,
      "100,5", 10, 2, 3, "4,5", "6,75", 200, 20, 4, 6, 8, 10,
      300, 30, 6, 9, 12, 15, 90, 9, 0, 0, 0, 0]]);
    const { rows } = parseArticoliGammaSheet(sheet);
    expect(JSON.parse(JSON.stringify(rows[0]?.listini))).toEqual([
      { listino: 10, prezzo_vendita: null, costo_acquisto: null, acq_prezzo: 100.5, acq_sc1: 10, acq_sc2: 2, acq_sc3: 3, acq_trasporto_perc: 4.5, acq_trasporto_euro: 6.75 },
      { listino: 20, prezzo_vendita: null, costo_acquisto: null, acq_prezzo: 200, acq_sc1: 20, acq_sc2: 4, acq_sc3: 6, acq_trasporto_perc: 8, acq_trasporto_euro: 10 },
      { listino: 30, prezzo_vendita: null, costo_acquisto: null, acq_prezzo: 300, acq_sc1: 30, acq_sc2: 6, acq_sc3: 9, acq_trasporto_perc: 12, acq_trasporto_euro: 15 },
      { listino: 9, prezzo_vendita: null, costo_acquisto: 7.77, acq_prezzo: 90, acq_sc1: 9, acq_sc2: 0, acq_sc3: 0, acq_trasporto_perc: 0, acq_trasporto_euro: 0 },
    ]);
  });

  test("file vecchio: sei campi null e vendita/netto invariati", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["Codice", "Prezzo L10 Lombardia", "Costo listino acq L10"], ["OLD", 15, 8.25]]);
    expect(parseArticoliGammaSheet(sheet).rows[0]?.listini).toEqual([
      { listino: 10, prezzo_vendita: 15, costo_acquisto: 8.25, ...acquistoNull },
    ]);
  });

  test("solo sconti o trasporto senza prezzo, netto o vendita non creano un listino", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["Codice", "Acq L10 Sc1 %", "Acq L10 Trasporto euro"], ["NO", 10, 2]]);
    expect(parseArticoliGammaSheet(sheet).rows[0]?.listini).toEqual([]);
  });
});
