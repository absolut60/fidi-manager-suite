import { describe, expect, test } from "bun:test";
import { classificaEsitoEliminazione } from "../src/lib/esito-eliminazione";

describe("Esito eliminazione", () => {
  test("eliminato solo con almeno una riga restituita", () => {
    expect(classificaEsitoEliminazione(null, [{ id: "cantiere" }])).toEqual({ tipo: "eliminato" });
  });
  test("23503 indica un collegamento anche se ci sono righe", () => {
    expect(classificaEsitoEliminazione({ code: "23503", message: "foreign key" }, [{ id: "cantiere" }])).toEqual({ tipo: "collegato" });
  });
  test("zero righe o 42501 indicano permessi insufficienti", () => {
    expect(classificaEsitoEliminazione(null, [])).toEqual({ tipo: "permessi" });
    expect(classificaEsitoEliminazione(null, null)).toEqual({ tipo: "permessi" });
    expect(classificaEsitoEliminazione({ code: "42501", message: "denied" }, null)).toEqual({ tipo: "permessi" });
  });
  test("gli altri errori conservano il messaggio", () => {
    expect(classificaEsitoEliminazione({ code: "57014", message: "Tempo scaduto" }, null)).toEqual({ tipo: "errore", messaggio: "Tempo scaduto" });
  });
});