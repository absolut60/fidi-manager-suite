import { describe, expect, it } from "vitest";
import { badgeTipoFornitore, tipiFornitoreValidi, tipoModificabile, daControllareInProposta } from "../src/lib/scheda-fornitore";
import { elencoFornitoriInput, classificaFornitoriInput, dettaglioFornitoreSchema } from "../src/lib/fornitori";

const uuid = "00000000-0000-4000-8000-000000000001";
describe("classificazione merci/servizi (FM62 F6)", () => {
  it("badge: Merci/Servizi con 'da Gamma' solo se decide Gamma", () => {
    expect(badgeTipoFornitore("merci", "gamma")).toEqual({ tono: "merci", testo: "Merci", daGamma: true });
    expect(badgeTipoFornitore("servizi", "app")).toEqual({ tono: "servizi", testo: "Servizi", daGamma: false });
    expect(badgeTipoFornitore("da_classificare", "nessuna")).toEqual({ tono: "nd", testo: "Da classificare", daGamma: false });
  });
  it("il tipo deciso in Gamma non si modifica nell'app", () => {
    expect(tipoModificabile("gamma")).toBe(false);
    expect(tipoModificabile("app")).toBe(true);
    expect(tipoModificabile("nessuna")).toBe(true);
  });
  it("filtro URL: valori validi e link vecchi con macrocategoria convertiti", () => {
    expect(tipiFornitoreValidi(["merci", "x", 3])).toEqual(["merci"]);
    expect(tipiFornitoreValidi([], ["01", "nd"])).toEqual(["merci", "da_classificare"]);
    expect(tipiFornitoreValidi(["servizi"], ["01"])).toEqual(["servizi"]);
  });
  it("proposta: da controllare a mano solo i da classificare senza articoli", () => {
    expect(daControllareInProposta({ tipo_effettivo: "da_classificare", n_articoli: 0 })).toBe(true);
    expect(daControllareInProposta({ tipo_effettivo: "da_classificare", n_articoli: 4 })).toBe(false);
    expect(daControllareInProposta({ tipo_effettivo: "merci", n_articoli: 0 })).toBe(false);
  });
  it("input: tipi ammessi e classificazione solo merci/servizi, max 5000", () => {
    expect(elencoFornitoriInput.parse({ tipi: ["da_classificare"] }).tipi).toEqual(["da_classificare"]);
    expect(() => elencoFornitoriInput.parse({ tipi: ["altro"] })).toThrow();
    expect(() => classificaFornitoriInput.parse({ ids: [uuid], tipo: "da_classificare" })).toThrow();
    expect(() => classificaFornitoriInput.parse({ ids: [], tipo: "merci" })).toThrow();
    expect(() => classificaFornitoriInput.parse({ ids: Array(5001).fill(uuid), tipo: "merci" })).toThrow();
    expect(classificaFornitoriInput.parse({ ids: [uuid], tipo: "servizi" }).tipo).toBe("servizi");
  });
  it("dettaglio: tipo sconosciuto o mancante ricade su 'da classificare'", () => {
    const shape = dettaglioFornitoreSchema.shape;
    expect(shape.tipo_effettivo.parse(undefined)).toBe("da_classificare");
    expect(shape.tipo_fonte.parse("boh")).toBe("nessuna");
  });
});
