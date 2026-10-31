import { describe, it, expect } from "bun:test";
import { gruppoRevisione, lasciatoCosiValido, type InputGruppoRevisione } from "@/lib/revisione-fidi";
import { percheAlert } from "@/lib/alert-fidi";

const lasciato = { fido_gamma: 10000, valido_fino: "2026-11-30" };
const base: InputGruppoRevisione = {
  richiestaAttiva: false, alertConfermato: false, alertAperto: true, regola: "calcolo",
  fidoGamma: 10000, riferimento: 10000, segnalazioni: [], extraProtettoValido: false,
};
const gruppo = (stato: { fidoGamma: number; regola: string; oggi: string }) =>
  gruppoRevisione({ ...base, fidoGamma: stato.fidoGamma, regola: stato.regola,
    lasciatoCosiValido: lasciatoCosiValido(lasciato, stato) });

describe("lasciatoCosiValido", () => {
  it("valido entro la data → lasciato_cosi", () =>
    expect(gruppo({ fidoGamma: 10000, regola: "calcolo", oggi: "2026-11-30" })).toBe("lasciato_cosi"));
  it("oltre la data → torna da decidere", () =>
    expect(gruppo({ fidoGamma: 10000, regola: "calcolo", oggi: "2026-12-01" })).toBe("da_decidere"));
  it("fido Gamma cambiato → torna nel suo gruppo", () =>
    expect(gruppo({ fidoGamma: 12000, regola: "calcolo", oggi: "2026-11-15" })).toBe("pronta"));
  it("scaduto non incassato → da_incassare", () =>
    expect(gruppo({ fidoGamma: 10000, regola: "scaduto_non_incassato", oggi: "2026-11-15" })).toBe("da_incassare"));
  it("nessuna decisione → non valido", () =>
    expect(lasciatoCosiValido(null, { fidoGamma: 10000, regola: "calcolo", oggi: "2026-11-15" })).toBe(false));
});

describe("percheAlert", () => {
  const a = { tipo: "consumo" as const, fido_gamma: 25000, esposizione: 20000, ordini_aperti: 2210.97, consumo: 0.8884388, fido_proposto: null };
  it("consumo: percentuale e importi", () =>
    expect(percheAlert(a)).toBe("Ha usato l'89% del fido: 22.210,97 € su 25.000,00 €"));
  it("consumo al 92%", () =>
    expect(percheAlert({ ...a, consumo: 0.92 })).toBe("Ha usato il 92% del fido: 22.210,97 € su 25.000,00 €"));
  it("scaduto prevale", () =>
    expect(percheAlert(a, { segnalazioni: ["scaduto_da_incassare"], scaduto_oltre: 1500, scaduto_oltre_giorni: 15 }))
      .toBe("Scaduto non pagato da oltre 15 giorni: 1.500,00 €"));
});
