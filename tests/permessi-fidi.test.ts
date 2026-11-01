import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { puoVedereAlertFidi, puoProporreDaAlertFidi } from "../src/lib/permessi-fidi";

describe("Alert fidi: visibilità e azioni per ruolo", () => {
  test("store_manager vede e propone", () => {
    expect(puoVedereAlertFidi(["store_manager"])).toBe(true);
    expect(puoProporreDaAlertFidi(["store_manager"])).toBe(true);
  });
  test("agente vede in sola lettura", () => {
    expect(puoVedereAlertFidi(["agente"])).toBe(true);
    expect(puoProporreDaAlertFidi(["agente"])).toBe(false);
  });
  test("approvatore vede in sola lettura", () => {
    expect(puoVedereAlertFidi(["approvatore_liv2"])).toBe(true);
    expect(puoProporreDaAlertFidi(["approvatore_liv2"])).toBe(false);
  });
  test("amministratore vede e propone", () => {
    expect(puoVedereAlertFidi(["amministratore"])).toBe(true);
    expect(puoProporreDaAlertFidi(["amministratore"])).toBe(true);
  });
  test("marketing non vede", () => {
    expect(puoVedereAlertFidi(["marketing"])).toBe(false);
    expect(puoProporreDaAlertFidi(["marketing"])).toBe(false);
  });
  test("ruoli fuori lista non vedono, con un ruolo in lista sì", () => {
    expect(puoVedereAlertFidi(["richiedente", "preventivi_manage", "tesoreria", "recupero_crediti"])).toBe(false);
    expect(puoVedereAlertFidi(["marketing", "agente"])).toBe(true);
  });
  test("pagina e menu usano la regola unica, senza lista anteprima", () => {
    const pagina = readFileSync("src/routes/_app/alert-fidi.tsx", "utf8");
    const menu = readFileSync("src/components/app-shell.tsx", "utf8");
    expect(pagina).toContain("puoVedereAlertFidi(");
    expect(pagina).toContain("puoProporreDaAlertFidi(");
    expect(pagina).not.toContain("fetchUtentiAnteprimaFidoNuovo");
    expect(menu).toContain("puoVedereAlertFidi(");
    expect(menu).not.toContain("fetchUtentiAnteprimaFidoNuovo");
  });
});
