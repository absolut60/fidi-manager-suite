import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { patchConFontePrezzo, patchConImporto, prezzoConPrioritaCantiere, prezzoNonDiListino, segnoPrezzoCantiere, spunteInizialiListini } from "../src/lib/riga-preventivo";

describe("FM69 fonte prezzo", () => {
  const r = { tipo_riga: "articolo_singolo", fonte_prezzo: "cantiere", prezzo_unit: 6.5, quantita: 2, sconti_gamma: [], maggiorazione_perc: 0 };
  it("scelta articolo e kit registrano la fonte della priorità", () => {
    const dedicato = { prezzo_vendita_speciale: 6.5, sconti: [], maggiorazione_perc: 0, costo_netto_speciale: 3.1 };
    expect(patchConFontePrezzo(r, { prezzo_unit: 6.5 }, prezzoConPrioritaCantiere(null, dedicato).fonte).fonte_prezzo).toBe("cantiere");
    expect(patchConFontePrezzo(r, { prezzo_unit: 12 }, prezzoConPrioritaCantiere(null).fonte).fonte_prezzo).toBe("listino");
  });
  for (const patch of [{ prezzo_unit: 8 }, { sconti_gamma: [5] }, { maggiorazione_perc: 3 }]) {
    it(`modifica ${Object.keys(patch)[0]} diventa manuale`, () => {
      expect(patchConImporto(r, patch).fonte_prezzo).toBe("manuale");
    });
  }
  for (const patch of [{ quantita: 3 }, { incidenza: 2 }, { sconto_perc: 10 }, { um_scelta: "um2" }, { descrizione: "Nuova" }, { costo: 9 }]) {
    it(`${Object.keys(patch)[0]} non cambia fonte`, () => {
      expect({ ...r, ...patchConFontePrezzo(r, patch) }.fonte_prezzo).toBe("cantiere");
      expect({ ...r, ...patchConImporto(r, patch, 2) }.fonte_prezzo).toBe("cantiere");
    });
  }
  it("righe manuali sono manuali anche all’inserimento o cambio tipo", () => {
    expect(patchConFontePrezzo({}, { tipo_riga: "manuale" }).fonte_prezzo).toBe("manuale");
    expect(patchConImporto(r, { tipo_riga: "manuale" }).fonte_prezzo).toBe("manuale");
  });
  it("aggiornamento scelto sostituisce manuale con fonte listino/cantiere", () => {
    expect(patchConImporto({ ...r, fonte_prezzo: "manuale" }, patchConFontePrezzo(r, { prezzo_unit: 6.5 }, "cantiere")).fonte_prezzo).toBe("cantiere");
  });
  it("manuali non spuntate, listino/cantiere/NULL spuntate", () => {
    const righe = [{ riga_id: "m", fonte_attuale: "manuale" }, { riga_id: "l", fonte_attuale: "listino" }, { riga_id: "c", fonte_attuale: "cantiere" }, { riga_id: "n", fonte_attuale: null }];
    expect([...spunteInizialiListini(righe)]).toEqual(["l", "c", "n"]);
    expect(prezzoNonDiListino("manuale")).toBe(true);
    expect(prezzoNonDiListino(null)).toBe(false);
  });
  it("segno segue fonte e usa i valori soltanto con NULL", () => {
    const c = { prezzo_vendita_speciale: 6.5, sconti: [], maggiorazione_perc: 0, costo_netto_speciale: null };
    expect(segnoPrezzoCantiere({ ...r, prezzo_unit: 8 }, c)).toBe(true);
    expect(segnoPrezzoCantiere({ ...r, fonte_prezzo: "manuale" }, c)).toBe(false);
    expect(segnoPrezzoCantiere({ ...r, fonte_prezzo: "listino" }, c)).toBe(false);
    expect(segnoPrezzoCantiere({ ...r, fonte_prezzo: null }, c)).toBe(true);
    expect(segnoPrezzoCantiere({ ...r, fonte_prezzo: null, prezzo_unit: 8 }, c)).toBe(false);
  });
  it("duplicazione copia la fonte della riga senza normalizzare NULL", () => {
    const codice = readFileSync(new URL("../src/lib/preventivi-api.ts", import.meta.url), "utf8");
    const duplicazione = codice.slice(codice.indexOf("export async function duplicaPreventivo"), codice.indexOf("export async function insertBlocco"));
    expect(duplicazione).toContain("fonte_prezzo: r.fonte_prezzo,");
  });
});