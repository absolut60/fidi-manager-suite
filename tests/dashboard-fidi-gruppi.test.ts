import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  CATEGORIE_OLTRE, codificaFiltroDashboard, decodificaFiltroDashboard, etichettaChipDashboard,
  normalizzaGruppi, riga, sommaRighe,
} from "../src/lib/dashboard-fidi-gruppi";

const G = normalizzaGruppi([
  { card: "oltre", gruppo: "imprese", n_clienti: 36, importo: 1000 },
  { card: "oltre", gruppo: "privati", n_clienti: 13, importo: 200 },
  { card: "oltre", gruppo: "bloccati", n_clienti: 73, importo: 300 },
  { card: "oltre", gruppo: "legale", n_clienti: 56, importo: 400 },
  { card: "oltre", gruppo: "contanti_pos", n_clienti: 52, importo: 9999 },
]);

describe("Dashboard fidi: righe delle card", () => {
  test("oltre il fido: totale senza contanti/POS", () => {
    expect(sommaRighe(G, "oltre", CATEGORIE_OLTRE)).toEqual({ n_clienti: 178, importo: 1900 });
  });
  test("riga mancante = zero, sempre visibile", () => {
    expect(riga(G, "concesso", "legale").n_clienti).toBe(0);
  });
  test("chip con etichette esatte", () => {
    expect(etichettaChipDashboard("concesso", "legale")).toBe("Dashboard fidi: Fido concesso · In gestione legale");
    expect(etichettaChipDashboard("concesso", "contanti_pos")).toBe("Dashboard fidi: Fido concesso · Contanti / POS");
    expect(etichettaChipDashboard("occhio", "ordini")).toBe("Dashboard fidi: Fidi da tenere d'occhio · Ordini aperti: potenzialmente oltre fido");
  });
  test("filtro della lista: codifica e valori non validi", () => {
    expect(decodificaFiltroDashboard(codificaFiltroDashboard("fermi", "privati"))).toEqual({ card: "fermi", gruppo: "privati" });
    expect(decodificaFiltroDashboard("sconosciuta:imprese")).toBeNull();
    expect(decodificaFiltroDashboard(42)).toBeNull();
  });
  test("la pagina legge solo le due funzioni della fonte unica", () => {
    const pagina = readFileSync("src/components/dashboard-fidi.tsx", "utf8");
    expect(pagina).toContain('rpc("get_dashboard_fidi_gruppi")');
    expect(pagina).not.toContain("get_dashboard_fidi_giro");
    expect(pagina).not.toContain("≤ 500");
    const lista = readFileSync("src/routes/_app/clienti.tsx", "utf8");
    expect(lista).toContain('rpc("get_clienti_dashboard_fidi_ids"');
  });
});
