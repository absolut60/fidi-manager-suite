import { describe, expect, test } from "bun:test";
import { fontePrezzoTesto, scontiAcquistoTesto, trasportoAcquistoTesto } from "../src/lib/riepilogo-articolo";

describe("riepilogo articolo", () => {
  test("sconti acquisto in forma Gamma", () => {
    expect(scontiAcquistoTesto({ acq_sc1: 17, acq_sc2: 5, acq_sc3: 0 })).toBe("17+5");
    expect(scontiAcquistoTesto({ acq_sc1: 12.5, acq_sc2: null, acq_sc3: 3 })).toBe("12,5+3");
    expect(scontiAcquistoTesto({ acq_sc1: 0, acq_sc2: 0, acq_sc3: 0 })).toBe("—");
    expect(scontiAcquistoTesto(null)).toBe("—");
  });
  test("trasporto percentuale e/o euro", () => {
    expect(trasportoAcquistoTesto({ acq_trasporto_perc: 3, acq_trasporto_euro: 0 })).toBe("3%");
    expect(trasportoAcquistoTesto({ acq_trasporto_perc: 2, acq_trasporto_euro: 0.5 })).toBe("2% + 0,5000 €");
    expect(trasportoAcquistoTesto({ acq_trasporto_perc: 0, acq_trasporto_euro: 0 })).toBe("—");
  });
  test("fonte prezzo leggibile", () => {
    expect(fontePrezzoTesto("deposito")).toBe("Prezzo del deposito della sede del cliente");
    expect(fontePrezzoTesto("cliente_articolo")).toBe("Prezzo speciale del cliente per questo articolo");
    expect(fontePrezzoTesto(null, ["cliente_senza_listino"])).toBe("Il cliente non ha un listino in Gamma");
    expect(fontePrezzoTesto(null)).toBe("Prezzo non disponibile per questo cliente");
  });
});
