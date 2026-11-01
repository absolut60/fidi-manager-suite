import { describe, expect, it } from "bun:test";
import { CATEGORIE_PROPOSTA_DEFAULT, daValutareProposta, inclusoInizialeProposta, livelloControlloProposta, riepilogoVisibilita, righeVisibiliProposta } from "@/lib/proposta-fido-visibilita";

describe("Selezione iniziale degli azzeramenti bloccati/legali", () => {
  it("bloccato 5.000→0 parte spuntato anche se rosso", () => {
    expect(inclusoInizialeProposta({ proponibile: true, rossa: true, regola: "cliente_bloccato", fidoAttuale: 5000, fidoProposto: 0 })).toBe(true);
    expect(livelloControlloProposta(1, true)).toBe("rossa");
  });
  it("legale 3.000→0 parte spuntato anche se rosso", () => {
    expect(inclusoInizialeProposta({ proponibile: true, rossa: true, regola: "gestione_legale", fidoAttuale: 3000, fidoProposto: 0 })).toBe(true);
  });
  it("scaduto non incassato 10.000→0 resta non spuntato", () => {
    expect(inclusoInizialeProposta({ proponibile: true, rossa: true, regola: "scaduto_non_incassato", fidoAttuale: 10000, fidoProposto: 0 })).toBe(false);
  });
  it("bloccato 0→0 è nascosto con default e non conta nei da guardare anche con alert", () => {
    const r = { cliente_id: "zero", tipo: "rinnovo", regola: "cliente_bloccato", fido_attuale: 0,
      fido_proposto: 0, proponibile: true, segnalazioni: ["bloccato"], alertAperto: true };
    const filtri = { tipi: CATEGORIE_PROPOSTA_DEFAULT };
    expect(daValutareProposta(r)).toBe(false);
    expect(righeVisibiliProposta([r], filtri, new Set())).toEqual([]);
    expect(riepilogoVisibilita([r], filtri, new Set()).daDecidere).toBe(0);
  });
  it("l'eccezione non seleziona righe non proponibili", () => {
    expect(inclusoInizialeProposta({ proponibile: false, rossa: true, regola: "cliente_bloccato", fidoAttuale: 5000, fidoProposto: 0 })).toBe(false);
  });
  it("bloccato/legale senza riduzione a zero conserva la selezione manuale dei rossi", () => {
    for (const regola of ["cliente_bloccato", "gestione_legale"]) {
      expect(inclusoInizialeProposta({ proponibile: true, rossa: true, regola, fidoAttuale: 5000, fidoProposto: 1000 })).toBe(false);
      expect(inclusoInizialeProposta({ proponibile: true, rossa: true, regola, fidoAttuale: 0, fidoProposto: 0 })).toBe(false);
    }
  });
});