import { formatEuro } from "@/lib/fidi";
import { describe, expect, it } from "bun:test";
import { segnalazioniRiga, raggruppaSegnalazioni, etichetteSegnalazioni } from "@/lib/fido-segnalazioni";

const base = { esposizione_corrente: 3127, fido_proposto: 5000, fabbisogno: 38555.7, base: 500, ordini_aperti: 35428.7, fido_attuale: 40000, scaduto_oltre: 0, scaduto_oltre_giorni: 0, pagato_12m: 0 };

describe("segnalazioni fido", () => {
  it("ordina per gravità e ignora codici sconosciuti", () => {
    const l = segnalazioniRiga({ ...base, segnalazioni: ["ordine_fuori_giro", "xyz", "scaduto_non_incassato", "impegni_sopra_base"] });
    expect(l.map((s) => s.codice)).toEqual(["scaduto_non_incassato", "impegni_sopra_base", "ordine_fuori_giro"]);
    expect(l[0].gravita).toBe("rossa");
  });
  it("uso pieno → Fido in esaurimento", () => {
    const l = raggruppaSegnalazioni({ ...base, fabbisogno: 34000, segnalazioni: ["uso_pieno"] });
    expect(l[0].etichetta).toBe("Fido in esaurimento");
    expect(l[0].testo).toBe("Usa il 85% del fido");
  });
  it("scaduto da incassare: percentuale sul pagato 12 mesi", () => {
    const l = segnalazioniRiga({ ...base, scaduto_oltre: 27740.69, scaduto_oltre_giorni: 31, pagato_12m: 532973.65, segnalazioni: ["scaduto_da_incassare"] });
    expect(l[0].gravita).toBe("arancione");
    expect(l[0].testo).toContain("pari al 5% di quanto pagato in 12 mesi");
  });
  it("ordine fuori giro e oltre tetto: arancioni, ordinati dopo impegni sopra base", () => {
    const l = segnalazioniRiga({ ...base, ordini_fuori: 35278, acquisto_mensile: 150.62, tetto: 750, valore_senza_tetto: 3278, segnalazioni: ["oltre_tetto", "ordine_fuori_giro", "impegni_sopra_base"] });
    expect(l.map((s) => s.codice)).toEqual(["impegni_sopra_base", "ordine_fuori_giro", "oltre_tetto"]);
    expect(l.every((s) => s.gravita === "arancione")).toBe(true);
  });

  it("oltre normale: rosso e proposta confrontata con la soglia normale", () => {
    const l = raggruppaSegnalazioni({ ...base, fido_proposto: 100000, tetto: 90000, segnalazioni: ["oltre_normale"] });
    expect(l[0]).toEqual({ codice: "oltre_normale", etichetta: "Molto sopra il suo normale", gravita: "rossa",
      testo: `Sta comprando molto più del solito: fido proposto ${formatEuro(100000)} oltre una volta e mezza il fido giusto (${formatEuro(90000)}) — da autorizzare` });
  });
  it("ordini oltre fido: arancione, esposizione canonica più ordini anche su righe vecchie", () => {
    const l = raggruppaSegnalazioni({ ...base, esposizione_corrente: 80000, ordini_aperti: 50000, fabbisogno: 999999, segnalazioni: ["ordini_oltre_fido"] });
    expect(l[0]).toEqual({ codice: "ordini_oltre_fido", etichetta: "Ordini oltre il fido", gravita: "arancione",
      testo: `Ha ordini clienti aperti per ${formatEuro(50000)}: se consegnati, ci dovrebbe ${formatEuro(130000)}, più del fido proposto` });
  });
  it("nuovi segnali separati, rossi prima degli arancioni; sconosciuti ignorati", () => {
    const l = raggruppaSegnalazioni({ ...base, segnalazioni: ["ordini_oltre_fido", "ignoto", "oltre_normale", "uso_pieno", "oltre_normale"] });
    expect(l.map(s => s.codice)).toEqual(["oltre_normale", "ordini_oltre_fido", "uso_pieno"]);
  });
  it("legacy riconosciuti separatamente, senza gruppo acquisti sintetico né voci vuote", () => {
    const l = raggruppaSegnalazioni({ ...base, segnalazioni: ["oltre_tetto", "ordine_fuori_giro", "impegni_sopra_base"] });
    expect(l.map(s => s.codice)).toEqual(["impegni_sopra_base", "ordine_fuori_giro", "oltre_tetto"]);
    expect(l.every(s => s.testo.length > 0)).toBe(true);
    expect(etichetteSegnalazioni(["oltre_tetto", "scaduto_da_incassare", "impegni_sopra_base"])).toEqual(["Scaduto da incassare", "Acquisti sopra il previsto", "Oltre il massimo automatico"]);
  });
});
