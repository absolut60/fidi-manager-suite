import { describe, it, expect } from "bun:test";
import { gruppoRevisione, riepilogoRevisione, daRivedereRevisione, type InputGruppoRevisione } from "@/lib/revisione-fidi";

const base: InputGruppoRevisione = {
  richiestaAttiva: false, alertConfermato: false, alertAperto: false, regola: "calcolo",
  fidoGamma: 10000, riferimento: 10000, segnalazioni: [], extraProtettoValido: false,
};
const g = (o: Partial<InputGruppoRevisione>) => gruppoRevisione({ ...base, ...o });

describe("gruppoRevisione", () => {
  it("in_corso con richiesta attiva", () => expect(g({ richiestaAttiva: true })).toBe("in_corso"));
  it("lasciato_cosi con alert confermato", () => expect(g({ alertConfermato: true, alertAperto: true })).toBe("lasciato_cosi"));
  it("da_incassare con scaduto non incassato", () => expect(g({ regola: "scaduto_non_incassato", riferimento: 0 })).toBe("da_incassare"));
  it("nuovo con fido Gamma 0 e riferimento > 0", () => expect(g({ fidoGamma: 0, riferimento: 3000 })).toBe("nuovo"));
  it("da_decidere con alert aperto", () => expect(g({ alertAperto: true })).toBe("da_decidere"));
  it("da_decidere con anomalia arancione", () => expect(g({ segnalazioni: ["impegni_sopra_base"], riferimento: 15000 })).toBe("da_decidere"));
  it("pronta con aumento senza anomalie", () => expect(g({ riferimento: 15000 })).toBe("pronta"));
  it("pronta con diminuzione senza anomalie", () => expect(g({ riferimento: 5000 })).toBe("pronta"));
  it("ok quando riferimento = Gamma", () => expect(g({})).toBe("ok"));
  it("ok con segnalazione solo informativa", () => expect(g({ segnalazioni: ["uso_pieno"] })).toBe("ok"));
  it("ok se non proponibile", () => expect(g({ riferimento: null })).toBe("ok"));

  it("alert aperto, proposta più alta del Gamma e nessuna anomalia → pronta", () =>
    expect(g({ alertAperto: true, riferimento: 15000 })).toBe("pronta"));
  it("alert aperto con proposta uguale al Gamma → da_decidere", () =>
    expect(g({ alertAperto: true, riferimento: 10000 })).toBe("da_decidere"));
  it("anomalia con proposta più alta del Gamma → da_decidere", () =>
    expect(g({ alertAperto: true, segnalazioni: ["oltre_tetto"], riferimento: 15000 })).toBe("da_decidere"));

  it("richiesta attiva batte scaduto", () => expect(g({ richiestaAttiva: true, regola: "scaduto_non_incassato" })).toBe("in_corso"));
  it("extra protetto uguale al Gamma → ok anche con alert", () =>
    expect(g({ extraProtettoValido: true, alertAperto: true, segnalazioni: ["oltre_tetto"] })).toBe("ok"));
  it("scaduto con alert aperto → da_incassare", () =>
    expect(g({ regola: "scaduto_non_incassato", alertAperto: true, riferimento: 0 })).toBe("da_incassare"));
});

describe("riepilogoRevisione", () => {
  it("conta e somma per gruppo", () => {
    const r = riepilogoRevisione([
      { gruppo: "pronta", fidoGamma: 10000, riferimento: 15000 },
      { gruppo: "pronta", fidoGamma: 5000, riferimento: 3000 },
      { gruppo: "da_incassare", fidoGamma: 2000, riferimento: 0 },
      { gruppo: "ok", fidoGamma: 1000, riferimento: 1000 },
    ]);
    expect(r.pronta).toEqual({ clienti: 2, fidoGamma: 15000, proposto: 18000 });
    expect(daRivedereRevisione(r)).toBe(3);
  });
});
