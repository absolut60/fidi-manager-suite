import { describe, expect, it } from "bun:test";
import { segnalazioniRiga } from "@/lib/fido-segnalazioni";

const base = { fabbisogno: 38555.7, base: 500, ordini_aperti: 35428.7, fido_attuale: 40000, scaduto_oltre: 0, scaduto_oltre_giorni: 0, pagato_12m: 0 };

describe("segnalazioni fido", () => {
  it("ordina per gravità e ignora codici sconosciuti", () => {
    const l = segnalazioniRiga({ ...base, segnalazioni: ["ordine_fuori_giro", "xyz", "scaduto_non_incassato", "impegni_sopra_base"] });
    expect(l.map((s) => s.codice)).toEqual(["scaduto_non_incassato", "impegni_sopra_base", "ordine_fuori_giro"]);
    expect(l[0].gravita).toBe("rossa");
  });
  it("uso pieno: percentuale sul fido Gamma", () => {
    const l = segnalazioniRiga({ ...base, fabbisogno: 34000, segnalazioni: ["uso_pieno"] });
    expect(l[0].testo).toBe("Uso pieno del fido: 85% del fido Gamma");
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
});
