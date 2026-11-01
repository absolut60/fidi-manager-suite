import { describe, expect, it } from "bun:test";
import { riferimentoRichiesta } from "@/lib/fido-teorico";
import { determinaTipoRichiesta } from "@/lib/fidi";
import { anomaliaRossa } from "@/lib/fido-segnalazioni";
import { CATEGORIE_PROPOSTA_DEFAULT, daValutareProposta, inclusoInizialeProposta, riepilogoVisibilita, righeVisibiliProposta } from "@/lib/proposta-fido-visibilita";

const bloccato = { regola_applicata: "cliente_bloccato", fido_attuale: 5000, fido_proposto: 0, esposizione_corrente: 4800, ordini_aperti: 1200 };
const protetto = { richiesta_id: "r", importo_approvato: 10000, fido_teorico_riferimento: 0, approvata_il: "2026-11-01", protetto_fino_al: "2026-12-01", protezione_valida: true };
const filtri = { tipi: CATEGORIE_PROPOSTA_DEFAULT };

describe("Bloccati e legali: proposta a zero", () => {
  it("bloccato con debito e Gamma 5.000 diventa diminuzione zero", () => {
    const riferimento = riferimentoRichiesta(bloccato, 0.8, undefined);
    expect(riferimento).toBe(0);
    expect(determinaTipoRichiesta(5000, riferimento ?? -1)).toBe("diminuzione");
  });
  it("bloccato ignora anche l'extra protetto", () => expect(riferimentoRichiesta(bloccato, 0.8, protetto)).toBe(0));
  it("gestione legale ignora debito e extra", () => expect(riferimentoRichiesta({ ...bloccato, regola_applicata: "gestione_legale" }, 0.8, protetto)).toBe(0));
  it("riduzione zero visibile, rossa e non spuntata", () => {
    const r = { cliente_id: "b", regola: "cliente_bloccato", tipo: "diminuzione", fido_attuale: 5000, fido_proposto: 0, proponibile: true, alertAperto: true, segnalazioni: ["bloccato"] };
    expect(righeVisibiliProposta([r], filtri, new Set())).toEqual([r]);
    expect(anomaliaRossa(r.segnalazioni)).toBe(true);
    expect(inclusoInizialeProposta(r.proponibile, anomaliaRossa(r.segnalazioni))).toBe(false);
  });
  it("bloccato già zero non visibile nei da guardare e non contato", () => {
    const r = { cliente_id: "z", regola: "cliente_bloccato", tipo: "rinnovo", fido_attuale: 0, fido_proposto: 0, proponibile: true, segnalazioni: ["bloccato"], alertAperto: true };
    expect(daValutareProposta(r)).toBe(false);
    expect(righeVisibiliProposta([r], filtri, new Set())).toEqual([]);
    expect(riepilogoVisibilita([r], filtri, new Set()).daDecidere).toBe(0);
    expect(riepilogoVisibilita([r], filtri, new Set()).daDeciderePerMotivo).toEqual({});
  });
  it("zero su zero mai da guardare per nessuna regola", () => {
    for (const regola of ["calcolo", "gestione_legale", "scaduto_non_incassato"]) expect(daValutareProposta({ cliente_id: regola, regola, tipo: "rinnovo", fido_attuale: 0, fido_proposto: 0, alertAperto: true })).toBe(false);
  });
  it("scaduto non incassato mantiene la protezione valida", () => expect(riferimentoRichiesta({ ...bloccato, regola_applicata: "scaduto_non_incassato" }, 0.8, protetto)).toBe(10000));
});