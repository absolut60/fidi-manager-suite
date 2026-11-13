import { describe, expect, test } from "bun:test";
import { letteraPreventivo, lettereElenco, riallineaValidita, validitaProposta } from "../src/lib/preventivo-creazione";
import { inUnita } from "../src/lib/scheda-articolo";

describe("FM65 R1a", () => {
  test("validità proposta sette giorni dopo la data", () => {
    expect(validitaProposta("2026-11-13")).toBe("2026-11-20");
    expect(validitaProposta("2026-12-28")).toBe("2027-01-04");
  });
  test("validità segue la data solo prima della modifica manuale", () => {
    expect(riallineaValidita("2026-11-14", "2026-11-20", false)).toBe("2026-11-21");
    expect(riallineaValidita("2026-11-14", "2026-11-30", true)).toBe("2026-11-30");
  });
  test("principale A e alternative ordinate per data e id", () => {
    const righe = [{ id: "c", created_at: "2026-11-14T00:00:00Z" }, { id: "b", created_at: "2026-11-13T00:00:00Z" }, { id: "a", created_at: "2026-11-13T00:00:00Z" }];
    expect(letteraPreventivo({ id: "p", alternativa_di: null }, [])).toBe("A");
    expect(letteraPreventivo({ id: "a", alternativa_di: "p" }, righe)).toBe("B");
    expect(letteraPreventivo({ id: "b", alternativa_di: "p" }, righe)).toBe("C");
    expect(letteraPreventivo({ id: "c", alternativa_di: "p" }, righe)).toBe("D");
  });
  test("oltre Z, AA e AB senza salvare lettere", () => {
    const righe = Array.from({ length: 27 }, (_, i) => ({ id: String(i).padStart(2, "0"), created_at: "2026-11-13T00:00:00Z" }));
    expect(letteraPreventivo({ id: "25", alternativa_di: "p" }, righe)).toBe("AA");
    expect(letteraPreventivo({ id: "26", alternativa_di: "p" }, righe)).toBe("AB");
  });
  test("UM2 è presentazione: quantità e prezzo si compensano", () => {
    const q = inUnita(25.2, "quantita", "secondaria", 3.6);
    const p = inUnita(4.167, "prezzo", "secondaria", 3.6);
    expect(q).toBeCloseTo(7, 10);
    expect(p).toBeCloseTo(15.0012, 10);
    expect(Number(q) * Number(p)).toBeCloseTo(25.2 * 4.167, 10);
  });
});
describe("FM65 Punto 5 lettereElenco", () => {
  test("principale A, alternative B/C per created_at e id, gruppo senza alternative", () => {
    const m = lettereElenco([
      { id: "p1", alternativa_di: null, created_at: "2026-01-01T00:00:00Z" },
      { id: "z", alternativa_di: "p1", created_at: "2026-01-03T00:00:00Z" },
      { id: "b", alternativa_di: "p1", created_at: "2026-01-02T00:00:00Z" },
      { id: "a", alternativa_di: "p1", created_at: "2026-01-02T00:00:00Z" },
      { id: "p2", alternativa_di: null, created_at: "2026-01-05T00:00:00Z" },
    ]);
    expect(m.get("p1")).toBe("A");
    expect(m.get("a")).toBe("B");
    expect(m.get("b")).toBe("C");
    expect(m.get("z")).toBe("D");
    expect(m.get("p2")).toBe("A");
  });
});
