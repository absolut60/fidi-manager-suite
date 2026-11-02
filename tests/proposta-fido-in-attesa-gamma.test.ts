import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { motivoNascostoProposta, righeVisibiliProposta, riepilogoVisibilita, CATEGORIE_PROPOSTA_DEFAULT } from "@/lib/proposta-fido-visibilita";
import { testoInAttesaGammaBreve, testoInAttesaGammaScheda, type FidoInAttesaGamma } from "@/lib/fido-teorico";

// Caso reale GENCO COSTRUZIONI SRL: approvato 5.000 €, Gamma ancora a 500.
const genco: FidoInAttesaGamma = { richiesta_id: "3e9f4070", importo_approvato: 5000, data_export: "2026-11-02T10:59:10Z" };
const filtri = { tipi: CATEGORIE_PROPOSTA_DEFAULT };
const base = { tipo: "aumento", regola: "calcolo", proponibile: true, fido_attuale: 500, fido_proposto: 5000 };
const gencoRiga = { ...base, cliente_id: "genco", inAttesaGamma: genco };
const altri = [
  { ...base, cliente_id: "a1" },
  { ...base, cliente_id: "d1", tipo: "diminuzione", fido_attuale: 5000, fido_proposto: 3000 },
  { ...base, cliente_id: "r1", tipo: "rinnovo", fido_attuale: 3000, fido_proposto: 3000 },
];

describe("Massiva: fidi già approvati in attesa di Gamma", () => {
  it("GENCO approvato e non ancora in Gamma: nascosto con motivo in_attesa_gamma", () => {
    expect(motivoNascostoProposta(gencoRiga, filtri)).toBe("in_attesa_gamma");
    expect(righeVisibiliProposta([gencoRiga], filtri, new Set())).toHaveLength(0);
  });
  it("resta nascosto anche se toccato o forzato visibile", () => {
    expect(righeVisibiliProposta([gencoRiga], filtri, new Set(["genco"]), new Set(["genco"]))).toHaveLength(0);
  });
  it("senza dato dalla fonte SQL (es. G-ETRADE, Gamma già cambiato) la riga torna normale", () => {
    const getrade = { ...base, cliente_id: "getrade" };
    expect(motivoNascostoProposta(getrade, filtri)).toBeNull();
    expect(righeVisibiliProposta([getrade], filtri, new Set())).toHaveLength(1);
  });
  it("riepilogo: voce dedicata e conteggi degli altri clienti invariati", () => {
    const senza = riepilogoVisibilita(altri, filtri, new Set());
    const con = riepilogoVisibilita([...altri, gencoRiga], filtri, new Set());
    expect(con.nascosti.in_attesa_gamma).toBe(1);
    expect(con.totale).toBe(senza.totale + 1);
    expect(con.visibili).toBe(senza.visibili);
    expect(con.altriRinnovi).toBe(senza.altriRinnovi);
    expect(con.daDecidere).toBe(senza.daDecidere);
    expect(con.nascosti.rinnovo).toBe(senza.nascosti.rinnovo);
    expect(con.visibili + Object.values(con.nascosti).reduce((a, b) => a + b, 0) + con.nonProponibiliTotale).toBe(con.totale);
  });
  it("richiesta in corso ha precedenza sul motivo in attesa di Gamma", () => {
    expect(motivoNascostoProposta({ ...gencoRiga, richiestaInCorso: {} }, filtri)).toBe("in_corso");
  });
  it("testi del badge e della scheda cliente", () => {
    expect(testoInAttesaGammaBreve(genco).replace(/\s/g, " ")).toBe("Approvato 5.000 €, in attesa di Gamma");
    expect(testoInAttesaGammaScheda(genco).replace(/\s/g, " ")).toBe("Fido approvato 5.000 € il 02/11, in attesa di caricamento in Gamma");
  });
});

describe("SQL fidi_approvati_in_attesa_gamma: regola", () => {
  const sql = readFileSync("drizzle/migrations/0134_fm55_fidi_approvati_in_attesa_gamma.sql", "utf8");
  it("ultima approvata con importo ed export, diverso dal fido Gamma", () => {
    expect(sql).toContain("r.stato::text = 'approvata'");
    expect(sql).toContain("r.importo_approvato IS NOT NULL");
    expect(sql).toContain("r.data_export IS NOT NULL");
    expect(sql).toContain("DISTINCT ON (r.cliente_id)");
    expect(sql).toContain("r.imp IS DISTINCT FROM c.fido_gestionale");
  });
  it("Gamma cambiato dopo l'export (caso G-ETRADE) esclude il cliente", () => {
    expect(sql).toContain("a.created_at > r.data_export");
    expect(sql).toContain("(a.dettagli -> 'campi') ? 'fido_gestionale'");
  });
  it("niente accesso anonimo", () => {
    expect(sql).toContain("FROM PUBLIC, anon");
  });
});
