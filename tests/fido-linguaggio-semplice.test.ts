import { describe, it, expect } from "bun:test";
import { raggruppaSegnalazioni, ciDeve, SEGNALAZIONI_FIDO } from "@/lib/fido-segnalazioni";
import { formatEuro } from "@/lib/fidi";

// FANTINO: ci deve 3.127, ordini 35.429, fido giusto 500, ordini fuori 35.278, massimo automatico 750.
const fantino = { esposizione_corrente: 3127, fabbisogno: 3127 + 35429, base: 500, ordini_aperti: 35429, fido_attuale: 0, scaduto_oltre: 0,
  scaduto_oltre_giorni: 0, pagato_12m: 0, ordini_fuori: 35278, tetto: 750, profilo: "ritardo_abituale" };

describe("linguaggio semplice", () => {
  it("ci deve legge esposizione canonica senza sottrarre ancora gli ordini (FANTINO)", () => {
    const l = raggruppaSegnalazioni({ ...fantino, segnalazioni: ["impegni_sopra_base", "ordine_fuori_giro", "oltre_tetto"] });
    expect(ciDeve(fantino)).toBe(3127);
    expect(l).toHaveLength(3);
    expect(l[0].testo).toBe(`Acquisti sopra il previsto: ci deve ${formatEuro(3127)}, contro un fido giusto di ${formatEuro(500)}`);
  });
  it("profilo patologico: gli ordini non entrano nel 'ci deve'", () =>
    expect(ciDeve({ fabbisogno: 3127, ordini_aperti: 35429, profilo: "patologico_scaduto_fermo" })).toBe(3127));
  it("etichetta oltre il massimo automatico", () =>
    expect(SEGNALAZIONI_FIDO.oltre_tetto.etichetta).toBe("Oltre il massimo automatico"));
});
