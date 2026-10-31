import { formatEuro } from "@/lib/fidi";
import { describe, expect, it } from "bun:test";
import { segnalazioniRiga, raggruppaSegnalazioni, etichetteSegnalazioni } from "@/lib/fido-segnalazioni";

const base = { fabbisogno: 38555.7, base: 500, ordini_aperti: 35428.7, fido_attuale: 40000, scaduto_oltre: 0, scaduto_oltre_giorni: 0, pagato_12m: 0 };

describe("segnalazioni fido", () => {
  it("ordina per gravità e ignora codici sconosciuti", () => {
    const l = segnalazioniRiga({ ...base, segnalazioni: ["ordine_fuori_giro", "xyz", "scaduto_non_incassato", "impegni_sopra_base"] });
    expect(l.map((s) => s.codice)).toEqual(["scaduto_non_incassato", "impegni_sopra_base", "ordine_fuori_giro"]);
    expect(l[0].gravita).toBe("rossa");
  });
  it("uso pieno → Fido in esaurimento", () => {
    const l = raggruppaSegnalazioni({ ...base, fabbisogno: 34000, segnalazioni: ["uso_pieno"] });
    expect(l[0].etichetta).toBe("Fido in esaurimento");
    expect(l[0].testo).toBe("Usa il 85% del fido");
  });
  it("scaduto da incassare: percentuale sul pagato 12 mesi", () => {
    const l = segnalazioniRiga({ ...base, scaduto_oltre: 27740.69, scaduto_oltre_giorni: 31, pagato_12m: 532973.65, segnalazioni: ["scaduto_da_incassare"] });
    expect(l[0].gravita).toBe("arancione");
    expect(l[0].testo).toContain("pari al 5% di quanto pagato in 12 mesi");
  });
  it("ordine fuori giro e oltre tetto: arancioni, ordinati dopo impegni sopra base", () => {
    const l = segnalazioniRiga({ ...base, ordini_fuori: 35278, acquisto_mensile: 150.62, tetto: 750, valore_senza_tetto: 3278, segnalazioni: ["oltre_tetto", "ordine_fuori_giro", "impegni_sopra_base"] });
    expect(l.map((s) => s.codice)).toEqual(["impegni_sopra_base", "ordine_fuori_giro", "oltre_tetto"]);
    expect(l.every((s) => s.gravita === "arancione")).toBe(true);
  });

  const an = { ...base, fabbisogno: 452888, base: 260000, ordini_fuori: 94690, tetto: 390000 };
  it("raggruppa con 1 codice", () => {
    const l = raggruppaSegnalazioni({ ...an, segnalazioni: ["ordine_fuori_giro"] });
    expect(l).toHaveLength(1);
    expect(l[0].etichetta).toBe("Acquisti sopra il previsto");
    expect(l[0].testo).toBe(`Ordini oltre un mese di acquisti: ${formatEuro(94690)} — da autorizzare`);
  });
  it("raggruppa con 2 codici", () => {
    const l = raggruppaSegnalazioni({ ...an, segnalazioni: ["oltre_tetto", "impegni_sopra_base"] });
    expect(l).toHaveLength(1);
    expect(l[0].testo).toBe(`Ci deve ${formatEuro(452888 - 35428.7)} e ha ordini clienti aperti per ${formatEuro(35428.7)}, contro un fido giusto di ${formatEuro(260000)}; supera i ${formatEuro(390000)} che il sistema propone da solo — da autorizzare`);
  });
  it("raggruppa con 3 codici (A.N. COSTRUZIONI) e lascia gli altri separati", () => {
    const l = raggruppaSegnalazioni({ ...an, segnalazioni: ["scaduto_da_incassare", "impegni_sopra_base", "ordine_fuori_giro", "oltre_tetto"] });
    expect(l.map((s) => s.etichetta)).toEqual(["Scaduto da incassare", "Acquisti sopra il previsto"]);
    expect(l[1].testo).toBe(`Ci deve ${formatEuro(452888 - 35428.7)} e ha ordini clienti aperti per ${formatEuro(35428.7)}, contro un fido giusto di ${formatEuro(260000)}; ordini oltre un mese di acquisti: ${formatEuro(94690)}; supera i ${formatEuro(390000)} che il sistema propone da solo — da autorizzare`);
    expect(etichetteSegnalazioni(["oltre_tetto", "scaduto_da_incassare", "impegni_sopra_base"])).toEqual(["Scaduto da incassare", "Acquisti sopra il previsto"]);
  });
});
