import { describe, expect, it } from "bun:test";
import { daAutorizzareRichiesta, segnalazioniAnomalia } from "@/lib/fido-segnalazioni";
import { fidoPerTornareSottoSoglia } from "@/lib/fido-teorico";

describe("FM55 3C — da autorizzare", () => {
  it("sopra il teorico con anomalia arancione → arancione", () => {
    expect(daAutorizzareRichiesta(50000, 40000, ["impegni_sopra_base", "uso_pieno"])).toEqual({ anomalie: ["impegni_sopra_base"], rossa: false });
  });
  it("con scaduto non incassato → rosso", () => {
    expect(daAutorizzareRichiesta(3000, 0, ["scaduto_non_incassato"])?.rossa).toBe(true);
  });
  it("uguale al teorico o solo uso pieno → niente", () => {
    expect(daAutorizzareRichiesta(40000, 40000, ["oltre_tetto"])).toBeNull();
    expect(daAutorizzareRichiesta(50000, 40000, ["uso_pieno"])).toBeNull();
    expect(daAutorizzareRichiesta(50000, null, ["oltre_tetto"])).toBeNull();
  });
  it("anomalie = arancioni e rosse", () => {
    expect(segnalazioniAnomalia(["uso_pieno", "bloccato", "ordine_fuori_giro"])).toEqual(["bloccato", "ordine_fuori_giro"]);
  });
  it("per tornare sotto l'80%: 452.887 € → 570.000 €", () => {
    expect(fidoPerTornareSottoSoglia(452887, 0.8)).toBe(570000);
  });
});
