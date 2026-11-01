import { describe, expect, test } from "bun:test";
import { motivoRigaProposta, inclusoInizialeProposta } from "@/lib/proposta-fido-visibilita";
import { arrotondaFidoV2 } from "@/lib/fido-teorico";

const dati = { fidoAttuale: 25000, consigliato: 25000, esposizione_corrente: 6772, ordini_aperti: 15929 };
const riga = (regola = "calcolo", segnalazioni: string[] = [], extra = {}) => motivoRigaProposta({ regola, segnalazioni, dati: { ...dati, ...extra } });

describe("FM55 copertura informativa e motivo unico", () => {
  test("6.772 più 15.929 all'80% richiedono 30.000 senza modificare i dati", () => {
    expect(riga().perCoprire).toBe(30000);
    expect(dati.consigliato).toBe(25000);
    expect(inclusoInizialeProposta({ proponibile: true, rossa: false, regola: "calcolo", fidoAttuale: 25000, fidoProposto: dati.consigliato })).toBe(true);
  });
  test("copertura uguale al consigliato resta disponibile e senza ordini usa solo debito", () => {
    expect(riga("calcolo", [], { esposizione_corrente: 20000, ordini_aperti: 0 }).perCoprire).toBe(25000);
    expect(riga("calcolo", [], { esposizione_corrente: 0, ordini_aperti: null }).perCoprire).toBe(0);
  });
  test("arrotondamento gemello DB, anche oltre 50.000", () => {
    for (const [input, output] of [[0, 0], [501, 1000], [1001, 2000], [5001, 10000], [50001, 55000], [56001, 60000]]) {
      expect(arrotondaFidoV2(input)).toBe(output);
    }
  });
  test("bloccato e legale vincono anche con scaduto", () => {
    expect(riga("cliente_bloccato", ["scaduto_non_incassato"]).frase).toBe("Cliente bloccato: fido a zero.");
    expect(riga("gestione_legale", ["scaduto_non_incassato"]).frase).toBe("Cliente in legale: fido a zero.");
  });
  test("scaduto 1.566 da 32 giorni prevale sugli altri motivi", () => {
    expect(riga("scaduto_non_incassato", ["oltre_normale", "ordini_oltre_fido"], { scaduto_oltre: 1566.2, scaduto_oltre_giorni: 32, consigliato: 0 }).frase)
      .toBe("Scaduto non pagato 1.566 € da 32 giorni: fido a zero finché non paga.");
  });
  test("da autorizzare usa copertura 60.000 e precede ordini", () => {
    expect(riga("calcolo", ["oltre_normale", "ordini_oltre_fido"], { esposizione_corrente: 32000, ordini_aperti: 16000 }).frase)
      .toBe("Compra molto più del solito: per coprirlo servono 60.000 €.");
  });
  test("ordini in arrivo 15.929", () => {
    expect(riga("calcolo", ["ordini_oltre_fido"]).frase).toBe("Ordini in arrivo 15.929 €: con la consegna supera il fido.");
  });
  test("aumento normale 13.200 al mese in 77 giorni", () => {
    expect(riga("calcolo", [], { consigliato: 40000, acquisto_mensile: 13200.1, ciclo_gg: 77.2 }).frase)
      .toBe("Compra 13.200 € al mese e paga in 77 giorni.");
  });
  test("riduzione semplice a 25.000", () => {
    expect(riga("calcolo", [], { fidoAttuale: 50000 }).frase).toBe("Usa meno fido del solito: ne bastano 25.000 €.");
  });
  test("freno ordini certificato da SQL, prima 10.000 e dopo 25.000", () => {
    expect(riga("calcolo", [], { fidoAttuale: 50000, valore_senza_tetto: 9800, spiegazione: "Ha ordini aperti per 15.929 €: per non bloccarlo il fido non scende sotto 25.000 €." }).frase)
      .toBe("Ne basterebbero 10.000 €, ma con gli ordini in arrivo servono 25.000 €.");
  });
  test("freno picco non attribuito falsamente agli ordini", () => {
    expect(riga("calcolo", [], { fidoAttuale: 50000, valore_senza_tetto: 10000, spiegazione: "Negli ultimi 30 giorni è arrivato a doverci 20.000 €." }).frase)
      .toBe("Ne basterebbero 10.000 €, ma per quanto ci doveva negli ultimi 30 giorni servono 25.000 €.");
  });
  test("nessun valore inventato prima del freno quando manca il dato pubblicato", () => {
    expect(riga("calcolo", [], { fidoAttuale: 50000, valore_senza_tetto: null, spiegazione: "Ha ordini aperti per 15.929 €." }).frase)
      .toBe("Usa meno fido del solito: ne bastano 25.000 €.");
  });
});