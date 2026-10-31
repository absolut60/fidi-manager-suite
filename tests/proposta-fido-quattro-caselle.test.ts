import { describe, expect, it } from "bun:test";
import { passaFiltriProposta, motivoNascostoProposta, righeVisibiliProposta, riepilogoVisibilita } from "@/lib/proposta-fido-visibilita";

const filtri = { tipi: ["aumento", "diminuzione", "nuovo_fido"] };
const riga = (cliente_id: string, tipo: string, extra: Record<string, unknown> = {}) => ({
  cliente_id, tipo, regola: "calcolo", fido_proposto: 1000, proponibile: true, ...extra,
});

describe("Cosa vuoi mandare: quattro caselle", () => {
  for (const tipo of ["aumento", "diminuzione", "nuovo_fido"]) {
    it(`${tipo}: acceso visibile, spento contato per tipo`, () => {
      const r = riga(tipo, tipo);
      expect(passaFiltriProposta(r, filtri)).toBe(true);
      const spenti = { tipi: filtri.tipi.filter((t) => t !== tipo) };
      expect(passaFiltriProposta(r, spenti)).toBe(false);
      const conto = riepilogoVisibilita([r], spenti, new Set());
      expect(conto.tipiSpenti[tipo]).toBe(1);
      expect(conto.nascosti.tipo_spento).toBe(1);
      expect(conto.visibili).toBe(0);
    });
  }
  it("fido invariato: spento di default, visibile se spuntato", () => {
    const r = riga("r", "rinnovo", { inAlertOAnomalia: true });
    expect(passaFiltriProposta(r, filtri)).toBe(false);
    expect(passaFiltriProposta(r, { tipi: [...filtri.tipi, "rinnovo"] })).toBe(true);
  });
  it("pagamento immediato e riduzioni a zero seguono solo il tipo", () => {
    const r = riga("zero", "diminuzione", { regola: "pagamento_immediato", fido_proposto: 0 });
    expect(passaFiltriProposta(r, filtri)).toBe(true);
    expect(motivoNascostoProposta(r, { tipi: ["aumento"] })).toBe("tipo_spento");
  });
  it("richieste in corso sempre escluse anche se toccate o mostraSempre", () => {
    const righe = [riga("c", "rinnovo", { richiestaInCorso: { id: "richiesta" }, inAlertOAnomalia: true })];
    const scelti = new Set(["c"]);
    expect(righeVisibiliProposta(righe, filtri, scelti, scelti)).toHaveLength(0);
    expect(passaFiltriProposta(righe[0], { tipi: ["rinnovo"] })).toBe(false);
    const conto = riepilogoVisibilita(righe, filtri, scelti, scelti);
    expect(conto.nascosti.in_corso).toBe(1);
    expect(conto.daDecidere).toBe(0);
    expect(conto.visibili).toBe(0);
  });
  it("ogni riga del riquadro ha il suo conteggio senza sovrapposizioni", () => {
    const righe = [
      riga("r1", "rinnovo"), riga("r2", "rinnovo", { inAlertOAnomalia: true }),
      riga("c", "rinnovo", { richiestaInCorso: {}, inAlertOAnomalia: true }),
      riga("a", "aumento"), riga("d", "diminuzione"), riga("n", "nuovo_fido"),
      riga("blocco", "aumento", { proponibile: false, regola: "cliente_bloccato" }),
    ];
    const conto = riepilogoVisibilita(righe, { tipi: [] }, new Set());
    expect(conto.nascosti).toEqual({ rinnovo: 2, in_corso: 1, tipo_spento: 3 });
    expect(conto.daDecidere).toBe(1);
    expect(conto.tipiSpenti).toEqual({ aumento: 1, diminuzione: 1, nuovo_fido: 1 });
    expect(conto.nonProponibili).toEqual({ cliente_bloccato: 1 });
    expect(conto.nonProponibiliTotale).toBe(1);
    expect(conto.totale).toBe(7);
  });
  it("mostraSempre da Alert mantiene visibili i rinnovi senza richiesta", () => {
    const righe = [riga("a", "rinnovo", { inAlertOAnomalia: true }), riga("b", "rinnovo")];
    const scelti = new Set(["a", "b"]);
    expect(righeVisibiliProposta(righe, filtri, new Set(), scelti)).toHaveLength(2);
    const conto = riepilogoVisibilita(righe, filtri, new Set(), scelti);
    expect(conto.visibili).toBe(2);
    expect(conto.nascosti.rinnovo).toBe(0);
    expect(conto.daDecidere).toBe(0);
  });
});