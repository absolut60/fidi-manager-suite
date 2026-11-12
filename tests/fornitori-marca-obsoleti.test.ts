import { describe, expect, test } from "bun:test";
import { elencoFornitoriInput, idsFornitoriInput, impostaMarcaInput, impostaSottocategoriaInput, ordinamentoFornitoriValido } from "../src/lib/fornitori";
import { ricercaFornitori } from "../src/lib/scheda-fornitore";

const uuid = "6e34c4ae-8772-4e21-b446-38a35857ead7";
describe("FM62 marca, sottocategoria, obsoleti", () => {
  test("obsoleti esclusi per default in elenco e selezione", () => {
    expect(elencoFornitoriInput.parse({}).includiObsoleti).toBe(false);
    expect(idsFornitoriInput.parse({}).includiObsoleti).toBe(false);
  });
  test("Tipo fornitore preimpostato su Merci alla prima apertura", () => {
    const parse = (ricercaFornitori as unknown as { parse: (v: unknown) => { tipo: string[] } }).parse;
    expect(parse({}).tipo).toEqual(["merci"]);
    expect(parse({ tipo: [] }).tipo).toEqual([]);
  });
  test("marca e sottocategoria null = togli", () => {
    expect(impostaMarcaInput.parse({ ids: [uuid], marca: null }).marca).toBeNull();
    expect(impostaSottocategoriaInput.parse({ ids: [uuid], codice: null }).codice).toBeNull();
    expect(() => impostaMarcaInput.parse({ ids: [], marca: "X" })).toThrow();
  });
  test("ordinamento per marca ammesso", () => {
    expect(ordinamentoFornitoriValido("marca", "desc")).toEqual({ ordina: "marca", direzione: "desc" });
  });
});
