import { describe, expect, it } from "bun:test";
import { impostaConvenzionatoInput, elencoFornitoriInput, dettaglioFornitoreSchema } from "../src/lib/fornitori";
import { messaggioConvenzione, tipoModificabile, ricercaFornitori } from "../src/lib/scheda-fornitore";

describe("FM62 F7 fornitori convenzionati", () => {
  it("il tipo non si cambia a mano se deciso da Gamma o dalla convenzione", () => {
    expect(tipoModificabile("convenzionato")).toBe(false);
    expect(tipoModificabile("gamma")).toBe(false);
    expect(tipoModificabile("app")).toBe(true);
  });
  it("la fonte 'convenzionato' del tipo è accettata dal dettaglio", () => {
    expect(dettaglioFornitoreSchema.shape.tipo_fonte.parse("convenzionato")).toBe("convenzionato");
    expect(dettaglioFornitoreSchema.shape.convenzionato.parse(undefined)).toBe(false);
  });
  it("in blocco: almeno 1, al massimo 5000 fornitori", () => {
    expect(impostaConvenzionatoInput.safeParse({ ids: [], valore: true }).success).toBe(false);
    const id = "00000000-0000-4000-8000-000000000000";
    expect(impostaConvenzionatoInput.safeParse({ ids: Array(5001).fill(id), valore: true }).success).toBe(false);
    expect(impostaConvenzionatoInput.safeParse({ ids: [id], valore: false }).success).toBe(true);
  });
  it("filtro convenzionato: null = tutti; nell'URL default 'tutti'", () => {
    expect(elencoFornitoriInput.parse({ convenzionato: null }).convenzionato).toBeNull();
    expect(elencoFornitoriInput.parse({ convenzionato: true }).convenzionato).toBe(true);
    expect(ricercaFornitori.parse({}).convenzionato).toBe("tutti");
  });
  it("toast con i conteggi dell'RPC, conflitti Gamma servizi segnalati", () => {
    expect(messaggioConvenzione(true, { aggiornati: 2, impostatiMerci: 1, inConflitto: 1 }))
      .toBe("2 segnati convenzionati · 1 impostati come Merci · 1 in Gamma risultano di servizi: verificare");
    expect(messaggioConvenzione(false, { aggiornati: 3, impostatiMerci: 0, inConflitto: 0 })).toBe("3 fornitori non più convenzionati");
  });
});
