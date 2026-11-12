import { describe, expect, test } from "bun:test";
import { ORDINE_LISTINI_ARTICOLO, patchTecniciArticolo } from "../src/lib/scheda-articolo";

describe("scheda articolo — confine dati tecnici", () => {
  test("salva soltanto gli otto campi Sistema MADE, mai Gamma o prezzi", () => {
    const input = { categoria: "Parete", tipologia: "Lastra", componente: "Gesso", qta_cliente: 2, qta_fornitore: 3, peso_unit: 4, note_acquisto: "Ordine", note: "Posa", descrizione: "Non scrivere", cod_gamma: "AKINAF01007", stato: "potenziale" };
    expect(patchTecniciArticolo(input)).toEqual({ categoria: "Parete", tipologia: "Lastra", componente: "Gesso", qta_cliente: 2, qta_fornitore: 3, peso_unit: 4, note_acquisto: "Ordine", note: "Posa" });
  });
  test("campi vuoti restano null e quantità zero resta zero", () => {
    expect(patchTecniciArticolo({ qta_cliente: 0 })).toEqual({ categoria: null, tipologia: null, componente: null, qta_cliente: 0, qta_fornitore: null, peso_unit: null, note_acquisto: null, note: null });
  });
  test("ordine sedi Gamma: 10, 20, 30, 9", () => {
    expect([...ORDINE_LISTINI_ARTICOLO]).toEqual([10, 20, 30, 9]);
  });
});