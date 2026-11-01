import { describe, expect, it } from "bun:test";
import { alertConsumoAperto, giaDeciso, type StatoAlertFido } from "@/lib/alert-fidi";
import { categoriaProposta, CATEGORIE_PROPOSTA_DEFAULT, daValutareProposta, riepilogoVisibilita, righeVisibiliProposta } from "@/lib/proposta-fido-visibilita";

const filtri = { tipi: CATEGORIE_PROPOSTA_DEFAULT };
const riga = (segnalazioni: string[] = [], alertAperto = false) => ({
  cliente_id: "abbruscato", tipo: "rinnovo", regola: "calcolo", proponibile: true,
  fido_attuale: 105000, fido_proposto: 105000, segnalazioni, alertAperto,
});

describe("Rinnovi da guardare: solo consumo aperto o rosso", () => {
  it("ABBRUSCATO: 105.000 confermati e debito 80.188, arancione senza alert non richiede riconferma", () => {
    const r = { ...riga(["impegni_sopra_base"]), esposizione: 80188 };
    expect(daValutareProposta(r)).toBe(false);
    expect(categoriaProposta(r)).toBe("rinnovo");
    expect(righeVisibiliProposta([r], filtri, new Set())).toEqual([]);
    expect(riepilogoVisibilita([r], filtri, new Set()).daDecidere).toBe(0);
  });
  it("consumo effettivamente aperto rende il rinnovo da guardare", () => {
    const aperto = alertConsumoAperto({ tipo: "consumo", stato: "aperto" });
    expect(aperto).toBe(true);
    expect(daValutareProposta(riga([], aperto))).toBe(true);
  });
  for (const stato of ["confermato", "in_osservazione", "gia_deciso"] satisfies StatoAlertFido[]) {
    it(`consumo ${stato} non rende un arancione da guardare`, () => {
      const aperto = alertConsumoAperto({ tipo: "consumo", stato });
      expect(aperto).toBe(false);
      expect(daValutareProposta(riga(["oltre_tetto"], aperto))).toBe(false);
    });
  }
  it("decisione protetta arricchisce lo stato grezzo aperto e impedisce una riconferma", () => {
    const protetto = { richiesta_id: "r", importo_approvato: 105000, fido_teorico_riferimento: 105000,
      approvata_il: new Date().toISOString(), protetto_fino_al: new Date(Date.now() + 86400000).toISOString(), protezione_valida: true };
    const deciso = giaDeciso(protetto, 105000, 105000);
    expect(deciso).toBe(true);
    expect(alertConsumoAperto({ tipo: "consumo", stato: "aperto", gia_deciso: deciso })).toBe(false);
  });
  it("richiesta attiva esclude il consumo anche quando lo stato memorizzato è aperto", () => {
    expect(alertConsumoAperto({ tipo: "consumo", stato: "aperto", richiesta_attiva: {
      id: "r", cliente_id: "c", stato: "in_approvazione", stato_export: null, tipo: "rinnovo",
      importo_richiesto: 105000, created_at: "2026-11-01", data_processata: null,
    } })).toBe(false);
  });
  it("riduzione ed extra aperti non sono alert di consumo", () => {
    for (const tipo of ["riduzione", "extra_non_usato"] as const) expect(alertConsumoAperto({ tipo, stato: "aperto" })).toBe(false);
  });
  it("rinnovo bloccato con Gamma positivo è da guardare", () => {
    expect(daValutareProposta({ ...riga(["bloccato"]), regola: "cliente_bloccato", fido_attuale: 5000, fido_proposto: 5000 })).toBe(true);
  });
  it("rosso senza Gamma positivo non basta, zero su zero resta escluso anche con alert", () => {
    expect(daValutareProposta({ ...riga(["bloccato"]), fido_attuale: 0, fido_proposto: 0 })).toBe(false);
    expect(daValutareProposta({ ...riga(["scaduto_non_incassato"], true), fido_attuale: 0, fido_proposto: 0 })).toBe(false);
  });
  it("tutti gli arancioni da soli restano altri rinnovi e non entrano nei motivi", () => {
    for (const codice of ["impegni_sopra_base", "ordine_fuori_giro", "oltre_tetto", "scaduto_da_incassare"]) {
      const r = riga([codice]);
      expect(daValutareProposta(r)).toBe(false);
      expect(riepilogoVisibilita([r], filtri, new Set()).daDeciderePerMotivo).toEqual({});
    }
  });
  it("motivi: solo consumo e rossi, arancioni conservati sulla riga visibile", () => {
    const r = riga(["bloccato", "scaduto_non_incassato", "oltre_tetto"], true);
    const conto = riepilogoVisibilita([r], filtri, new Set());
    expect(conto.daDecidere).toBe(1);
    expect(conto.daDeciderePerMotivo).toEqual({ "Cliente bloccato": 1, "Scaduto non incassato": 1, alert_aperto: 1 });
    expect(righeVisibiliProposta([r], filtri, new Set())[0]?.segnalazioni).toContain("oltre_tetto");
  });
});