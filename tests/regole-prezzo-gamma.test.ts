import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";
import { FOGLI_REGOLE_PREZZO, parseRegolaPrezzoSheet, preparaFileListiniGamma } from "../src/lib/listini-gamma-parser";

const def = (k: string) => FOGLI_REGOLE_PREZZO.find((d) => d.chiave === k)!;
const foglio = (aoa: unknown[][]) => XLSX.utils.aoa_to_sheet(aoa);

describe("regole prezzo Gamma (FM61 3B)", () => {
  test("CLIENTI_LISTINO: cliente obbligatorio, testi trim, '' → null, sconti numerici", () => {
    const r = parseRegolaPrezzoSheet(def("clienti_condizioni"), foglio([
      ["Cliente", "Listino", "Macrocategoria", "Categoria", "Sottocategoria", "Listino piu articoli", "Sc1 cliente", "Sconto piede"],
      [123, 10, " EDILI ", "IMPRESE", "", "LPA1", "5,5", 2],
      ["", 20, "X", "", "", "", "", ""],
    ]));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ cliente_codice: 123, listino: 10, macrocategoria: "EDILI", sottocategoria: null, listino_piu_articoli: "LPA1", sc1_cliente: 5.5, sconto_piede: 2, sc2_cliente: null });
    expect(r.anomalie.map((a) => a.tipo)).toEqual(["codice_mancante"]);
  });

  test("SCONTI_CATEGORIA: sottocategoria vuota resta '', listino vuoto = tutti, date senza ora", () => {
    const r = parseRegolaPrezzoSheet(def("sconti_categoria"), foglio([
      ["Macrocategoria", "Categoria", "Sottocategoria", "Listino", "Valido dal", "Valido al", "Sc1"],
      ["A", "B", "", "", "01/02/2026", "31/12/2026 00:00", 10],
    ]));
    expect(r.rows[0]).toMatchObject({ id: 2, sottocategoria: "", listino: null, valido_dal: "2026-02-01", valido_al: "2026-12-31", sc1: 10 });
    expect(r.anomalie).toHaveLength(0);
  });

  test("i fogli regole sono un pacchetto ciascuno, dopo articoli-fornitori", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, foglio([["Codice", "Listino", "Deposito", "Prezzo"], ["A1", 10, "01", 3]]), "PREZZI_DEPOSITO");
    XLSX.utils.book_append_sheet(wb, foglio([["Priorita", "Tipo listino", "Sc1"], [1, "Cliente", 2]]), "PRIORITA_LISTINI");
    const { manifest } = preparaFileListiniGamma(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    expect(manifest.fogli.map((f) => [f.chiave, f.righe, f.lotti])).toEqual([["listini_priorita", 1, 1], ["prezzi_deposito", 1, 1]]);
  });

  test("intestazioni reali senza Id e date come seriale Excel: righe lette, id = numero di riga", () => {
    // 46023 = 01/01/2026, 46387 = 31/12/2026 (seriali Excel, come arrivano dal Web Worker).
    const casi: Array<[string, unknown[][]]> = [
      ["sconti_categoria", [["Macrocategoria", "Categoria", "Sottocategoria", "Listino", "Valido dal", "Valido al", "Sc1", "Sc2", "Sc4", "Sconto importo", "Mag1", "Mag2", "Magg importo"], ["A", "B", "", 10, 46023, 46387, 5, "", "", "", "", "", ""]]],
      ["sconti_cliente_famiglia", [["Cliente", "Da famiglia", "Da sottofamiglia", "Da gruppo", "Da sottogruppo", "A famiglia", "A sottofamiglia", "A gruppo", "A sottogruppo", "Valido dal", "Valido al", "Sc1", "Sc2", "Sc3", "Sc4", "Sc5", "Sc6"], [123, "F", "", "", "", "F", "", "", "", 46023, 46387, 10, "", "", "", "", ""]]],
      ["listino_piu_articoli", [["Codice listino", "Codice", "Valido dal", "Valido al", "Prezzo", "Sc1"], ["LPA", "ART1", 46023, 46387, 9.5, ""]]],
      ["prezzi_cliente_articolo", [["Cliente", "Codice", "Valido dal", "Valido al", "Prezzo", "Sc1", "Sc2", "Sc3", "Sc4", "Sc5", "Sc6", "Sconto importo", "Mag1"], [123, "ART1", 46023, 46387, 4, "", "", "", "", "", "", "", ""]]],
      ["prezzi_deposito", [["Codice", "Listino", "Deposito", "Valido dal", "Prezzo", "Sc1", "Sc2", "Sc3", "Mag1", "Prezzo netto"], ["ART1", 10, "01", 46023, 3, "", "", "", "", 2.5]]],
    ];
    for (const [k, aoa] of casi) {
      const r = parseRegolaPrezzoSheet(def(k), foglio(aoa));
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]).toMatchObject({ id: 2, valido_dal: "2026-01-01" });
      if (k !== "prezzi_deposito") expect(r.rows[0]).toMatchObject({ valido_al: "2026-12-31" });
      expect(r.anomalie).toHaveLength(0);
    }
  });

  test("date anche come oggetto Date", () => {
    const r = parseRegolaPrezzoSheet(def("listino_piu_articoli"), foglio([["Codice listino", "Codice", "Valido dal", "Prezzo"], ["L", "A", new Date(2026, 2, 15), 1]]));
    expect(r.rows[0]).toMatchObject({ valido_dal: "2026-03-15" });
  });

  test("foglio con righe ma intestazione non riconosciuta: anomalia, mai scarto silenzioso", () => {
    const r = parseRegolaPrezzoSheet(def("prezzi_deposito"), foglio([["Articolo", "Prezzo"], ["A1", 3]]));
    expect(r.rows).toHaveLength(0);
    expect(r.anomalie).toHaveLength(1);
  });

  test("CLIENTI_LISTINO da 12.965 righe: lotti da al massimo 5000", () => {
    const wb = XLSX.utils.book_new();
    const aoa: unknown[][] = [["Cliente", "Listino"]];
    for (let i = 1; i <= 12965; i++) aoa.push([i, 10]);
    XLSX.utils.book_append_sheet(wb, foglio(aoa), "CLIENTI_LISTINO");
    const { manifest } = preparaFileListiniGamma(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    expect(manifest.fogli[0]).toMatchObject({ chiave: "clienti_condizioni", righe: 12965, lotti: 3, lotto: 5000 });
  });
});
