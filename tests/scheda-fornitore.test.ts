import { describe, expect, test } from "bun:test";
import { sitoFornitore, origineLegameFornitore, tabSchedaFornitore, paginaFornitore, filtroSiNo, badgeMacrocategoria, macrocategorieValide } from "../src/lib/scheda-fornitore";

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
    expect(tabSchedaFornitore("panoramica")).toBe("riepilogo");
    expect(tabSchedaFornitore("allegati")).toBe("allegati");
    expect(tabSchedaFornitore("altro")).toBe("riepilogo");
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

import { tabVisibiliFornitore, sottotitoloFornitore } from "../src/lib/scheda-fornitore";
describe("scheda fornitore G1", () => {
  test("nasconde Articoli forniti a chi non vede i costi", () => {
    expect(tabVisibiliFornitore(false)).toEqual(["riepilogo", "anagrafica", "clienti", "attivita", "allegati"]);
    expect(tabVisibiliFornitore(true)).toContain("articoli");
  });
  test("compone il sottotitolo come la scheda cliente", () => {
    expect(sottotitoloFornitore({ codice_gestionale: 1273, partita_iva: "01234567890", citta: "Milano", provincia: "MI" })).toBe("Cod. 1273 — P.IVA 01234567890 — Milano (MI)");
    expect(sottotitoloFornitore({ codice_gestionale: null, partita_iva: null, citta: null, provincia: null })).toBe("");
  });
});
