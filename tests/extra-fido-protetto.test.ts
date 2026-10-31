import { describe, expect, it } from "vitest";
import { fidoPropostoPerRichiesta, notaExtraProtetto, riferimentoConExtraProtetto, riferimentoRichiesta } from "@/lib/fido-teorico";

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
  it("A.N. COSTRUZIONI: riferimento 0 con protezione decaduta", () => {
    expect(riferimentoRichiesta(riga, 0.8, { ...prot, protezione_valida: false })).toBe(0);
  });
  it("con regola calcolo restano le protezioni", () => {
    expect(riferimentoRichiesta({ ...riga, regola_applicata: "calcolo" }, 0.8, undefined)).toBe(455000);
  });
});

describe("FM55 3B — protezione con scaduto già noto", () => {
  const riga = { regola_applicata: "scaduto_non_incassato", fido_attuale: 3000, fido_proposto: 0, esposizione_corrente: 2608, ordini_aperti: 0 };
  const acro = { richiesta_id: "a", importo_approvato: 3000, fido_teorico_riferimento: 0, approvata_il: "2026-10-31T16:22:48Z", protetto_fino_al: "2026-11-30", scaduto_al_momento: null, scaduto_attuale: 958.65, protezione_valida: true };
  it("ACROBATICA: protezione valida → riferimento 3.000 (rinnovo)", () => {
    expect(riferimentoRichiesta(riga, 0.8, acro)).toBe(3000);
  });
  it("protezione decaduta → riferimento torna 0", () => {
    expect(riferimentoRichiesta(riga, 0.8, { ...acro, scaduto_al_momento: 900, scaduto_attuale: 1500, protezione_valida: false })).toBe(0);
  });
  it("nota: extra protetto", () => {
    const n = notaExtraProtetto({ ...prot, scaduto_attuale: 0 });
    expect(n.decaduta).toBe(false);
    expect(n.testo).toContain("Extra approvato il 31/10");
    expect(n.testo).toContain("protetto fino al 30/11");
    expect(n.testo).toMatch(/\+9\.000/);
  });
  it("nota: scaduto già noto", () => {
    const n = notaExtraProtetto(acro);
    expect(n.decaduta).toBe(false);
    expect(n.testo).toContain("con scaduto già noto di");
    expect(n.testo).toContain("958,65");
  });
  it("nota: protezione decaduta", () => {
    const n = notaExtraProtetto({ ...acro, scaduto_al_momento: 900, scaduto_attuale: 1500, protezione_valida: false });
    expect(n.decaduta).toBe(true);
    expect(n.testo).toContain("protezione decaduta");
  });
});
