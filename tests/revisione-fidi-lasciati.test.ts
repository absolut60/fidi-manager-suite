import { describe, it, expect } from "bun:test";
import { lasciatoCosiValido } from "@/lib/revisione-fidi";
import { percheAlert } from "@/lib/alert-fidi";
import { formatEuro } from "@/lib/fidi";

const lasciato = { fido_gamma: 10000, valido_fino: "2026-11-30" };
describe("lasciatoCosiValido", () => {
  it("valido fino al 30/11 incluso", () =>
    expect(lasciatoCosiValido(lasciato, { fidoGamma: 10000, regola: "calcolo", oggi: "2026-11-30" })).toBe(true));
  it("scaduto dal 01/12", () =>
    expect(lasciatoCosiValido(lasciato, { fidoGamma: 10000, regola: "calcolo", oggi: "2026-12-01" })).toBe(false));
  it("fido Gamma cambiato", () =>
    expect(lasciatoCosiValido(lasciato, { fidoGamma: 12000, regola: "calcolo", oggi: "2026-11-15" })).toBe(false));
  it("scaduto non incassato", () =>
    expect(lasciatoCosiValido(lasciato, { fidoGamma: 10000, regola: "scaduto_non_incassato", oggi: "2026-11-15" })).toBe(false));
  it("nessuna decisione", () =>
    expect(lasciatoCosiValido(null, { fidoGamma: 10000, regola: "calcolo", oggi: "2026-11-15" })).toBe(false));
});

describe("percheAlert", () => {
  const a = { tipo: "consumo" as const, fido_gamma: 25000, esposizione: 20000, ordini_aperti: 2210.97, consumo: 0.8884388, fido_proposto: null };
  it("consumo: percentuale sul solo debito (ordini esclusi)", () =>
    expect(percheAlert(a)).toBe("Ci deve l'80% del fido."));
  it("consumo al 92%", () =>
    expect(percheAlert({ ...a, esposizione: 23000 })).toBe("Ci deve il 92% del fido."));
  it("scaduto prevale", () =>
    expect(percheAlert(a, { segnalazioni: ["scaduto_da_incassare"], scaduto_oltre: 1500, scaduto_oltre_giorni: 15 }))
      .toBe(`Scaduto non pagato da oltre 15 giorni: ${formatEuro(1500)}.`));
});
