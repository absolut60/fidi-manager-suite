import { describe, expect, test } from "bun:test";
import { FILTRI_ARTICOLI, parametriArticoli } from "../src/lib/catalogo-articoli";
describe("catalogo Gamma", () => {
  test("Lombardia 10 e 100 righe predefinite", () => {
    expect(parametriArticoli(FILTRI_ARTICOLI)).toMatchObject({ listino: 10, limite: 100, offset: 0 });
  });
  test("seconda pagina a 100 righe, listini Gamma soltanto", () => {
    expect(parametriArticoli({ ...FILTRI_ARTICOLI, page: 2, listino: 20 })).toMatchObject({ offset: 100, listino: 20 });
    expect(parametriArticoli({ ...FILTRI_ARTICOLI, listino: 999 }).listino).toBe(10);
  });
  test("filtri multipli e disponibilità trasmessi senza restringere gli stati", () => {
    expect(parametriArticoli({ ...FILTRI_ARTICOLI, famiglie: ["CA"], stati: ["in_esaurimento", "solo_preventivatore"], soloDisponibili: true })).toMatchObject({ famiglie: ["CA"], stati: ["in_esaurimento", "solo_preventivatore"], solo_disponibili: true });
  });
});