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

describe("Dashboard fidi e Richieste fido: stessa regola dell'area Fidi", () => {
  const menu = readFileSync("src/components/app-shell.tsx", "utf8");
  test("menu: le tre voci Fidi usano permessoAreaFidi", () => {
    for (const to of ["/fidi-dashboard", "/richieste", "/alert-fidi"]) {
      const riga = menu.split("\n").find((l) => l.includes(`to: "${to}",`))!;
      expect(riga).toContain("permessoAreaFidi: true");
    }
  });
  test("pagine protette da AccessoAreaFidi", () => {
    for (const f of ["src/routes/_app/fidi-dashboard.tsx", "src/routes/_app/richieste.tsx"]) {
      expect(readFileSync(f, "utf8")).toContain("<AccessoAreaFidi");
    }
    expect(readFileSync("src/components/accesso-area-fidi.tsx", "utf8")).toContain("puoVedereAreaFidi(");
  });
  test("solo marketing e richiedente+preventivi perdono l'accesso; store manager, agente, approvatore, amministratore no", () => {
    expect(puoVedereAreaFidi(["marketing"])).toBe(false);
    expect(puoVedereAreaFidi(["richiedente", "preventivi_write"])).toBe(false);
    for (const r of ["store_manager", "agente", "approvatore_liv1", "amministratore"]) expect(puoVedereAreaFidi([r])).toBe(true);
  });
  test("la creazione dalla scheda cliente non dipende dalla regola dell'area", () => {
    const scheda = readFileSync("src/components/cliente-storico-fido-tab.tsx", "utf8");
    expect(scheda).toContain("Nuova richiesta fido");
    expect(scheda).not.toContain("puoVedereAreaFidi");
  });
});
