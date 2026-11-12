import { describe, expect, it } from "bun:test";
import { impostaStatoConvenzioneInput, elencoFornitoriInput, dettaglioFornitoreSchema } from "../src/lib/fornitori";
import { messaggioConvenzione, tipoModificabile, ricercaFornitori, statiConvenzioneValidi } from "../src/lib/scheda-fornitore";
import { puoCambiareConvenzione } from "../src/lib/permessi-fornitori";

const id = "00000000-0000-4000-8000-000000000000";
describe("FM62 F7 stato convenzione fornitori", () => {
  it("solo l'amministratore cambia la convenzione", () => {
    expect(puoCambiareConvenzione(["amministratore"])).toBe(true);
    expect(puoCambiareConvenzione(["amministrazione"])).toBe(false);
    expect(puoCambiareConvenzione(["preventivi_manage"])).toBe(false);
  });
  it("il tipo non si cambia a mano se deciso da Gamma o dalla convenzione", () => {
    expect(tipoModificabile("convenzionato")).toBe(false);
    expect(tipoModificabile("gamma")).toBe(false);
    expect(tipoModificabile("app")).toBe(true);
  });
  it("dettaglio: stato sconosciuto ricade su non_convenzionato", () => {
    expect(dettaglioFornitoreSchema.shape.stato_convenzione.parse("boh")).toBe("non_convenzionato");
    expect(dettaglioFornitoreSchema.shape.tipo_fonte.parse("convenzionato")).toBe("convenzionato");
  });
  it("in blocco: solo stati ammessi, 1..5000 fornitori", () => {
    expect(impostaStatoConvenzioneInput.safeParse({ ids: [id], stato: "convenzionato" }).success).toBe(true);
    expect(impostaStatoConvenzioneInput.safeParse({ ids: [id], stato: "altro" }).success).toBe(false);
    expect(impostaStatoConvenzioneInput.safeParse({ ids: [], stato: "convenzionato" }).success).toBe(false);
    expect(impostaStatoConvenzioneInput.safeParse({ ids: Array(5001).fill(id), stato: "convenzionato" }).success).toBe(false);
  });
  it("filtro Convenzione a scelta multipla, vuoto = tutti; valori sconosciuti scartati", () => {
    expect(ricercaFornitori.parse({}).convenzione).toEqual([]);
    expect(statiConvenzioneValidi(["convenzionato", "x"])).toEqual(["convenzionato"]);
    expect(elencoFornitoriInput.parse({ statiConvenzione: ["non_convenzionato"] }).statiConvenzione).toEqual(["non_convenzionato"]);
  });
  it("toast con i conteggi dell'RPC", () => {
    expect(messaggioConvenzione("convenzionato", { aggiornati: 2, impostatiMerci: 1, inConflitto: 1 }))
      .toBe("2 segnati convenzionati · 1 impostati come Merci · 1 in Gamma risultano di servizi: verificare");
    expect(messaggioConvenzione("non_convenzionato", { aggiornati: 3, impostatiMerci: 0, inConflitto: 0 })).toBe("3 fornitori non più convenzionati");
  });
});
