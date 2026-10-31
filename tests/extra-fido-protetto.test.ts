import { describe, expect, it } from "vitest";
import { fidoPropostoPerRichiesta, riferimentoConExtraProtetto, riferimentoRichiesta } from "@/lib/fido-teorico";

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

describe("scaduto non incassato", () => {
  const riga = { regola_applicata: "scaduto_non_incassato", fido_attuale: 455000, fido_proposto: 0, esposizione_corrente: 290121, ordini_aperti: 162767 };
  it("A.N. COSTRUZIONI: riferimento 0 nonostante impegni e extra protetto", () => {
    expect(riferimentoRichiesta(riga, 0.8, prot)).toBe(0);
  });
  it("con regola calcolo restano le protezioni", () => {
    expect(riferimentoRichiesta({ ...riga, regola_applicata: "calcolo" }, 0.8, undefined)).toBe(455000);
  });
});
