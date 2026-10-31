import { describe, it, expect } from "bun:test";
import { contatoriAlert, filtraAlert, type AlertFidoRow } from "@/lib/alert-fidi";

const r = (id: string, tipo: AlertFidoRow["tipo"], livello: number | null, store: string | null): AlertFidoRow => ({
  id, cliente_id: id, tipo, livello, stato: "aperto", aperto_il: "2026-10-01", fido_gamma: 1000, esposizione: 0,
  ordini_aperti: 0, consumo: null, fido_proposto: null, richiesta_id: null, riproponi_dal: null, richiesta: null,
  cliente: { id, codice_gestionale: null, ragione_sociale: id, store_id: store, codice_agente: null, totale_rischio: 0, fido_gestionale: 1000, stores: null },
});
const righe = [
  r("a", "consumo", 0.8, "S1"), r("b", "consumo", 0.9, "S1"), r("c", "consumo", 0.95, "S2"),
  r("d", "riduzione", null, null), r("e", "extra_non_usato", null, "S2"),
];

describe("contatoriAlert", () => {
  it("senza filtri = totale", () =>
    expect(contatoriAlert(filtraAlert(righe, {}))).toEqual({ c80: 1, c90: 2, rid: 1, extra: 1 }));
  it("filtro negozio", () =>
    expect(contatoriAlert(filtraAlert(righe, { negozi: ["S1"] }))).toEqual({ c80: 1, c90: 1, rid: 0, extra: 0 }));
  it("Senza negozio", () =>
    expect(contatoriAlert(filtraAlert(righe, { negozi: ["__none__"] }))).toEqual({ c80: 0, c90: 0, rid: 1, extra: 0 }));
});
