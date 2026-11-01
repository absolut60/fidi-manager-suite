import { describe, expect, it } from "bun:test";
import { categoriaProposta, daValutareProposta, righeVisibiliProposta, riepilogoVisibilita, CATEGORIE_PROPOSTA_DEFAULT } from "@/lib/proposta-fido-visibilita";
import type { ExtraFidoProtetto } from "@/lib/fido-teorico";

const protezione: ExtraFidoProtetto = {
  richiesta_id: "approvata", importo_approvato: 2000, fido_teorico_riferimento: 0,
  approvata_il: "2026-11-01T18:00:00Z", protetto_fino_al: "2026-11-30",
  scaduto_al_momento: 1200, scaduto_attuale: 1200, protezione_valida: true,
};
const riga = {
  cliente_id: "deciso", tipo: "rinnovo", regola: "scaduto_non_incassato", proponibile: true,
  fido_attuale: 2000, fido_proposto: 2000, riferimentoRichiesta: 2000,
  segnalazioni: ["scaduto_non_incassato"], alertAperto: true, protezione,
};
const filtri = { tipi: CATEGORIE_PROPOSTA_DEFAULT };

describe("Massiva: già decisi dalla stessa regola degli Alert", () => {
  it("protezione valida e riferimento 2.000 = Gamma: rinnovo, mai da guardare", () => {
    expect(categoriaProposta(riga)).toBe("rinnovo");
    expect(daValutareProposta(riga)).toBe(false);
    expect(righeVisibiliProposta([riga], filtri, new Set())).toHaveLength(0);
  });
  it("scaduto cresciuto e protezione decaduta: torna da guardare", () => {
    const decaduta = { ...riga, protezione: { ...protezione, scaduto_attuale: 2400, protezione_valida: false } };
    expect(categoriaProposta(decaduta)).toBe("rinnovo_da_guardare");
    expect(righeVisibiliProposta([decaduta], filtri, new Set())).toHaveLength(1);
  });
  it("protezione scaduta, non più restituita dalla fonte SQL: torna da guardare", () => {
    expect(categoriaProposta({ ...riga, protezione: undefined })).toBe("rinnovo_da_guardare");
  });
  it("riferimento diverso da Gamma: protezione da sola non nasconde il rinnovo", () => {
    expect(categoriaProposta({ ...riga, riferimentoRichiesta: 3000 })).toBe("rinnovo_da_guardare");
  });
  it("mostraSempre dagli Alert mantiene visibile il già deciso", () => {
    expect(righeVisibiliProposta([riga], filtri, new Set(), new Set(["deciso"]))).toHaveLength(1);
    expect(riepilogoVisibilita([riga], filtri, new Set(), new Set(["deciso"])).giaDecisiPerScadenza).toEqual({});
  });
  it("Altri fidi invariati rende visibili i già decisi", () => {
    expect(righeVisibiliProposta([riga], { tipi: [...filtri.tipi, "rinnovo"] }, new Set())).toHaveLength(1);
  });
  it("riepilogo per 30/11: solo i nascosti già decisi, esclusi dal contatore scaduto", () => {
    const daGuardare = { ...riga, cliente_id: "da-guardare", protezione: { ...protezione, protezione_valida: false } };
    const riepilogo = riepilogoVisibilita([riga, daGuardare], filtri, new Set());
    expect(riepilogo.giaDecisiPerScadenza).toEqual({ "2026-11-30": 1 });
    expect(riepilogo.daDecidere).toBe(1);
    expect(Object.values(riepilogo.daDeciderePerMotivo)).toEqual([1, 1]);
    expect(riepilogo.altriRinnovi).toBe(1);
    expect(riepilogo.nascosti.rinnovo).toBe(1);
    expect(riepilogo.visibili).toBe(1);
  });
  it("richiesta attiva resta esclusa anche con mostraSempre", () => {
    expect(righeVisibiliProposta([{ ...riga, richiestaInCorso: { id: "attiva" } }], filtri, new Set(), new Set(["deciso"]))).toHaveLength(0);
  });
});