import { describe, expect, test } from "bun:test";
import { isClienteAttivo } from "@/hooks/use-config";
import { motivoRigaProposta, inclusoInizialeProposta } from "@/lib/proposta-fido-visibilita";

// Stessi casi verificati su public.cliente_attivo(date, numeric) con cutoff 2026 (FM55 fetta 6).
export const CASI_CLIENTE_ATTIVO: Array<[string | null, number | null, boolean]> = [
  [null, null, false],
  [null, 0, false],
  ["2025-12-31", 0, false],
  ["2025-12-31", -10, false],
  ["2026-01-01", 0, true],
  ["2026-10-15", null, true],
  [null, 120, true],
  ["2024-05-01", 0.01, true],
];

describe("isClienteAttivo (gemello di public.cliente_attivo)", () => {
  const config = { cutoff_cliente_attivo_anno: 2026 } as Parameters<typeof isClienteAttivo>[2];
  for (const [data, doc, atteso] of CASI_CLIENTE_ATTIVO) {
    test(`${data ?? "nessuna fattura"} / doc ${doc ?? "null"} → ${atteso ? "attivo" : "non attivo"}`, () => {
      expect(isClienteAttivo(data, doc, config)).toBe(atteso);
    });
  }
});

describe("massiva: cliente non attivo", () => {
  const spiegazione = "Cliente non attivo: nessuna fattura dal 01/01/2026, fido teorico zero.";
  test("frase semplice, riga bianca e coda senza acquisti", () => {
    const r = motivoRigaProposta({ regola: "calcolo", segnalazioni: [], dati: { fidoAttuale: 500, consigliato: 0, esposizione_corrente: 0, acquisto_mensile: 0, spiegazione } });
    expect(r.motivo).toBeNull();
    expect(r.frase).toBe("Cliente non attivo: proposta a zero. Nessun acquisto recente.");
  });
  test("riga spuntata (non è un'anomalia)", () => {
    expect(inclusoInizialeProposta({ proponibile: true, rossa: false, regola: "calcolo", fidoAttuale: 500, fidoProposto: 0, segnalazioni: [] })).toBe(true);
  });
});
