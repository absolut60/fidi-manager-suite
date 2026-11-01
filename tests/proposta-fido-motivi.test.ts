import { describe, expect, it } from "bun:test";
import { riepilogoVisibilita, testoMotivoDaGuardare } from "@/lib/proposta-fido-visibilita";
import { etichetteSegnalazioni } from "@/lib/fido-segnalazioni";

const filtri = { tipi: ["aumento", "diminuzione", "nuovo_fido"] };
const riga = (id: string, segnalazioni: string[], alertAperto = false) => ({
  cliente_id: id, tipo: "rinnovo", regola: "calcolo", fido_proposto: 1000,
  fido_attuale: 1000, proponibile: true, segnalazioni, alertAperto,
});

describe("Rinnovi da guardare per motivo", () => {
  it("586 rinnovi: solo 13 alert aperti da guardare, non 30 arancioni e 1 scaduto arancione", () => {
    const righe = Array.from({ length: 586 }, (_, i) => ({
      ...riga(String(i), i < 30 ? ["impegni_sopra_base", "ordine_fuori_giro", "oltre_tetto"] : i === 36 ? ["scaduto_da_incassare"] : [], i >= 23 && i < 36),
    }));
    const conto = riepilogoVisibilita(righe, filtri, new Set());
    expect(conto.nascosti.rinnovo).toBe(573);
    expect(conto.tipiSpenti.rinnovo_da_guardare).toBe(13);
    expect(conto.daDecidere).toBe(13);
    expect(conto.daDeciderePerMotivo).toEqual({
      alert_aperto: 13,
    });
  });
  it("ogni cliente conta una volta per gruppo, anche con più segnali e alert", () => {
    const conto = riepilogoVisibilita([riga("a", ["ordine_fuori_giro", "oltre_tetto", "bloccato", "bloccato", "uso_pieno"], true)], filtri, new Set());
    expect(conto.daDecidere).toBe(1);
    expect(Object.values(conto.daDeciderePerMotivo)).toEqual([1, 1]);
  });
  it("conta anche rinnovi visibili, ma non richieste in corso o non proponibili", () => {
    const righe = [riga("visibile", ["oltre_tetto"], true),
      { ...riga("in-corso", ["oltre_tetto"], true), richiestaInCorso: {} },
      { ...riga("escluso", ["scaduto_non_incassato"]), proponibile: false }];
    const conto = riepilogoVisibilita(righe, filtri, new Set(), new Set(["visibile"]));
    expect(conto.daDecidere).toBe(1);
    expect(conto.daDeciderePerMotivo).toEqual({ alert_aperto: 1 });
  });
  it("nessun motivo a zero e codici sconosciuti ignorati", () => {
    const conto = riepilogoVisibilita([riga("s", ["scaduto_non_incassato", "sconosciuto"])], filtri, new Set());
    expect(conto.daDeciderePerMotivo).toEqual({ [etichetteSegnalazioni(["scaduto_non_incassato"])[0]]: 1 });
  });
});

describe("oltre normale nella massiva", () => {
  it("rosso senza alert rende il rinnovo da guardare, con un motivo per cliente", () => {
    const conto = riepilogoVisibilita([riga("a", ["oltre_normale", "oltre_normale", "ordini_oltre_fido"])], filtri, new Set());
    expect(conto.daDecidere).toBe(1);
    expect(conto.daDeciderePerMotivo).toEqual({ "Molto sopra il suo normale": 1 });
    expect(conto.tipiSpenti.rinnovo_da_guardare).toBe(1);
    expect(testoMotivoDaGuardare("Molto sopra il suo normale", 1)).toBe("è molto sopra il suo normale");
    expect(testoMotivoDaGuardare("Molto sopra il suo normale", 2)).toBe("sono molto sopra il loro normale");
  });
});
