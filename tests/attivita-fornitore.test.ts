import { describe, it, expect } from "vitest";
import { creaAttivitaFornitoreInput, elencoAttivitaFornitoreInput, tipoAttivita } from "@/lib/attivita-fornitore";
const id = "00000000-0000-4000-8000-000000000001";
describe("attività fornitore", () => {
  it("accetta solo i sei tipi previsti", () => {
    expect(creaAttivitaFornitoreInput.safeParse({ fornitoreId: id, tipo: "telefonata", dataAttivita: "2026-11-12T10:00:00.000Z" }).success).toBe(true);
    expect(creaAttivitaFornitoreInput.safeParse({ fornitoreId: id, tipo: "sollecito", dataAttivita: "2026-11-12T10:00:00.000Z" }).success).toBe(false);
  });
  it("svuota i testi vuoti e richiede una data valida", () => {
    expect(creaAttivitaFornitoreInput.parse({ fornitoreId: id, tipo: "nota", dataAttivita: "2026-11-12T10:00:00Z", oggetto: "  " }).oggetto).toBeNull();
    expect(creaAttivitaFornitoreInput.safeParse({ fornitoreId: id, tipo: "nota", dataAttivita: "ieri" }).success).toBe(false);
  });
  it("carica al massimo 50 attività per volta", () => {
    expect(elencoAttivitaFornitoreInput.parse({ fornitoreId: id }).limite).toBe(50);
    expect(elencoAttivitaFornitoreInput.safeParse({ fornitoreId: id, limite: 51 }).success).toBe(false);
  });
  it("tipo sconosciuto mostrato come Altro", () => { expect(tipoAttivita("x").label).toBe("Altro"); });
});
