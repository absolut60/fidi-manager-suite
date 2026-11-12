import { describe, expect, test } from "bun:test";
import { FILTRI_ARTICOLI, VALORE_LOGISTICA, parametriArticoli, ordinamentoArticoliValido } from "../src/lib/catalogo-articoli";
const CAMBIAGO = "c434096f-3bf0-45ce-ab7e-e631992fe13a";
describe("catalogo Gamma", () => {
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
