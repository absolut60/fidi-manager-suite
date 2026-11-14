import { describe, expect, test } from "bun:test";
import { campiRiferimentoPreventivo, testoRiferimentoPreventivo } from "../src/lib/condizioni-riferimento";

const valori = { listino_rif: 30, macrocategoria_rif: "01", categoria_rif: "01" };
describe("FM71 Testata riferimento", () => {
  test("salvataggio comprende tutti i tre campi", () => {
    expect(campiRiferimentoPreventivo(true, valori)).toEqual({ listino_rif: 30, macrocategoria_rif: "01", categoria_rif: "01" });
  });
  test("spegnere azzera tutti i tre campi", () => {
    expect(campiRiferimentoPreventivo(false, valori)).toEqual({ listino_rif: null, macrocategoria_rif: null, categoria_rif: null });
  });
  test("listino obbligatorio", () => { expect(campiRiferimentoPreventivo(true, { ...valori, listino_rif: null })).toBeNull(); });
  test("macrocategoria obbligatoria", () => { expect(campiRiferimentoPreventivo(true, { ...valori, macrocategoria_rif: null })).toBeNull(); });
  test("categoria obbligatoria per nuove scritture", () => {
    for (const categoria_rif of [null, "", "  "]) expect(campiRiferimentoPreventivo(true, { ...valori, categoria_rif })).toBeNull();
  });
  test("riferimento storico senza categoria resta leggibile", () => {
    expect(testoRiferimentoPreventivo({ ...valori, categoria_rif: null })).not.toBeNull();
  });
  test("badge assente senza listino", () => { expect(testoRiferimentoPreventivo({ ...valori, listino_rif: null })).toBeNull(); });
  test("badge presente con listino", () => { expect(testoRiferimentoPreventivo(valori)).not.toBeNull(); });
});