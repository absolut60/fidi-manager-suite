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
      ["id", "Macrocategoria", "Categoria", "Sottocategoria", "Listino", "Valido dal", "Valido al", "Sc1"],
      [1, "A", "B", "", "", "01/02/2026", "31/12/2026 00:00", 10],
    ]));
    expect(r.rows[0]).toMatchObject({ id: 1, sottocategoria: "", listino: null, valido_dal: "2026-02-01", valido_al: "2026-12-31", sc1: 10 });
    expect(r.anomalie).toHaveLength(0);
  });

  test("i fogli regole sono un pacchetto ciascuno, dopo articoli-fornitori", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, foglio([["id", "Codice", "Listino", "Deposito", "Prezzo"], [1, "A1", 10, "01", 3]]), "PREZZI_DEPOSITO");
    XLSX.utils.book_append_sheet(wb, foglio([["Priorita", "Tipo listino", "Sc1"], [1, "Cliente", 2]]), "PRIORITA_LISTINI");
    const { manifest } = preparaFileListiniGamma(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    expect(manifest.fogli.map((f) => [f.chiave, f.righe, f.lotti])).toEqual([["listini_priorita", 1, 1], ["prezzi_deposito", 1, 1]]);
  });
});
