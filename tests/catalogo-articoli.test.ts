import { describe, expect, test } from "bun:test";
import { FILTRI_ARTICOLI, VALORE_LOGISTICA, parametriArticoli, parametriArticoliPreventivo, ordinamentoArticoliValido } from "../src/lib/catalogo-articoli";
const CAMBIAGO = "c434096f-3bf0-45ce-ab7e-e631992fe13a";
describe("catalogo Gamma", () => {
  test("FM70: sede e offset opzionali, nessuna sede implicita", () => {
    expect(parametriArticoliPreventivo("lastra", { sedeGiacenza: CAMBIAGO, offset: 30 })).toMatchObject({ _sede_giacenza: CAMBIAGO, offset: 30, limite: 30 });
    expect(parametriArticoliPreventivo("lastra")).not.toHaveProperty("_sede_giacenza");
    expect(parametriArticoliPreventivo("lastra", { offset: 60 })).not.toHaveProperty("_sede_giacenza");
  });
  test("FM70: preventivo per rilevanza, 30 risultati, testo non normalizzato nel TS", () => {
    expect(parametriArticoliPreventivo("  Lastra 12,5 1200X2000  ")).toMatchObject({
      testo: "Lastra 12,5 1200X2000", _ordina: "rilevanza", limite: 30, offset: 0, solo_gamma: true,
    });
  });
  test("Lombardia 10, codice crescente e 100 righe predefinite", () => {
    expect(parametriArticoli(FILTRI_ARTICOLI)).toMatchObject({ listino: 10, limite: 100, offset: 0, _ordina: "codice", _direzione: "asc" });
  });
  test("listini globali solo 10/20/30: il 9 e valori strani tornano a 10", () => {
    expect(parametriArticoli({ ...FILTRI_ARTICOLI, page: 2, listino: 20 })).toMatchObject({ offset: 100, listino: 20 });
    expect(parametriArticoli({ ...FILTRI_ARTICOLI, listino: 9 }).listino).toBe(10);
    expect(parametriArticoli({ ...FILTRI_ARTICOLI, listino: 999 }).listino).toBe(10);
  });
  test("Disponibile in: sedi e logistica separate", () => {
    expect(parametriArticoli({ ...FILTRI_ARTICOLI, disponibileIn: [CAMBIAGO, VALORE_LOGISTICA] })).toMatchObject({ disponibile_in: [CAMBIAGO], disponibile_logistica: true });
    expect(parametriArticoli({ ...FILTRI_ARTICOLI, disponibileIn: [CAMBIAGO] })).toMatchObject({ disponibile_in: [CAMBIAGO], disponibile_logistica: false });
  });
  test("filtri salvati vecchi ignorati senza errori", () => {
    const vecchi = { ...FILTRI_ARTICOLI, soloDisponibili: true, disponibileIn: undefined } as unknown as typeof FILTRI_ARTICOLI;
    const p = parametriArticoli(vecchi);
    expect(p).toMatchObject({ disponibile_in: [], disponibile_logistica: false });
    expect("solo_disponibili" in p).toBe(false);
  });
  test("ordinamento solo da whitelist", () => {
    expect(ordinamentoArticoliValido("prezzo", "desc")).toEqual({ ordina: "prezzo", direzione: "desc" });
    expect(ordinamentoArticoliValido("codice; drop", "x")).toEqual({ ordina: "codice", direzione: "asc" });
  });
});
