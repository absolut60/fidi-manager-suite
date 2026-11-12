import { describe, expect, test } from "bun:test";
import { elencoFornitoriInput, dettaglioFornitoreInput, articoliFornitoreInput, salvaNoteFornitoreInput } from "../src/lib/fornitori";

const id = "00000000-0000-4000-8000-000000000001";
describe("validazione input funzioni fornitore", () => {
  test("elenco: 100 righe, offset zero e manuali esclusi per default", () => {
    expect(elencoFornitoriInput.parse({})).toEqual({ limite: 100, offset: 0, includiManuali: false });
  });
  test("ricerca trim e filtri tri-stato conservati", () => {
    expect(elencoFornitoriInput.parse({ testo: "  MADE  ", ancheCliente: false, conArticoli: null, includiManuali: true }))
      .toMatchObject({ testo: "MADE", ancheCliente: false, conArticoli: null, includiManuali: true });
  });
  test("limiti da 1 a 200, interi, su entrambe le liste", () => {
    for (const limite of [0, 201, 1.5, NaN, Infinity]) {
      expect(elencoFornitoriInput.safeParse({ limite }).success).toBe(false);
      expect(articoliFornitoreInput.safeParse({ fornitoreId: id, limite }).success).toBe(false);
    }
    for (const limite of [1, 200]) {
      expect(elencoFornitoriInput.parse({ limite }).limite).toBe(limite);
      expect(articoliFornitoreInput.parse({ fornitoreId: id, limite }).limite).toBe(limite);
    }
  });
  test("offset non negativo intero", () => {
    for (const offset of [-1, 0.5]) {
      expect(elencoFornitoriInput.safeParse({ offset }).success).toBe(false);
      expect(articoliFornitoreInput.safeParse({ fornitoreId: id, offset }).success).toBe(false);
    }
  });
  test("articoli: 50 righe e tutti i codici fornitore per default", () => {
    expect(articoliFornitoreInput.parse({ fornitoreId: id })).toEqual({ fornitoreId: id, limite: 50, offset: 0, soloPreferenziali: false });
  });
  test("id UUID obbligatorio per dettaglio, articoli e salvataggio", () => {
    expect(dettaglioFornitoreInput.safeParse({ id: "934" }).success).toBe(false);
    expect(articoliFornitoreInput.safeParse({ fornitoreId: "934" }).success).toBe(false);
    expect(salvaNoteFornitoreInput.safeParse({ id: "934", note: "nota" }).success).toBe(false);
    expect(dettaglioFornitoreInput.parse({ id }).id).toBe(id);
  });
  test("note: massimo 4000 caratteri anche Unicode, null e vuoto ammessi", () => {
    for (const note of [null, "", "a".repeat(4000), "😀".repeat(4000)])
      expect(salvaNoteFornitoreInput.parse({ id, note }).note).toBe(note);
    expect(salvaNoteFornitoreInput.safeParse({ id, note: "a".repeat(4001) }).success).toBe(false);
    expect(salvaNoteFornitoreInput.safeParse({ id, note: "😀".repeat(4001) }).success).toBe(false);
  });
});