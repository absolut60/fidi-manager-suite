import { describe, expect, it } from "vitest";
import { passaFiltriProposta, riepilogoVisibilita } from "@/lib/proposta-fido-visibilita";

const filtri = { tipi: ["nuovo_fido", "aumento", "diminuzione"], pagImmediato: "includi", fidoZero: "includi", inCorso: "escludi" };
const riga = (id: string, tipo: string, extra: Record<string, unknown> = {}) =>
  ({ cliente_id: id, tipo, regola: "calcolo", fido_proposto: 1000, proponibile: true, ...extra });

describe("riepilogo visibilità proposta massiva", () => {
  it("3 visibili + 4 rinnovi + 1 protetta + 1 in corso + 1 non proponibile = 10", () => {
    const righe = [
      riga("v1", "aumento"), riga("v2", "diminuzione"), riga("v3", "nuovo_fido"),
      riga("r1", "rinnovo"), riga("r2", "rinnovo"), riga("r3", "rinnovo"), riga("r4", "rinnovo"),
      riga("p1", "rinnovo"),
      riga("c1", "aumento", { richiestaInCorso: { id: "x" } }),
      riga("n1", "aumento", { proponibile: false, regola: "condizione_mancante" }),
    ];
    const r = riepilogoVisibilita(righe, filtri, new Set(), new Set(["p1"]));
    expect(r.visibili).toBe(3);
    expect(r.nascosti.rinnovo).toBe(4);
    expect(r.nascosti.protetto).toBe(1);
    expect(r.nascosti.in_corso).toBe(1);
    expect(r.nonProponibili.condizione_mancante).toBe(1);
    const somma = r.visibili + Object.values(r.nascosti).reduce((a, b) => a + b, 0) + r.nonProponibiliTotale;
    expect(somma).toBe(10);
  });
  it("una riga toccata resta visibile e non conta tra le nascoste", () => {
    const r = riepilogoVisibilita([riga("a", "rinnovo")], filtri, new Set(["a"]), undefined);
    expect(r.visibili).toBe(1);
    expect(r.nascosti.rinnovo).toBe(0);
  });
  it("FM55 3C: rinnovi in alert o con anomalie restano visibili come da valutare", () => {
    const righe = [
      riga("v1", "aumento"),
      riga("r1", "rinnovo"), riga("r2", "rinnovo"),
      riga("a1", "rinnovo", { inAlertOAnomalia: true }), riga("a2", "rinnovo", { inAlertOAnomalia: true }),
      riga("c1", "rinnovo", { inAlertOAnomalia: true, richiestaInCorso: { id: "x" } }),
      riga("n1", "aumento", { proponibile: false, regola: "cliente_bloccato" }),
    ];
    const r = riepilogoVisibilita(righe, filtri, new Set(), undefined);
    expect(r.visibili).toBe(3);
    expect(r.daValutare).toBe(2);
    expect(r.nascosti.rinnovo).toBe(2);
    expect(r.nascosti.in_corso).toBe(1);
    const somma = r.visibili + Object.values(r.nascosti).reduce((a, b) => a + b, 0) + r.nonProponibiliTotale;
    expect(somma).toBe(7);
    expect(passaFiltriProposta(riga("a", "rinnovo", { inAlertOAnomalia: true }), filtri)).toBe(true);
    expect(passaFiltriProposta(riga("b", "rinnovo"), filtri)).toBe(false);
  });
});
