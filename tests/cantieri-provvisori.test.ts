import { describe, expect, test } from "bun:test";
import { contaCantieriMarketing, passaFiltroProvvisorio, provvisorioInizialeCantiere, nomeInizialeCantiere } from "../src/lib/cantieri-provvisori";

const righe = [{ provvisorio: true, attivo: true }, { provvisorio: false, attivo: true }, { provvisorio: null, attivo: false }];
describe("FM65 B3 cantieri provvisori", () => {
  test("Nome iniziale dal picker solo in creazione", () => {
    expect(nomeInizialeCantiere(null, "Cantiere Empoli")).toBe("Cantiere Empoli");
    expect(nomeInizialeCantiere(undefined)).toBe("");
  });
  test("Nome esistente prevale sul nome iniziale", () => {
    expect(nomeInizialeCantiere({ nome: "Esistente" }, "Cantiere Empoli")).toBe("Esistente");
  });
  test("FM68 C: creazione ordinaria mantiene lo switch spento", () => {
    expect(provvisorioInizialeCantiere(undefined)).toBe(false);
  });
  test("FM68 C: creazione provvisoria parte con lo switch acceso", () => {
    expect(provvisorioInizialeCantiere(null, true)).toBe(true);
  });
  test("FM68 C: modifica conserva il valore salvato e ignora l'opzione iniziale", () => {
    expect(provvisorioInizialeCantiere({ provvisorio: false }, true)).toBe(false);
    expect(provvisorioInizialeCantiere({ provvisorio: true }, false)).toBe(true);
  });
  test("filtro Tutti / Solo provvisori / Solo confermati", () => {
    expect(righe.filter((c) => passaFiltroProvvisorio(c, "tutti")).length).toBe(3);
    expect(righe.filter((c) => passaFiltroProvvisorio(c, "provvisori")).length).toBe(1);
    expect(righe.filter((c) => passaFiltroProvvisorio(c, "confermati")).length).toBe(2);
  });
  test("profilo marketing esclude i provvisori", () => {
    expect(contaCantieriMarketing(righe)).toEqual({ totali: 2, attivi: 1, chiusi: 1 });
    expect(contaCantieriMarketing([{ provvisorio: true, attivo: true }])).toEqual({ totali: 0, attivi: 0, chiusi: 0 });
  });
});
