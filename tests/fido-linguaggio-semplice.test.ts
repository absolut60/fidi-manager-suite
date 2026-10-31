import { describe, it, expect } from "bun:test";
import { raggruppaSegnalazioni, ciDeve, SEGNALAZIONI_FIDO } from "@/lib/fido-segnalazioni";
import { formatEuro } from "@/lib/fidi";

// FANTINO: ci deve 3.127, ordini 35.429, fido giusto 500, ordini fuori 35.278, massimo automatico 750.
const fantino = { fabbisogno: 3127 + 35429, base: 500, ordini_aperti: 35429, fido_attuale: 0, scaduto_oltre: 0,
  scaduto_oltre_giorni: 0, pagato_12m: 0, ordini_fuori: 35278, tetto: 750, profilo: "ritardo_abituale" };

describe("linguaggio semplice", () => {
  it("acquisti sopra il previsto con le parole nuove (FANTINO)", () => {
    const l = raggruppaSegnalazioni({ ...fantino, segnalazioni: ["impegni_sopra_base", "ordine_fuori_giro", "oltre_tetto"] });
    expect(l[0].testo).toBe(`Ci deve ${formatEuro(3127)} e ha ordini clienti aperti per ${formatEuro(35429)}, contro un fido giusto di ${formatEuro(500)}; ordini oltre un mese di acquisti: ${formatEuro(35278)}; supera i ${formatEuro(750)} che il sistema propone da solo — da autorizzare`);
  });
  it("profilo patologico: gli ordini non entrano nel 'ci deve'", () =>
    expect(ciDeve({ fabbisogno: 3127, ordini_aperti: 35429, profilo: "patologico_scaduto_fermo" })).toBe(3127));
  it("etichetta oltre il massimo automatico", () =>
    expect(SEGNALAZIONI_FIDO.oltre_tetto.etichetta).toBe("Oltre il massimo automatico"));
});
