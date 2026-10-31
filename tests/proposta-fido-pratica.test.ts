import { describe, expect, it } from "vitest";
import {
  righeVisibiliProposta, riepilogoVisibilita, inclusoInizialeProposta, livelloControlloProposta,
} from "@/lib/proposta-fido-visibilita";
import { segnalazioniAnomalia, anomaliaRossa } from "@/lib/fido-segnalazioni";

const filtri = { tipi: ["nuovo_fido", "aumento", "diminuzione"], pagImmediato: "includi", fidoZero: "includi", inCorso: "escludi" };
const riga = (id: string, tipo: string, extra: Record<string, unknown> = {}) =>
  ({ cliente_id: id, tipo, regola: "calcolo", fido_proposto: 1000, proponibile: true, ...extra });

describe("proposta massiva pratica (31/10)", () => {
  it("rinnovo con anomalia nascosto e contato in daDecidere", () => {
    const righe = [riga("a", "rinnovo", { inAlertOAnomalia: true }), riga("b", "aumento")];
    expect(righeVisibiliProposta(righe, filtri, new Set()).map((r) => r.cliente_id)).toEqual(["b"]);
    const r = riepilogoVisibilita(righe, filtri, new Set(), undefined);
    expect(r.daDecidere).toBe(1);
    expect(r.visibili).toBe(1);
  });
  it("rinnovo in mostraSempre visibile e non contato in daDecidere", () => {
    const righe = [riga("a", "rinnovo", { inAlertOAnomalia: true })];
    expect(righeVisibiliProposta(righe, filtri, new Set(), new Set(["a"]))).toHaveLength(1);
    const r = riepilogoVisibilita(righe, filtri, new Set(), undefined, new Set(["a"]));
    expect(r.visibili).toBe(1);
    expect(r.daDecidere).toBe(0);
  });
  it("selezione multipla di rinnovi da Alert fidi (mostraSempre): tutte visibili", () => {
    const righe = [
      riga("a", "rinnovo", { inAlertOAnomalia: true }),
      riga("b", "rinnovo"),
      riga("c", "rinnovo", { inAlertOAnomalia: true }),
    ];
    const scelti = new Set(["a", "b", "c"]);
    expect(righeVisibiliProposta(righe, filtri, new Set(), scelti).map((r) => r.cliente_id)).toEqual(["a", "b", "c"]);
    const r = riepilogoVisibilita(righe, filtri, new Set(), undefined, scelti);
    expect(r.visibili).toBe(3);
    expect(r.daDecidere).toBe(0);
  });
  it("con Rinnovo riacceso i rinnovi si vedono", () => {
    const f = { ...filtri, tipi: [...filtri.tipi, "rinnovo"] };
    expect(righeVisibiliProposta([riga("a", "rinnovo", { inAlertOAnomalia: true })], f, new Set())).toHaveLength(1);
  });
  it("tutte le righe proponibili spuntate all'apertura, anche con anomalie", () => {
    expect(inclusoInizialeProposta(true)).toBe(true);
    expect(inclusoInizialeProposta(false)).toBe(false);
  });
  it("riga con anomalia marcata da controllare", () => {
    const codici = ["impegni_sopra_base"];
    const n = segnalazioniAnomalia(codici).length;
    expect(livelloControlloProposta(n, anomaliaRossa(codici))).not.toBeNull();
    expect(livelloControlloProposta(0, false)).toBeNull();
    expect(livelloControlloProposta(1, true)).toBe("rossa");
  });
});
