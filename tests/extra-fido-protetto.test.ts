import { describe, expect, it } from "vitest";
import { fidoPropostoPerRichiesta, riferimentoConExtraProtetto } from "@/lib/fido-teorico";

const prot = { richiesta_id: "r", importo_approvato: 10000, fido_teorico_riferimento: 1000, approvata_il: "2026-10-31T10:00:00Z", protetto_fino_al: "2026-11-30" };

describe("extra fido teorico protetto", () => {
  it("ANTARES: fido 10.000, teorico 1.000, extra approvato → riferimento 10.000 (rinnovo)", () => {
    const base = fidoPropostoPerRichiesta(10000, 1000, 0, 0.8);
    expect(base).toBe(1000);
    expect(riferimentoConExtraProtetto(base, prot)).toBe(10000);
  });
  it("senza protezione il riferimento resta invariato", () => {
    expect(riferimentoConExtraProtetto(1000, undefined)).toBe(1000);
  });
  it("un riferimento già più alto non viene abbassato", () => {
    expect(riferimentoConExtraProtetto(15000, prot)).toBe(15000);
  });
});
