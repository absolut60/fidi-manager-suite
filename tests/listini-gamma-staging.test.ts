import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";
import {
  preparaFileListiniGamma,
  parseArticoliGammaSheet,
  fileLottoListini,
  fileExtraListini,
} from "../src/lib/listini-gamma-parser";
import { md5 } from "../src/lib/md5";

function file(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const forn = [["Codice fornitore", "Ragione sociale"], ...Array.from({ length: 3001 }, (_, i) => [i + 1, `F${i + 1}`]), ["", "SENZA CODICE"]];
  const art = [["Codice", "Descrizione", "Codice marca", "Marca"], ...Array.from({ length: 3001 }, (_, i) => [`A${i}`, `Art ${i}`, "KNA", "Knauf"])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(forn), "SYNC_ANAGRAFICA_FORNITORI");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(art), "ARTICOLI");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["x"], [1]]), "GIACENZE");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

describe("staging listini Gamma preparato nel browser (FM61)", () => {
  const { manifest, pacchetti } = preparaFileListiniGamma(file());
  const nomi = pacchetti.map((p) => p.nome);

  test("fogli in ordine fisso, pacchetti da 3000 fornitori e 1000 articoli", () => {
    expect(manifest.fogli.map((f) => [f.chiave, f.righe, f.lotti, f.anomalie])).toEqual([
      ["fornitori", 3001, 2, 1],
      ["articoli", 3001, 4, 0],
    ]);
  });

  test("fogli senza gestore elencati come non gestiti", () => {
    expect(manifest.nonGestiti).toEqual(["GIACENZE"]);
  });

  test("un file per pacchetto più anomalie, codici e meta per foglio", () => {
    for (const k of ["fornitori", "articoli"]) {
      expect(nomi).toContain(fileLottoListini(k, 0));
      expect(nomi).toContain(fileLottoListini(k, 1));
      if (k === "fornitori") expect(nomi).not.toContain(fileLottoListini(k, 2));
      else {
        expect(nomi).toContain(fileLottoListini(k, 3));
        expect(nomi).not.toContain(fileLottoListini(k, 4));
      }
      for (const x of ["anomalie", "codici", "meta"] as const) expect(nomi).toContain(fileExtraListini(k, x));
    }
    const lotto1 = JSON.parse(pacchetti.find((p) => p.nome === fileLottoListini("fornitori", 1))!.json);
    expect(lotto1).toHaveLength(1);
    expect(lotto1[0].codice_gestionale).toBe(3001);
  });

  test("i pacchetti contengono esattamente l'uscita del parser condiviso, senza numero di riga", () => {
    const wb = XLSX.read(file(), { type: "array" });
    const atteso = parseArticoliGammaSheet(wb.Sheets.ARTICOLI).rows.map(({ riga: _r, ...x }) => x);
    const letti = [0, 1, 2, 3].flatMap((i) => {
      const pacchetto = pacchetti.find((p) => p.nome === fileLottoListini("articoli", i));
      if (!pacchetto) throw new Error(`Pacchetto articoli ${i} mancante`);
      return JSON.parse(pacchetto.json);
    });
    expect(letti.map(({ hash_riga: _h, ...x }: Record<string, unknown>) => x)).toEqual(atteso);
    // Impronta = md5 del JSON dei campi importati (stessa riga → stessa impronta).
    expect(letti[0].hash_riga).toBe(md5(JSON.stringify(atteso[0])));
    const meta = JSON.parse(pacchetti.find((p) => p.nome === fileExtraListini("articoli", "meta"))!.json);
    expect(meta.marche).toEqual([{ codice: "KNA", descrizione: "Knauf" }]);
    const codici = JSON.parse(pacchetti.find((p) => p.nome === fileExtraListini("fornitori", "codici"))!.json);
    expect(codici).toHaveLength(3001);
  });
});
