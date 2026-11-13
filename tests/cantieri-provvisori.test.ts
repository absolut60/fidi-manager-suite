import { describe, expect, test } from "bun:test";
import { contaCantieriMarketing, passaFiltroProvvisorio } from "../src/lib/cantieri-provvisori";

const righe = [{ provvisorio: true, attivo: true }, { provvisorio: false, attivo: true }, { provvisorio: null, attivo: false }];
describe("FM65 B3 cantieri provvisori", () => {
  test("filtro Tutti / Solo provvisori / Solo confermati", () => {
    expect(righe.filter((c) => passaFiltroProvvisorio(c, "tutti")).length).toBe(3);
    expect(righe.filter((c) => passaFiltroProvvisorio(c, "provvisori")).length).toBe(1);
    expect(righe.filter((c) => passaFiltroProvvisorio(c, "confermati")).length).toBe(2);
  });
  test("profilo marketing esclude i provvisori", () => {
    expect(contaCantieriMarketing(righe)).toEqual({ totali: 2, attivi: 1, chiusi: 1 });
    expect(contaCantieriMarketing([{ provvisorio: true, attivo: true }])).toEqual({ totali: 0, attivi: 0, chiusi: 0 });
  });
});
