import { describe, expect, test, spyOn } from "bun:test";
import { classificaEsitoEliminazione, eliminaConEsito } from "../src/lib/esito-eliminazione";
import { supabase } from "../src/integrations/supabase/client";

describe("Esito eliminazione", () => {
  test("eliminato solo con conteggio richiesto", () => {
    expect(classificaEsitoEliminazione(null, 1)).toEqual({ tipo: "eliminato" });
  });
  test("23503 indica un collegamento anche se ci sono righe", () => {
    expect(classificaEsitoEliminazione({ code: "23503", message: "foreign key" }, 1)).toEqual({ tipo: "collegato" });
  });
  test("zero righe o 42501 indicano permessi insufficienti", () => {
    expect(classificaEsitoEliminazione(null, 0)).toEqual({ tipo: "permessi" });
    expect(classificaEsitoEliminazione(null, null)).toEqual({ tipo: "permessi" });
    expect(classificaEsitoEliminazione({ code: "42501", message: "denied" }, null)).toEqual({ tipo: "permessi" });
  });
  test("gli altri errori conservano il messaggio", () => {
    expect(classificaEsitoEliminazione({ code: "57014", message: "Tempo scaduto" }, null)).toEqual({ tipo: "errore", messaggio: "Tempo scaduto" });
  });
});

test("DELETE multiplo richiede conteggio esatto, deduplica id e non restituisce righe", async () => {
  const richieste: unknown[] = [];
  const query = { in: (campo: string, ids: string[]) => { richieste.push([campo, ids]); return Promise.resolve({ error: null, count: 2 }); } };
  const spy = spyOn(supabase, "from").mockImplementation((() => ({ delete: (opzioni: unknown) => { richieste.push(opzioni); return query; } })) as typeof supabase.from);
  try {
    expect(await eliminaConEsito("opportunita", ["a", "b", "b"])).toEqual({ tipo: "eliminato" });
    expect(richieste).toEqual([{ count: "exact" }, ["id", ["a", "b"]]]);
    expect(await eliminaConEsito("preventivi", [])).toEqual({ tipo: "permessi" });
    expect(spy).toHaveBeenCalledTimes(1);
  } finally { spy.mockRestore(); }
});
 test("multipli: solo tutti gli id danno successo", () => {
  expect(classificaEsitoEliminazione(null, 3, 3)).toEqual({ tipo: "eliminato" });
  expect(classificaEsitoEliminazione(null, 2, 3)).toEqual({ tipo: "parziale", eliminati: 2, richiesti: 3 });
  expect(classificaEsitoEliminazione(null, 0, 3)).toEqual({ tipo: "permessi" });
  expect(classificaEsitoEliminazione(null, null, 3)).toEqual({ tipo: "permessi" });
  expect(classificaEsitoEliminazione(null, 0, 0)).toEqual({ tipo: "permessi" });
});
