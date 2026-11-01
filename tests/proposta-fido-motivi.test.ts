import { describe, expect, it } from "bun:test";
import { riepilogoVisibilita } from "@/lib/proposta-fido-visibilita";
import { etichetteSegnalazioni } from "@/lib/fido-segnalazioni";

const filtri = { tipi: ["aumento", "diminuzione", "nuovo_fido"] };
const riga = (id: string, segnalazioni: string[], alertAperto = false) => ({
  cliente_id: id, tipo: "rinnovo", regola: "calcolo", fido_proposto: 1000,
  proponibile: true, inAlertOAnomalia: true, segnalazioni, alertAperto,
});

describe("Rinnovi da guardare per motivo", () => {
  it("586 rinnovi, 37 clienti da guardare: 30 acquisti, 13 alert, 1 scaduto", () => {
    const righe = Array.from({ length: 586 }, (_, i) => ({
      ...riga(String(i), i < 30 ? ["impegni_sopra_base", "ordine_fuori_giro", "oltre_tetto"] : i === 36 ? ["scaduto_da_incassare"] : [], i >= 23 && i < 36),
      inAlertOAnomalia: i < 37,
    }));
    const conto = riepilogoVisibilita(righe, filtri, new Set());
    expect(conto.nascosti.rinnovo).toBe(549);
    expect(conto.tipiSpenti.rinnovo_da_guardare).toBe(37);
    expect(conto.daDecidere).toBe(37);
    expect(conto.daDeciderePerMotivo).toEqual({
      [etichetteSegnalazioni(["impegni_sopra_base"])[0]]: 30,
      alert_aperto: 13,
      [etichetteSegnalazioni(["scaduto_da_incassare"])[0]]: 1,
    });
  });
  it("ogni cliente conta una volta per gruppo, anche con più segnali e alert", () => {
    const conto = riepilogoVisibilita([riga("a", ["ordine_fuori_giro", "oltre_tetto", "uso_pieno"], true)], filtri, new Set());
    expect(conto.daDecidere).toBe(1);
    expect(Object.values(conto.daDeciderePerMotivo)).toEqual([1, 1]);
  });
  it("conta anche rinnovi visibili, ma non richieste in corso o non proponibili", () => {
    const righe = [riga("visibile", ["oltre_tetto"]),
      { ...riga("in-corso", ["oltre_tetto"]), richiestaInCorso: {} },
      { ...riga("escluso", ["scaduto_non_incassato"]), proponibile: false }];
    const conto = riepilogoVisibilita(righe, filtri, new Set(), new Set(["visibile"]));
    expect(conto.daDecidere).toBe(1);
    expect(conto.daDeciderePerMotivo).toEqual({ [etichetteSegnalazioni(["oltre_tetto"])[0]]: 1 });
  });
  it("nessun motivo a zero e codici sconosciuti ignorati", () => {
    const conto = riepilogoVisibilita([riga("s", ["scaduto_non_incassato", "sconosciuto"])], filtri, new Set());
    expect(conto.daDeciderePerMotivo).toEqual({ [etichetteSegnalazioni(["scaduto_non_incassato"])[0]]: 1 });
  });
});