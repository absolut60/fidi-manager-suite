import { describe, expect, test } from "bun:test";
import { luogoAttivita, sedeInizialeAttivita, storeIdAttivita } from "../src/lib/attivita-commerciale";

describe("Ambito e sede attività commerciale", () => {
  test("modifica dal calendario conserva store_id anche con contesto vuoto", () => {
    expect(storeIdAttivita({ attivita: { store_id: "sede-originale", sede_riferimento_id: "sede-operativa" }, contestoStoreId: null })).toBe("sede-originale");
  });
  test("modifica conserva anche store_id null", () => {
    expect(storeIdAttivita({ attivita: { store_id: null, sede_riferimento_id: null }, contestoStoreId: "altra-sede" })).toBeNull();
  });
  test("creazione mantiene ambito del soggetto scelto dal calendario", () => {
    expect(storeIdAttivita({ soggettoScelto: true, soggettoStoreId: "sede-lead", contestoStoreId: "sede-contesto" })).toBe("sede-lead");
  });
  test("creazione senza selettore mantiene ambito del contesto", () => {
    expect(storeIdAttivita({ contestoStoreId: "sede-cliente" })).toBe("sede-cliente");
  });
  test("sede iniziale del soggetto calendario", () => {
    expect(sedeInizialeAttivita({ soggettoScelto: true, soggettoStoreId: "sede-lead" })).toBe("sede-lead");
  });
  test("sede iniziale dal contesto", () => {
    expect(sedeInizialeAttivita({ contestoStoreId: "sede-cliente" })).toBe("sede-cliente");
  });
  test("modifica mostra sede salvata distinta dall'ambito", () => {
    expect(sedeInizialeAttivita({ attivita: { store_id: "sede-visibilita", sede_riferimento_id: "sede-salvata" }, contestoStoreId: "altra-sede" })).toBe("sede-salvata");
  });
  test("scelta manuale prevale su metadati tardivi", () => {
    expect(sedeInizialeAttivita({ sceltaManuale: "sede-manuale", soggettoScelto: true, soggettoStoreId: "sede-tardiva" })).toBe("sede-manuale");
  });
  test("Nessuna manuale prevale su metadati tardivi", () => {
    expect(sedeInizialeAttivita({ sceltaManuale: null, soggettoScelto: true, soggettoStoreId: "sede-tardiva" })).toBeNull();
  });
});

describe("Luogo attività", () => {
  test("via, CAP città (PROV) e sede; ignora luogo storico se presente indirizzo", () => {
    expect(luogoAttivita({ indirizzo: "Via Roma 45", cap: "50053", citta: "Empoli", provincia: "fi", luogo: "Vecchio luogo", sede_riferimento: { nome: "Empoli" } })).toBe("Via Roma 45, 50053 Empoli (FI) · Sede di riferimento: Empoli");
  });
  test("fallback luogo storico senza indirizzo", () => {
    expect(luogoAttivita({ indirizzo: "  ", luogo: "Magazzino storico", sede_riferimento: { nome: "Cambiago" } })).toBe("Magazzino storico · Sede di riferimento: Cambiago");
  });
  test("campi mancanti non producono separatori vuoti", () => {
    expect(luogoAttivita({ indirizzo: "Via Roma 45" })).toBe("Via Roma 45");
    expect(luogoAttivita({})).toBe("");
  });
});