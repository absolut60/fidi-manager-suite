import { describe, expect, test } from "bun:test";
import { errorePermessoGiacenze, fontePrezzoTesto, giacenzeRiepilogoArticolo, scontiAcquistoTesto, trasportoAcquistoTesto } from "../src/lib/riepilogo-articolo";
import type { RigaDisponibilitaArticolo } from "../src/lib/scheda-articolo";

const stock = (store_id: string, nome: string, livello = "sede", conta_disponibilita = "si"): RigaDisponibilitaArticolo => ({ store_id, nome, livello, conta_disponibilita, deposito_codice: "", giacenza: 1234.5, disponibilita: 12.3, impegnato_clienti: 0, ordinato_fornitori: 0 });

test("sede cliente prima, altre sedi per nome, logistica ultima senza cambiare quantità", () => {
  const rows = [stock("b", "Zeta"), stock("l", "Logistica", "logistica_comune", "logistica_comune"), stock("a", "Alfa"), stock("c", "Cliente")];
  const ordered = giacenzeRiepilogoArticolo(rows, "c");
  expect(ordered.map(r => r.store_id)).toEqual(["c", "a", "b", "l"]);
  expect(ordered[0].giacenza).toBe(1234.5);
  expect(ordered[0].disponibilita).toBe(12.3);
  expect(rows[0].store_id).toBe("b");
});
test("esclusi depositi e righe non conteggiate, nessuna duplicazione aggregati", () => {
  expect(giacenzeRiepilogoArticolo([stock("a", "Alfa"), stock("a", "Deposito", "deposito"), stock("n", "Escluso", "sede", "no")], null).map(r => r.store_id)).toEqual(["a"]);
});
test("assenza sede cliente: ordine alfabetico e valori null preservati", () => {
  const vuota = { ...stock("a", "Alfa"), giacenza: null, disponibilita: null } as unknown as RigaDisponibilitaArticolo;
  const ordered = giacenzeRiepilogoArticolo([stock("z", "Zeta"), vuota], "assente");
  expect(ordered.map(r => r.store_id)).toEqual(["a", "z"]);
  expect(ordered[0].giacenza).toBeNull();
  expect(ordered[0].disponibilita).toBeNull();
});
test("errore di permesso riconosciuto anche dopo serializzazione del lettore esistente", () => {
  expect(errorePermessoGiacenze({ code: "42501" })).toBe(true);
  expect(errorePermessoGiacenze(new Error("Accesso negato"))).toBe(true);
  expect(errorePermessoGiacenze(new Error("permission denied for function disponibilita_articolo"))).toBe(true);
  expect(errorePermessoGiacenze(new Error("Network error"))).toBe(false);
});

describe("riepilogo articolo", () => {
  test("sconti acquisto in forma Gamma", () => {
    expect(scontiAcquistoTesto({ acq_sc1: 17, acq_sc2: 5, acq_sc3: 0 })).toBe("17+5");
    expect(scontiAcquistoTesto({ acq_sc1: 12.5, acq_sc2: null, acq_sc3: 3 })).toBe("12,5+3");
    expect(scontiAcquistoTesto({ acq_sc1: 0, acq_sc2: 0, acq_sc3: 0 })).toBe("—");
    expect(scontiAcquistoTesto(null)).toBe("—");
  });
  test("trasporto percentuale e/o euro", () => {
    expect(trasportoAcquistoTesto({ acq_trasporto_perc: 3, acq_trasporto_euro: 0 })).toBe("3%");
    expect(trasportoAcquistoTesto({ acq_trasporto_perc: 2, acq_trasporto_euro: 0.5 })).toBe("2% + 0,5000 €");
    expect(trasportoAcquistoTesto({ acq_trasporto_perc: 0, acq_trasporto_euro: 0 })).toBe("—");
  });
  test("fonte prezzo leggibile", () => {
    expect(fontePrezzoTesto("deposito")).toBe("Prezzo del deposito della sede del cliente");
    expect(fontePrezzoTesto("cliente_articolo")).toBe("Prezzo speciale del cliente per questo articolo");
    expect(fontePrezzoTesto(null, ["cliente_senza_listino"])).toBe("Il cliente non ha un listino in Gamma");
    expect(fontePrezzoTesto(null)).toBe("Prezzo non disponibile per questo cliente");
  });
});
