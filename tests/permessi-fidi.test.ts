import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { puoVedereAreaFidi, puoProporreDaAlertFidi } from "../src/lib/permessi-fidi";

describe("Alert fidi: visibilità e azioni per ruolo", () => {
  test("store_manager vede e propone", () => {
    expect(puoVedereAreaFidi(["store_manager"])).toBe(true);
    expect(puoProporreDaAlertFidi(["store_manager"])).toBe(true);
  });
  test("agente vede in sola lettura", () => {
    expect(puoVedereAreaFidi(["agente"])).toBe(true);
    expect(puoProporreDaAlertFidi(["agente"])).toBe(false);
  });
  test("approvatore vede in sola lettura", () => {
    expect(puoVedereAreaFidi(["approvatore_liv2"])).toBe(true);
    expect(puoProporreDaAlertFidi(["approvatore_liv2"])).toBe(false);
  });
  test("amministratore vede e propone", () => {
    expect(puoVedereAreaFidi(["amministratore"])).toBe(true);
    expect(puoProporreDaAlertFidi(["amministratore"])).toBe(true);
  });
  test("marketing non vede", () => {
    expect(puoVedereAreaFidi(["marketing"])).toBe(false);
    expect(puoProporreDaAlertFidi(["marketing"])).toBe(false);
  });
  test("ruoli fuori lista non vedono, con un ruolo in lista sì", () => {
    expect(puoVedereAreaFidi(["richiedente", "preventivi_manage", "tesoreria", "recupero_crediti"])).toBe(false);
    expect(puoVedereAreaFidi(["marketing", "agente"])).toBe(true);
  });
  test("pagina e menu usano la regola unica, senza lista anteprima", () => {
    const pagina = readFileSync("src/routes/_app/alert-fidi.tsx", "utf8");
    const menu = readFileSync("src/components/app-shell.tsx", "utf8");
    expect(pagina).toContain("puoVedereAreaFidi(");
    expect(pagina).toContain("puoProporreDaAlertFidi(");
    expect(pagina).not.toContain("fetchUtentiAnteprimaFidoNuovo");
    expect(menu).toContain("puoVedereAreaFidi(");
    expect(menu).not.toContain("fetchUtentiAnteprimaFidoNuovo");
  });
});
