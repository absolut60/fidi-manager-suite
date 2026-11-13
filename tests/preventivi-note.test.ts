import { describe, expect, it } from "bun:test";
import { campiNota, noteDaCopiare } from "@/lib/preventivi-note";
import { preventivoModificabile, puoScriverePreventivi } from "@/lib/permessi-preventivi";

describe("FM67 note e allegati preventivo", () => {
  it("il titolo è rifilato e non può essere vuoto", () => {
    expect(campiNota("  Posa  ", "Testo")).toEqual({ titolo: "Posa", testo: "Testo" });
    expect(() => campiNota("  ", "Testo")).toThrow("Inserisci il titolo");
  });
  it("duplicati, alternative e ordini copiano titolo, testo, ordine senza identità o allegati", () => {
    const originali = [{ titolo: "Posa", testo: "Due mani", ordine: 2 }, { titolo: "Consegna", testo: null, ordine: 3 }];
    expect(noteDaCopiare(originali, "destinazione")).toEqual([
      { preventivo_id: "destinazione", titolo: "Posa", testo: "Due mani", ordine: 2 },
      { preventivo_id: "destinazione", titolo: "Consegna", testo: null, ordine: 3 },
    ]);
  });
  it("store manager consulta senza modificare note e allegati", () => {
    expect(preventivoModificabile({ tipo: "preventivo", stato: "bozza" }, puoScriverePreventivi(["store_manager"]))).toBe(false);
  });
  it("showroom con preventivi_write modifica; showroom solo no", () => {
    expect(preventivoModificabile({ tipo: "preventivo", stato: "bozza" }, puoScriverePreventivi(["showroom", "preventivi_write"]))).toBe(true);
    expect(preventivoModificabile({ tipo: "preventivo", stato: "bozza" }, puoScriverePreventivi(["showroom"]))).toBe(false);
  });
  it("note e allegati di confermati e ordini sono in sola lettura anche per amministratore", () => {
    const scrive = puoScriverePreventivi(["amministratore"]);
    expect(preventivoModificabile({ tipo: "preventivo", stato: "confermato" }, scrive)).toBe(false);
    expect(preventivoModificabile({ tipo: "ordine", stato: "bozza" }, scrive)).toBe(false);
  });
});
