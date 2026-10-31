import { describe, expect, test } from "bun:test";
import { riepilogoProposte } from "@/lib/proposta-fido-riepilogo";

describe("riepilogoProposte (piede proposta massiva)", () => {
  test("totali e differenza sulle righe incluse", () => {
    const r = riepilogoProposte([
      { fido_attuale: 10000, fido_proposto: 15000, tipo: "aumento" },
      { fido_attuale: 20000, fido_proposto: 12000, tipo: "diminuzione" },
      { fido_attuale: 0, fido_proposto: 5000, tipo: "nuovo_fido" },
      { fido_attuale: 8000, fido_proposto: 8000, tipo: "rinnovo" },
    ]);
    expect(r.totaleAttuale).toBe(38000);
    expect(r.totaleProposto).toBe(40000);
    expect(r.differenza).toBe(2000);
  });

  test("dettaglio solo per i tipi presenti, con segno corretto", () => {
    const r = riepilogoProposte([
      { fido_attuale: 10000, fido_proposto: 15000, tipo: "aumento" },
      { fido_attuale: 20000, fido_proposto: 25000, tipo: "aumento" },
      { fido_attuale: 20000, fido_proposto: 12000, tipo: "diminuzione" },
      { fido_attuale: 8000, fido_proposto: 8000, tipo: "rinnovo" },
    ]);
    expect(r.dettaglio).toEqual([
      { tipo: "aumento", n: 2, somma: 10000 },
      { tipo: "diminuzione", n: 1, somma: -8000 },
    ]);
  });

  test("differenza negativa quando prevalgono le diminuzioni", () => {
    const r = riepilogoProposte([
      { fido_attuale: 50000, fido_proposto: 30000, tipo: "diminuzione" },
      { fido_attuale: 10000, fido_proposto: 12000, tipo: "aumento" },
    ]);
    expect(r.differenza).toBe(-18000);
    expect(r.dettaglio.find((d) => d.tipo === "diminuzione")?.somma).toBe(-20000);
  });

  test("elenco vuoto: tutto a zero, nessun dettaglio", () => {
    const r = riepilogoProposte([]);
    expect(r.totaleAttuale).toBe(0);
    expect(r.totaleProposto).toBe(0);
    expect(r.differenza).toBe(0);
    expect(r.dettaglio).toEqual([]);
  });
});
