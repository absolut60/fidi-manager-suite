import { describe, it, expect } from "bun:test";
import * as XLSX from "xlsx";
import {
  parseDepositiGammaSheet,
  parseGiacenzeGammaSheet,
  parseArticoliFornitoriGammaSheet,
  preparaFileListiniGamma,
} from "@/lib/listini-gamma-parser";

const foglio = (rows: unknown[][]) => XLSX.utils.aoa_to_sheet(rows);

describe("DEPOSITI", () => {
  it("mappa Conta in disponibilita e lascia vuota la sede della logistica comune", () => {
    const r = parseDepositiGammaSheet(foglio([
      ["Deposito", "Descrizione", "Codice sede", "Sede", "Sede in Gamma", "Tipo", "Conta in disponibilita sede"],
      [" 01 ", "Centrale Milano", 1, "MILANO", 1, "Centrale", "Si"],
      ["ZM", "Moncalieri", "", "LOGISTICA COMUNE", 1, "Logistica", "Logistica comune"],
      ["SV", "Svalutazioni", 1, "MILANO", 1, "Svalutazioni", "No"],
      ["XX", "Strano", 1, "", 1, "", "Forse"],
      ["", "Senza codice", 1, "", 1, "", "Si"],
    ]));
    expect(r.rows.map((x) => [x.codice, x.codice_sede, x.conta_disponibilita])).toEqual([
      ["01", 1, "si"], ["ZM", null, "logistica_comune"], ["SV", 1, "no"],
    ]);
    expect(r.anomalie.map((a) => a.tipo)).toEqual(["valore_non_valido", "codice_mancante"]);
  });
});

describe("GIACENZE_DEPOSITO", () => {
  it("salva la disponibilità di Gamma com'è e tiene l'ultima riga duplicata", () => {
    const r = parseGiacenzeGammaSheet(foglio([
      ["Codice", "Codice sede", "Sede", "Deposito", "Descrizione deposito", "Tipo", "Giacenza", "Impegnato clienti", "Ordinato fornitori", "Disponibilita", "Aggiornato il"],
      ["A1", 1, "MI", "01", "x", "Centrale", 10, 3, 2, 9, "05/11/2026 08:30"],
      ["A1", 1, "MI", "01", "x", "Centrale", 12, 0, 0, 12, ""],
      ["", 1, "MI", "01", "x", "Centrale", 1, 0, 0, 1, ""],
    ]));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ articolo_codice: "A1", deposito_codice: "01", giacenza: 12, disponibilita: 12 });
    expect(r.anomalie.map((a) => a.tipo).sort()).toEqual(["chiave_duplicata", "codice_mancante"]);
  });
});

describe("ARTICOLI_FORNITORI", () => {
  it("Preferenziale 1/0 e chiave articolo+fornitore", () => {
    const r = parseArticoliFornitoriGammaSheet(foglio([
      ["Codice", "Codice fornitore", "Fornitore", "Preferenziale", "Codice articolo fornitore"],
      ["A1", 120, "Rossi", 1, "R-1"],
      ["A1", 121, "Bianchi", 0, ""],
      ["A2", "abc", "?", 0, ""],
    ]));
    expect(r.rows.map((x) => [x.articolo_codice, x.fornitore_codice, x.preferenziale, x.codice_articolo_fornitore])).toEqual([
      ["A1", 120, true, "R-1"], ["A1", 121, false, null],
    ]);
    expect(r.anomalie).toHaveLength(1);
  });

  it("codici articolo fornitore diversi non sono doppioni; doppione vero tiene la preferenziale", () => {
    const r = parseArticoliFornitoriGammaSheet(foglio([
      ["Codice", "Codice fornitore", "Fornitore", "Preferenziale", "Codice articolo fornitore"],
      ["ACER3015PG", 886, "X", 0, "RPIG03"],
      ["ACER3015PG", 886, "X", 1, "3015PG"],
      ["ADD09779", 811, "Y", 1, "96351"],
      ["ADD09779", 811, "Y", 0, "96351"],
    ]));
    expect(r.rows.map((x) => [x.articolo_codice, x.codice_articolo_fornitore, x.preferenziale])).toEqual([
      ["ACER3015PG", "RPIG03", false], ["ACER3015PG", "3015PG", true], ["ADD09779", "96351", true],
    ]);
    expect(r.anomalie).toHaveLength(1);
    expect(r.anomalie[0].riga).toBe(5);
  });
});

describe("riconoscimento solo per nome", () => {
  it("i tre fogli diventano pacchetti, nell'ordine fisso dei gestori", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, foglio([["Codice", "Codice fornitore", "Preferenziale"], ["A1", 1, 1]]), "ARTICOLI_FORNITORI");
    XLSX.utils.book_append_sheet(wb, foglio([["Deposito", "Conta in disponibilita sede"], ["01", "Si"]]), "DEPOSITI");
    XLSX.utils.book_append_sheet(wb, foglio([["Codice", "Deposito", "Giacenza"], ["A1", "01", 5]]), "GIACENZE_DEPOSITO");
    XLSX.utils.book_append_sheet(wb, foglio([["Codice"]]), "PREZZI");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const { manifest } = preparaFileListiniGamma(buf);
    expect(manifest.fogli.map((f) => [f.chiave, f.righe, f.lotto])).toEqual([
      ["depositi", 1, 1000], ["giacenze", 1, 2000], ["articoli_fornitori", 1, 2000],
    ]);
    expect(manifest.nonGestiti).toEqual(["PREZZI"]);
  });
});
