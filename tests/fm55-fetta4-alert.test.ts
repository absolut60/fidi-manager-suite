import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { debitoOggi, etichettaAvviso, percheAlert, testoOrdiniAlert, teoricoPropostaIniziale, etichettaDecisioneAlert } from "@/lib/alert-fidi";
import { formatEuro } from "@/lib/fidi";

describe("FM55 fetta 4 – consumo solo sul debito", () => {
  const a = { tipo: "consumo" as const, fido_gamma: 25000, esposizione: 6771.55, ordini_aperti: 15929.44 };
  it("debito 27% + ordini: gli ordini non entrano nel debito", () => {
    expect(debitoOggi(a)).toBe(6771.55);
    expect(Math.round((debitoOggi(a) / a.fido_gamma) * 100)).toBe(27);
    expect(debitoOggi(a) / a.fido_gamma < 0.8).toBe(true);
  });
  it("badge e perché sul debito", () => {
    expect(etichettaAvviso({ tipo: "consumo", fido_gamma: 50000, esposizione: 47000 })).toBe("Vicino al limite 94%");
    expect(percheAlert({ tipo: "consumo", fido_gamma: 50000, esposizione: 47000 }, { segnalazioni: ["oltre_normale"] }))
      .toBe("Ci deve il 94% del fido e sta comprando molto più del solito.");
  });
  it("riga ordini arancione: consegnati arriva al 91%", () => {
    expect(testoOrdiniAlert({ fido_gamma: 25000, esposizione: 6771.55, ordini_aperti: 15929.44 }))
      .toBe(`Ordini in arrivo ${formatEuro(15929.44)}: consegnati arriva al 91% del fido`);
    expect(testoOrdiniAlert({ fido_gamma: 25000, esposizione: 100, ordini_aperti: 0 })).toBeNull();
  });
});

describe("FM55 fetta 4 – fido teorico della scheda = valore precompilato", () => {
  it("importo dell'alert prevale, altrimenti riferimento; non proponibile = nessuno", () => {
    expect(teoricoPropostaIniziale(true, 10000, 25000)).toBe(10000);
    expect(teoricoPropostaIniziale(true, undefined, 25000)).toBe(25000);
    expect(teoricoPropostaIniziale(false, 10000, 25000)).toBeNull();
  });
  it("ultima decisione", () => {
    expect(etichettaDecisioneAlert({ id: "r", cliente_id: "c", stato: "approvata", stato_export: "processata", tipo: "rinnovo",
      importo_richiesto: 50000, created_at: "2026-11-01T09:00:00Z", data_processata: "2026-11-01T10:00:00Z" }))
      .toBe(`Ultima decisione: 01/11, confermato ${formatEuro(50000)}`);
  });
});

describe("FM55 fetta 4 – pagina Alert fidi senza «Lascia così»", () => {
  it("nessun pulsante né chiamata Lascia così", () => {
    const src = readFileSync("src/routes/_app/alert-fidi.tsx", "utf8");
    expect(src.includes("Lascia così")).toBe(false);
    expect(src.includes("lasciaCosiRevisione")).toBe(false);
  });
});
