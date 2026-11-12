import { describe, expect, test } from "bun:test";
import { sitoFornitore, origineLegameFornitore, tabSchedaFornitore, paginaFornitore, filtroSiNo } from "../src/lib/scheda-fornitore";

describe("scheda fornitore", () => {
  test("sito senza protocollo diventa https, http e https conservati", () => {
    expect(sitoFornitore(" www.viglietta.com ")).toBe("https://www.viglietta.com/");
    expect(sitoFornitore("http://example.org/info")).toBe("http://example.org/info");
    expect(sitoFornitore("https://example.org/info")).toBe("https://example.org/info");
    expect(sitoFornitore(null)).toBeNull();
    expect(sitoFornitore(" ")).toBeNull();
  });
  test("sito rifiuta protocolli non web e indirizzi malformati", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,test", "mailto:test@example.org", "https://", "http://a b"]) expect(sitoFornitore(value)).toBeNull();
  });
  test("tab previste e fallback", () => {
    expect(tabSchedaFornitore("articoli")).toBe("articoli");
    expect(tabSchedaFornitore("clienti")).toBe("clienti");
    expect(tabSchedaFornitore("panoramica")).toBe("panoramica");
    expect(tabSchedaFornitore("altro")).toBe("panoramica");
  });
  test("origine Gamma distinta dalla coincidenza fiscale", () => {
    expect(origineLegameFornitore("gamma", "partita_iva")).toBe("Collegato in Gamma");
    expect(origineLegameFornitore("fiscale", "partita_iva")).toBe("Stessa P.IVA/CF · partita_iva");
    expect(origineLegameFornitore("fiscale", null)).toBe("Stessa P.IVA/CF");
  });
  test("pagine intere positive e filtri sì/no", () => {
    expect(paginaFornitore(-1)).toBe(1);
    expect(paginaFornitore(2.8)).toBe(2);
    expect(paginaFornitore(Infinity)).toBe(1);
    expect(filtroSiNo("si")).toBe(true);
    expect(filtroSiNo("no")).toBe(false);
    expect(filtroSiNo("tutti")).toBeNull();
  });
});
describe("macrocategoria fornitore (FM62 F1)", () => {
  test("badge dal dato Gamma", () => {
    expect(badgeMacrocategoria("01", "FORNITORI MERCI")).toEqual({ tono: "merci", testo: "Fornitore merci" });
    expect(badgeMacrocategoria("03", "FORNITORI SERVIZI")).toEqual({ tono: "servizi", testo: "Fornitore servizi" });
    expect(badgeMacrocategoria(null, null)).toEqual({ tono: "nd", testo: "Da classificare" });
    expect(badgeMacrocategoria(" ", "X").tono).toBe("nd");
  });
  test("filtro in URL accetta solo 01, 03, nd", () => {
    expect(macrocategorieValide(["01", "nd", "99", 3])).toEqual(["01", "nd"]);
    expect(macrocategorieValide("01")).toEqual([]);
  });
});
