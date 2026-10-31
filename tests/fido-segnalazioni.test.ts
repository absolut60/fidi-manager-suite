import { describe, expect, it } from "bun:test";
import { segnalazioniRiga } from "@/lib/fido-segnalazioni";

const base = { fabbisogno: 38555.7, base: 500, ordini_aperti: 35428.7, fido_attuale: 40000, scaduto_oltre: 0, scaduto_oltre_giorni: 0 };

describe("segnalazioni fido", () => {
  it("ordina per gravità e ignora codici sconosciuti", () => {
    const l = segnalazioniRiga({ ...base, segnalazioni: ["ordini_prevalenti", "xyz", "scaduto_non_incassato", "impegni_sopra_base"] });
    expect(l.map((s) => s.codice)).toEqual(["scaduto_non_incassato", "impegni_sopra_base", "ordini_prevalenti"]);
    expect(l[0].gravita).toBe("rossa");
  });
  it("uso pieno: percentuale sul fido Gamma", () => {
    const l = segnalazioniRiga({ ...base, fabbisogno: 34000, segnalazioni: ["uso_pieno"] });
    expect(l[0].testo).toBe("Uso pieno del fido: 85% del fido Gamma");
  });
});
