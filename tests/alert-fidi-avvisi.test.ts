import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { giaDecisoAvviso } from "@/lib/alert-fidi";
import { alertPerNegozio, messaggioConsumoAlert, type AlertEmail } from "@/lib/alert-fidi-email";
import { buildVariazioniBloccoEmail } from "@/lib/variazioni-blocco-email-render";

const SQL = readFileSync("drizzle/migrations/0128_fm55_alert_fidi_gia_deciso_notifiche.sql", "utf8");
const OGGI = "2026-11-01";
const prot = (o: Partial<{ protezione_valida: boolean; protetto_fino_al: string; importo_approvato: number }> = {}) => ({
  protezione_valida: true, protetto_fino_al: "2026-11-30", importo_approvato: 3000, ...o,
});

describe("già deciso negli avvisi (gemello di public.alert_fido_gia_deciso)", () => {
  test("protetto con Gamma uguale → già deciso", () => expect(giaDecisoAvviso(prot(), 3000, OGGI)).toBe(true));
  test("protetto con Gamma diverso → da notificare", () => expect(giaDecisoAvviso(prot(), 5000, OGGI)).toBe(false));
  test("protezione decaduta → da notificare", () => expect(giaDecisoAvviso(prot({ protezione_valida: false }), 3000, OGGI)).toBe(false));
  test("protezione scaduta di data → da notificare", () => expect(giaDecisoAvviso(prot({ protetto_fino_al: "2026-10-31" }), 3000, OGGI)).toBe(false));
  test("nessuna protezione → da notificare", () => expect(giaDecisoAvviso(null, 3000, OGGI)).toBe(false));
  test("SQL applica le stesse tre condizioni e la funzione esclude i già decisi", () => {
    expect(SQL).toContain("p.protezione_valida IS TRUE");
    expect(SQL).toContain("p.protetto_fino_al >= (now() AT TIME ZONE 'Europe/Rome')::date");
    expect(SQL).toContain("COALESCE(c.fido_gestionale, 0)::numeric = p.importo_approvato");
    expect(SQL).toContain("AND NOT public.alert_fido_gia_deciso(af.cliente_id)");
  });
});

describe("testo del consumo solo sul debito", () => {
  test("senza ordini", () => {
    expect(messaggioConsumoAlert({ consumo: 0.869, esposizione: 2608.12, fido_gamma: 3000, fido_proposto: 0, ordini_aperti: 0 }))
      .toBe("Ci deve il 87% del fido: 2.608 € su 3.000 €. Fido teorico 0 €.");
  });
  test("con ordini", () => {
    expect(messaggioConsumoAlert({ consumo: 0.869, esposizione: 2608.12, fido_gamma: 3000, fido_proposto: 0, ordini_aperti: 120.78 }))
      .toBe("Ci deve il 87% del fido: 2.608 € su 3.000 €. Fido teorico 0 €. Ordini in arrivo 121 €.");
  });
  test("lo stesso testo è nel SQL, senza più debito + ordini né «Fido proposto»", () => {
    expect(SQL).toContain("'Ci deve il %s%% del fido: %s € su %s €. Fido teorico %s €.'");
    expect(SQL).toContain("' Ordini in arrivo %s €.'");
    expect(SQL).not.toContain("Fido proposto");
  });
});

const al = (id: string, store: string | null, nome: string): AlertEmail => ({
  id, store_id: store, negozio: store ? `SEDE ${store}` : null, codice: "C1", ragione_sociale: nome, tipo: "consumo",
  consumo: 0.9, esposizione: 900, ordini_aperti: 0, fido_gamma: 1000, fido_proposto: 0, motivi: ["Cliente con scaduto"],
});

describe("email unica per negozio", () => {
  test("raggruppa per negozio e scarta gli alert senza negozio", () => {
    const g = alertPerNegozio([al("1", "A", "X"), al("2", "B", "Y"), al("3", "A", "Z"), al("4", null, "W")]);
    expect([...g.keys()].sort()).toEqual(["A", "B"]);
    expect(g.get("A")!.map((a) => a.id)).toEqual(["1", "3"]);
  });
  test("sezioni vuote assenti: solo alert", () => {
    const { oggetto, html } = buildVariazioniBloccoEmail({
      negozioNome: "SEDE A", bloccati: [], sbloccati: [], appUrl: "https://x", dataRilevazione: "2026-11-01T10:00:00Z", alertFidi: [al("1", "A", "X")],
    });
    expect(oggetto).toStartWith("Alert fidi — SEDE A");
    expect(html).toContain("Alert fidi (1)");
    expect(html).toContain("/alert-fidi");
    expect(html).not.toContain("Clienti bloccati / sbloccati");
    expect(html).not.toContain("Entrati / usciti dal legale");
  });
  test("tutte e tre le sezioni", () => {
    const c = [{ codice: "1", ragione_sociale: "A" }];
    const { html } = buildVariazioniBloccoEmail({
      negozioNome: "SEDE A", bloccati: c, sbloccati: [], inLegale: c, appUrl: "https://x", dataRilevazione: new Date(), alertFidi: [al("1", "A", "X")],
    });
    for (const t of ["Clienti bloccati / sbloccati", "Entrati / usciti dal legale", "Alert fidi (1)"]) expect(html).toContain(t);
  });
});
