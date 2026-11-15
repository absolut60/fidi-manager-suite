import { expect, test } from "bun:test";
import { campiCondizioniCommercialiLead } from "@/lib/lead-condizioni-commerciali";
const valori = { condizione_pagamento_cod: "RB60", listino_rif: 10, macrocategoria_rif: "01", categoria_rif: "02" };
test("FM72 riferimento lead acceso deve essere completo", () => {
  expect(campiCondizioniCommercialiLead(["preventivi_read"], true, valori)).toEqual(valori);
  for (const campo of ["listino_rif", "macrocategoria_rif", "categoria_rif"] as const) {
    expect(() => campiCondizioniCommercialiLead(["preventivi_read"], true, { ...valori, [campo]: null })).toThrow("Completa listino, macrocategoria e categoria di riferimento, oppure spegni il riferimento");
  }
});
test("FM72 riferimento spento azzera tutti e tre i campi", () => {
  expect(campiCondizioniCommercialiLead(["showroom"], false, valori)).toEqual({ condizione_pagamento_cod: "RB60", listino_rif: null, macrocategoria_rif: null, categoria_rif: null });
});
test("FM72 utenti senza consultazione non scrivono nessuno dei quattro campi, neppure incompleti", () => {
  expect(campiCondizioniCommercialiLead(["marketing", "agente"], true, { ...valori, categoria_rif: null })).toEqual({});
});